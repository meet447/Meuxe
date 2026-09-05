use chrono::{DateTime, Duration, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use uuid::Uuid;

use crate::{MeuxeError, Result};

use super::types::{
    is_negative_mood, is_neutral_mood, Bond, BondView, Fact, FactKind, FactSource, MemorySnapshot,
    Moment, Mood, MoodNote, Thread, TurnNotes,
};

const FACT_CAP: usize = 300;
const THREAD_CAP: usize = 8;
const MOMENT_SNAPSHOT_CAP: usize = 50;
const CLOSENESS_BASELINE: f64 = 0.002;
const CLOSENESS_STEP: f64 = 0.015;
const CLOSENESS_DRIFT_PER_DAY: f64 = 0.005;
const CLOSENESS_DRIFT_MIN: f64 = 0.1;
const MOOD_FADE_THRESHOLD: f64 = 0.15;
const NO_FORGIVENESS_THRESHOLD: f64 = 0.45;
const NO_FORGIVENESS_DROP: f64 = 0.35;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Profile {
    facts: Vec<Fact>,
}

/// Legacy JSONL memory row from the old `memory/` store.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyMemory {
    id: String,
    ts: DateTime<Utc>,
    #[serde(rename = "type")]
    memory_type: String,
    summary: String,
    importance: f64,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    metadata: serde_json::Value,
}

/// File-backed companion memory store.
pub struct CompanionMemory {
    data_dir: PathBuf,
    _lock: RwLock<()>,
}

impl CompanionMemory {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            data_dir: data_dir.to_path_buf(),
            _lock: RwLock::new(()),
        }
    }

    pub fn snapshot(&self, character_id: &str, user_id: &str) -> Result<MemorySnapshot> {
        self.snapshot_at(character_id, user_id, Utc::now())
    }

    pub fn snapshot_at(
        &self,
        character_id: &str,
        user_id: &str,
        now: DateTime<Utc>,
    ) -> Result<MemorySnapshot> {
        let _guard = self.lock_read()?;
        let dir = self.companion_dir(user_id, character_id);
        let (mut bond, facts, moments) = self.load_or_import(&dir, character_id, user_id)?;
        let changed = apply_time_rules(&mut bond, now);
        if changed {
            self.write_bond(&dir, &bond)?;
        }
        let snapshot_moments = cap_moments_newest_first(&moments, MOMENT_SNAPSHOT_CAP);
        Ok(MemorySnapshot {
            bond: BondView::new(bond, now),
            facts,
            moments: snapshot_moments,
            memory_dir: dir.to_string_lossy().into_owned(),
        })
    }

    pub fn apply_turn(
        &self,
        character_id: &str,
        user_id: &str,
        user_message: &str,
        notes: Option<TurnNotes>,
    ) -> Result<MemorySnapshot> {
        self.apply_turn_at(character_id, user_id, user_message, notes, Utc::now())
    }

    pub fn apply_turn_at(
        &self,
        character_id: &str,
        user_id: &str,
        _user_message: &str, // reserved for future relevance / prompt use
        notes: Option<TurnNotes>,
        now: DateTime<Utc>,
    ) -> Result<MemorySnapshot> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id);
        let (mut bond, mut facts, mut moments) =
            self.load_or_import(&dir, character_id, user_id)?;

        apply_time_rules(&mut bond, now);

        let mut mood_changed = false;
        let mut closeness_delta_magnitude: i32 = 0;

        if let Some(notes) = notes {
            for text in &notes.remember {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    continue;
                }
                upsert_fact(&mut facts, trimmed, FactSource::Agent, now);
            }

            if let Some(ref note) = notes.mood {
                mood_changed = apply_mood_note(&mut bond.mood, note, now);
            }

            if let Some(delta) = notes.closeness {
                let clamped = delta.clamp(-2, 2);
                closeness_delta_magnitude = clamped.abs();
                bond.closeness =
                    (bond.closeness + f64::from(clamped) * CLOSENESS_STEP + CLOSENESS_BASELINE)
                        .clamp(0.0, 1.0);
            } else {
                bond.closeness = (bond.closeness + CLOSENESS_BASELINE).clamp(0.0, 1.0);
            }

            if let Some(ref summary) = notes.moment {
                let trimmed = summary.trim();
                if !trimmed.is_empty() {
                    let weight = if mood_changed || closeness_delta_magnitude == 2 {
                        0.8
                    } else {
                        0.5
                    };
                    let feeling = bond.mood.name.clone();
                    moments.push(Moment {
                        id: Uuid::new_v4().to_string(),
                        at: now,
                        summary: trimmed.to_string(),
                        feeling: if is_neutral_mood(&feeling) {
                            None
                        } else {
                            Some(feeling)
                        },
                        weight,
                    });
                }
            }

            apply_thread_notes(&mut bond, &notes, now);
        } else {
            bond.closeness = (bond.closeness + CLOSENESS_BASELINE).clamp(0.0, 1.0);
        }

        bond.turns += 1;
        bond.last_talked_at = Some(now);
        bond.updated_at = now;

        self.persist_all(&dir, &bond, &facts, &moments)?;

        let snapshot_moments = cap_moments_newest_first(&moments, MOMENT_SNAPSHOT_CAP);
        Ok(MemorySnapshot {
            bond: BondView::new(bond, now),
            facts,
            moments: snapshot_moments,
            memory_dir: dir.to_string_lossy().into_owned(),
        })
    }

    pub fn add_fact(&self, character_id: &str, user_id: &str, text: &str) -> Result<Fact> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(MeuxeError::Memory("Fact text cannot be empty".into()));
        }
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id);
        let (bond, mut facts, moments) = self.load_or_import(&dir, character_id, user_id)?;
        let now = Utc::now();
        let fact = upsert_fact(&mut facts, trimmed, FactSource::User, now);
        self.persist_all(&dir, &bond, &facts, &moments)?;
        Ok(fact)
    }

    pub fn update_fact(
        &self,
        character_id: &str,
        user_id: &str,
        fact_id: &str,
        text: &str,
    ) -> Result<Fact> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err(MeuxeError::Memory("Fact text cannot be empty".into()));
        }
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id);
        let (bond, mut facts, moments) = self.load_or_import(&dir, character_id, user_id)?;
        let fact = facts
            .iter_mut()
            .find(|f| f.id == fact_id)
            .ok_or_else(|| MeuxeError::Memory(format!("Fact not found: {fact_id}")))?;
        fact.text = trimmed.to_string();
        fact.kind = infer_fact_kind(trimmed);
        fact.confirmed_at = Utc::now();
        let updated = fact.clone();
        self.persist_all(&dir, &bond, &facts, &moments)?;
        Ok(updated)
    }

    pub fn forget_fact(&self, character_id: &str, user_id: &str, fact_id: &str) -> Result<()> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id);
        let (bond, mut facts, moments) = self.load_or_import(&dir, character_id, user_id)?;
        let before = facts.len();
        facts.retain(|f| f.id != fact_id);
        if facts.len() == before {
            return Err(MeuxeError::Memory(format!("Fact not found: {fact_id}")));
        }
        self.persist_all(&dir, &bond, &facts, &moments)?;
        Ok(())
    }

    pub fn forget_moment(&self, character_id: &str, user_id: &str, moment_id: &str) -> Result<()> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id);
        let (bond, facts, mut moments) = self.load_or_import(&dir, character_id, user_id)?;
        let before = moments.len();
        moments.retain(|m| m.id != moment_id);
        if moments.len() == before {
            return Err(MeuxeError::Memory(format!("Moment not found: {moment_id}")));
        }
        self.persist_all(&dir, &bond, &facts, &moments)?;
        Ok(())
    }

    pub fn reset(&self, character_id: &str, user_id: &str) -> Result<()> {
        let _guard = self.lock_write()?;
        let dir = self.companion_dir(user_id, character_id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        std::fs::create_dir_all(&dir)?;
        // Empty profile prevents legacy re-import on next load.
        self.write_profile(&dir, &Profile::default())?;
        let bond = Bond::default();
        self.write_bond(&dir, &bond)?;
        self.write_moments(&dir, &[])?;
        Ok(())
    }

    fn companion_dir(&self, user_id: &str, character_id: &str) -> PathBuf {
        self.data_dir
            .join("data")
            .join("users")
            .join(user_id)
            .join("companions")
            .join(character_id)
    }

    fn legacy_memory_dir(&self, character_id: &str, user_id: &str) -> PathBuf {
        self.data_dir
            .join("data")
            .join(character_id)
            .join(user_id)
            .join("memory")
    }

    fn lock_read(&self) -> Result<std::sync::RwLockReadGuard<'_, ()>> {
        self._lock
            .read()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))
    }

    fn lock_write(&self) -> Result<std::sync::RwLockWriteGuard<'_, ()>> {
        self._lock
            .write()
            .map_err(|e| MeuxeError::Memory(format!("Lock poisoned: {e}")))
    }

    fn load_or_import(
        &self,
        dir: &Path,
        character_id: &str,
        user_id: &str,
    ) -> Result<(Bond, Vec<Fact>, Vec<Moment>)> {
        if dir.exists() {
            let bond = self.read_bond(dir)?;
            let profile = self.read_profile(dir)?;
            let moments = self.read_moments(dir)?;
            return Ok((bond, profile.facts, moments));
        }

        let mut facts = Vec::new();
        let mut moments = Vec::new();
        self.import_legacy(character_id, user_id, &mut facts, &mut moments)?;

        std::fs::create_dir_all(dir)?;
        let bond = Bond::default();
        self.write_profile(
            dir,
            &Profile {
                facts: facts.clone(),
            },
        )?;
        self.write_moments(dir, &moments)?;
        self.write_bond(dir, &bond)?;
        Ok((bond, facts, moments))
    }

    fn import_legacy(
        &self,
        character_id: &str,
        user_id: &str,
        facts: &mut Vec<Fact>,
        moments: &mut Vec<Moment>,
    ) -> Result<()> {
        let legacy_dir = self.legacy_memory_dir(character_id, user_id);
        if !legacy_dir.exists() {
            return Ok(());
        }

        let semantic = legacy_dir.join("semantic.jsonl");
        if semantic.exists() {
            for line in read_jsonl_lines(&semantic)? {
                if let Ok(row) = serde_json::from_str::<LegacyMemory>(&line) {
                    let kind = infer_fact_kind(&row.summary);
                    facts.push(Fact {
                        id: row.id,
                        text: row.summary,
                        kind,
                        created_at: row.ts,
                        confirmed_at: row.ts,
                        mentions: 1,
                        source: FactSource::Legacy,
                    });
                }
            }
        }

        let episodic = legacy_dir.join("episodic.jsonl");
        if episodic.exists() {
            for line in read_jsonl_lines(&episodic)? {
                if let Ok(row) = serde_json::from_str::<LegacyMemory>(&line) {
                    moments.push(Moment {
                        id: row.id,
                        at: row.ts,
                        summary: row.summary,
                        feeling: None,
                        weight: row.importance,
                    });
                }
            }
        }

        Ok(())
    }

    fn read_profile(&self, dir: &Path) -> Result<Profile> {
        let path = dir.join("profile.json");
        if !path.exists() {
            return Ok(Profile::default());
        }
        let text = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&text)?)
    }

    fn read_bond(&self, dir: &Path) -> Result<Bond> {
        let path = dir.join("bond.json");
        if !path.exists() {
            return Ok(Bond::default());
        }
        let text = std::fs::read_to_string(path)?;
        Ok(serde_json::from_str(&text)?)
    }

    fn read_moments(&self, dir: &Path) -> Result<Vec<Moment>> {
        let path = dir.join("moments.jsonl");
        if !path.exists() {
            return Ok(vec![]);
        }
        let mut moments = Vec::new();
        for line in read_jsonl_lines(&path)? {
            if let Ok(moment) = serde_json::from_str::<Moment>(&line) {
                moments.push(moment);
            }
        }
        Ok(moments)
    }

    fn persist_all(
        &self,
        dir: &Path,
        bond: &Bond,
        facts: &[Fact],
        moments: &[Moment],
    ) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        self.write_profile(
            dir,
            &Profile {
                facts: facts.to_vec(),
            },
        )?;
        self.write_moments(dir, moments)?;
        self.write_bond(dir, bond)?;
        Ok(())
    }

    fn write_profile(&self, dir: &Path, profile: &Profile) -> Result<()> {
        write_atomic(
            &dir.join("profile.json"),
            &serde_json::to_string_pretty(profile)?,
        )
    }

    fn write_bond(&self, dir: &Path, bond: &Bond) -> Result<()> {
        write_atomic(&dir.join("bond.json"), &serde_json::to_string_pretty(bond)?)
    }

    fn write_moments(&self, dir: &Path, moments: &[Moment]) -> Result<()> {
        let path = dir.join("moments.jsonl");
        let mut body = String::new();
        for moment in moments {
            body.push_str(&serde_json::to_string(moment)?);
            body.push('\n');
        }
        write_atomic(&path, &body)
    }
}

fn write_atomic(path: &Path, contents: &str) -> Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}

fn read_jsonl_lines(path: &Path) -> Result<Vec<String>> {
    let file = std::fs::File::open(path)?;
    let reader = std::io::BufReader::new(file);
    let mut lines = Vec::new();
    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            lines.push(trimmed.to_string());
        }
    }
    Ok(lines)
}

fn cap_moments_newest_first(moments: &[Moment], cap: usize) -> Vec<Moment> {
    let mut sorted: Vec<Moment> = moments.to_vec();
    sorted.sort_by(|a, b| b.at.cmp(&a.at));
    sorted.truncate(cap);
    sorted
}

fn apply_time_rules(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    let mut changed = false;

    if apply_mood_decay(bond, now) {
        changed = true;
    }

    if apply_missed_you(bond, now) {
        changed = true;
    }

    if apply_closeness_drift(bond, now) {
        changed = true;
    }

    if changed {
        bond.updated_at = now;
    }

    changed
}

fn apply_mood_decay(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    if is_neutral_mood(&bond.mood.name) || bond.mood.intensity <= 0.0 {
        return false;
    }

    let elapsed = now.signed_duration_since(bond.mood.since);
    if elapsed <= Duration::zero() {
        return false;
    }

    let hours = elapsed.num_seconds() as f64 / 3600.0;
    let half_life_hours = if is_negative_mood(&bond.mood.name) {
        48.0
    } else {
        12.0
    };
    let decay_factor = 0.5_f64.powf(hours / half_life_hours);
    let new_intensity = bond.mood.intensity * decay_factor;

    if new_intensity < MOOD_FADE_THRESHOLD {
        if is_negative_mood(&bond.mood.name) {
            if let Some(cause) = bond.mood.cause.clone() {
                let text = format!("Never got closure on: {cause}");
                if !bond.threads.iter().any(|t| t.text == text) {
                    bond.threads.push(Thread {
                        id: Uuid::new_v4().to_string(),
                        text,
                        opened_at: now,
                    });
                    trim_threads(bond);
                }
            }
        }
        bond.mood = Mood {
            name: "neutral".to_string(),
            intensity: 0.0,
            cause: None,
            wants: None,
            since: now,
        };
        return true;
    }

    if (new_intensity - bond.mood.intensity).abs() > f64::EPSILON {
        bond.mood.intensity = new_intensity;
        bond.mood.since = now;
        return true;
    }

    false
}

fn apply_missed_you(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    let Some(last) = bond.last_talked_at else {
        return false;
    };
    if !is_neutral_mood(&bond.mood.name) {
        return false;
    }
    if bond.closeness < 0.35 {
        return false;
    }

    let days = (now - last).num_days();
    if days < 5 {
        return false;
    }

    let extra_weeks = ((days - 5) / 7).max(0);
    let intensity = (0.3 + 0.1 * extra_weeks as f64).min(0.6);
    bond.mood = Mood {
        name: "missed you".to_string(),
        intensity,
        cause: Some(format!("you were gone for {days} days")),
        wants: None,
        since: now,
    };
    true
}

fn apply_closeness_drift(bond: &mut Bond, now: DateTime<Utc>) -> bool {
    let Some(last) = bond.last_talked_at else {
        return false;
    };
    let days = (now - last).num_days();
    if days <= 14 {
        return false;
    }
    let drift_days = (days - 14) as f64;
    let new_closeness =
        (bond.closeness - drift_days * CLOSENESS_DRIFT_PER_DAY).max(CLOSENESS_DRIFT_MIN);
    if (new_closeness - bond.closeness).abs() > f64::EPSILON {
        bond.closeness = new_closeness;
        return true;
    }
    false
}

fn apply_mood_note(mood: &mut Mood, note: &MoodNote, now: DateTime<Utc>) -> bool {
    let proposed_negative = is_negative_mood(&note.name);
    let current_negative =
        is_negative_mood(&mood.name) && mood.intensity > NO_FORGIVENESS_THRESHOLD;

    if current_negative && !proposed_negative {
        mood.intensity = (mood.intensity - NO_FORGIVENESS_DROP).max(0.0);
        mood.since = now;
        return true;
    }

    let intensity = note.intensity.unwrap_or(0.5).clamp(0.0, 1.0);
    let name_changed = !mood.name.eq_ignore_ascii_case(&note.name);
    mood.name = note.name.clone();
    mood.intensity = intensity;
    mood.cause = note.cause.clone();
    mood.wants = note.wants.clone();
    if name_changed {
        mood.since = now;
    }
    true
}

fn apply_thread_notes(bond: &mut Bond, notes: &TurnNotes, now: DateTime<Utc>) {
    for text in &notes.closed_threads {
        let needle = text.to_ascii_lowercase();
        bond.threads
            .retain(|t| !t.text.to_ascii_lowercase().contains(&needle));
    }

    for text in &notes.open_threads {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            continue;
        }
        let needle = trimmed.to_ascii_lowercase();
        if bond
            .threads
            .iter()
            .any(|t| t.text.to_ascii_lowercase().contains(&needle))
        {
            continue;
        }
        bond.threads.push(Thread {
            id: Uuid::new_v4().to_string(),
            text: trimmed.to_string(),
            opened_at: now,
        });
    }

    trim_threads(bond);
}

fn trim_threads(bond: &mut Bond) {
    if bond.threads.len() <= THREAD_CAP {
        return;
    }
    bond.threads.sort_by(|a, b| a.opened_at.cmp(&b.opened_at));
    let drop = bond.threads.len() - THREAD_CAP;
    bond.threads.drain(0..drop);
}

fn upsert_fact(facts: &mut Vec<Fact>, text: &str, source: FactSource, now: DateTime<Utc>) -> Fact {
    let norm = normalize_fact_text(text);
    let tokens = fact_tokens(text);

    if let Some(existing) = facts.iter_mut().find(|f| {
        let existing_norm = normalize_fact_text(&f.text);
        if existing_norm == norm {
            return true;
        }
        jaccard(&tokens, &fact_tokens(&f.text)) >= 0.8
    }) {
        existing.text = text.to_string();
        existing.confirmed_at = now;
        existing.mentions = existing.mentions.saturating_add(1);
        existing.kind = infer_fact_kind(text);
        return existing.clone();
    }

    let fact = Fact {
        id: Uuid::new_v4().to_string(),
        text: text.to_string(),
        kind: infer_fact_kind(text),
        created_at: now,
        confirmed_at: now,
        mentions: 1,
        source,
    };
    facts.push(fact.clone());
    enforce_fact_cap(facts);
    fact
}

fn enforce_fact_cap(facts: &mut Vec<Fact>) {
    while facts.len() > FACT_CAP {
        let idx = facts
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                a.mentions
                    .cmp(&b.mentions)
                    .then_with(|| a.confirmed_at.cmp(&b.confirmed_at))
            })
            .map(|(i, _)| i)
            .unwrap_or(0);
        facts.remove(idx);
    }
}

fn normalize_fact_text(text: &str) -> String {
    let re = Regex::new(r"[^a-z0-9 ]+").unwrap();
    let lower = text.to_ascii_lowercase();
    let stripped = re.replace_all(&lower, " ");
    collapse_whitespace(&stripped)
}

fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn fact_tokens(text: &str) -> HashSet<String> {
    normalize_fact_text(text)
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

fn jaccard(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = a.intersection(b).count();
    let union = a.union(b).count();
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

fn infer_fact_kind(text: &str) -> FactKind {
    let lower = text.to_ascii_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| lower.contains(w));

    if has(&["name", "called", "years old", "birthday", "live in", "from"]) {
        FactKind::Identity
    } else if has(&[
        "partner",
        "wife",
        "husband",
        "girlfriend",
        "boyfriend",
        "mom",
        "dad",
        "mother",
        "father",
        "sister",
        "brother",
        "friend",
        "son",
        "daughter",
        "dog",
        "cat",
        "pet",
    ]) {
        FactKind::People
    } else if has(&[
        "likes",
        "loves",
        "hates",
        "prefers",
        "favorite",
        "favourite",
        "enjoys",
        "dislikes",
    ]) {
        FactKind::Preference
    } else if has(&[
        "works", "job", "studies", "student", "company", "project", "building", "career", "boss",
        "school",
    ]) {
        FactKind::Work
    } else if has(&["moved", "health", "sleep", "gym", "routine", "lives"]) {
        FactKind::Life
    } else if has(&[
        "don't",
        "doesn't want",
        "never",
        "uncomfortable",
        "boundary",
    ]) {
        FactKind::Boundary
    } else {
        FactKind::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::types::MoodNote;
    use chrono::TimeZone;

    fn mem() -> (tempfile::TempDir, CompanionMemory) {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().to_path_buf();
        (tmp, CompanionMemory::new(&path))
    }

    fn notes_with_remember(text: &str) -> TurnNotes {
        TurnNotes {
            remember: vec![text.into()],
            ..Default::default()
        }
    }

    #[test]
    fn store_round_trip() {
        let (_tmp, store) = mem();
        store
            .add_fact("rika", "user1", "Their dog is named Rex")
            .unwrap();
        let snap = store.snapshot("rika", "user1").unwrap();
        assert_eq!(snap.facts.len(), 1);
        assert_eq!(snap.facts[0].text, "Their dog is named Rex");
        assert!(snap.memory_dir.contains("companions/rika"));
    }

    #[test]
    fn apply_turn_creates_facts_moment_mood_threads_and_bumps_bond() {
        let (_tmp, store) = mem();
        let notes = TurnNotes {
            remember: vec!["They work on backend systems".into()],
            moment: Some("They vented about a tough deploy.".into()),
            mood: Some(MoodNote {
                name: "worried".into(),
                intensity: Some(0.6),
                cause: Some("they sounded stressed".into()),
                wants: Some("to hear how it went".into()),
            }),
            closeness: Some(1),
            open_threads: vec!["Ask how the deploy went".into()],
            closed_threads: vec![],
        };
        let snap = store
            .apply_turn("rika", "user1", "bad day at work", Some(notes))
            .unwrap();
        assert_eq!(snap.facts.len(), 1);
        assert_eq!(snap.moments.len(), 1);
        assert_eq!(snap.bond.bond.mood.name, "worried");
        assert_eq!(snap.bond.bond.threads.len(), 1);
        assert_eq!(snap.bond.bond.turns, 1);
        assert!(snap.bond.bond.closeness > 0.0);
    }

    #[test]
    fn near_duplicate_facts_merge() {
        let (_tmp, store) = mem();
        store
            .apply_turn(
                "rika",
                "user1",
                "",
                Some(notes_with_remember("Their dog is named Rex")),
            )
            .unwrap();
        store
            .apply_turn(
                "rika",
                "user1",
                "",
                Some(notes_with_remember("their dog is named REX!!!")),
            )
            .unwrap();
        let snap = store.snapshot("rika", "user1").unwrap();
        assert_eq!(snap.facts.len(), 1);
        assert_eq!(snap.facts[0].mentions, 2);
        assert_eq!(snap.facts[0].text, "their dog is named REX!!!");
    }

    #[test]
    fn fact_cap_eviction() {
        let (_tmp, store) = mem();
        for i in 0..305 {
            store
                .add_fact(
                    "rika",
                    "user1",
                    &format!("Unique fact number {i} about topic {i}"),
                )
                .unwrap();
        }
        let snap = store.snapshot("rika", "user1").unwrap();
        assert_eq!(snap.facts.len(), FACT_CAP);
    }

    #[test]
    fn no_instant_forgiveness_then_second_turn_resolves() {
        let (_tmp, store) = mem();
        let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 12, 0, 0).unwrap();
        store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    mood: Some(MoodNote {
                        name: "hurt".into(),
                        intensity: Some(0.7),
                        cause: Some("they were dismissive".into()),
                        wants: None,
                    }),
                    ..Default::default()
                }),
                t0,
            )
            .unwrap();

        let t1 = t0 + Duration::minutes(1);
        let snap = store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    mood: Some(MoodNote {
                        name: "happy".into(),
                        intensity: Some(0.8),
                        cause: None,
                        wants: None,
                    }),
                    ..Default::default()
                }),
                t1,
            )
            .unwrap();
        assert_eq!(snap.bond.bond.mood.name, "hurt");
        assert!((snap.bond.bond.mood.intensity - 0.35).abs() < 0.001);

        let t2 = t1 + Duration::minutes(1);
        let snap2 = store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    mood: Some(MoodNote {
                        name: "warm".into(),
                        intensity: Some(0.6),
                        cause: None,
                        wants: None,
                    }),
                    ..Default::default()
                }),
                t2,
            )
            .unwrap();
        assert_eq!(snap2.bond.bond.mood.name, "warm");
    }

    #[test]
    fn mood_decay_to_neutral_adds_closure_thread() {
        let (_tmp, store) = mem();
        let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
        store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    mood: Some(MoodNote {
                        name: "hurt".into(),
                        intensity: Some(0.3),
                        cause: Some("they forgot our plans".into()),
                        wants: None,
                    }),
                    ..Default::default()
                }),
                t0,
            )
            .unwrap();

        let t1 = t0 + Duration::hours(120);
        let snap = store.snapshot_at("rika", "user1", t1).unwrap();
        assert!(is_neutral_mood(&snap.bond.bond.mood.name));
        assert!(snap
            .bond
            .bond
            .threads
            .iter()
            .any(|t| t.text.contains("Never got closure on")));
    }

    #[test]
    fn missed_you_after_six_days() {
        let (_tmp, store) = mem();
        let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
        for _ in 0..12 {
            store
                .apply_turn_at(
                    "rika",
                    "user1",
                    "",
                    Some(TurnNotes {
                        closeness: Some(2),
                        ..Default::default()
                    }),
                    t0,
                )
                .unwrap();
        }

        let t1 = t0 + Duration::days(6);
        let snap = store.snapshot_at("rika", "user1", t1).unwrap();
        assert!(snap.bond.bond.closeness >= 0.35);
        assert_eq!(snap.bond.bond.mood.name, "missed you");
        assert!((snap.bond.bond.mood.intensity - 0.3).abs() < 0.001);
    }

    #[test]
    fn closeness_drift_after_fourteen_days() {
        let (_tmp, store) = mem();
        let t0 = Utc.with_ymd_and_hms(2026, 9, 1, 0, 0, 0).unwrap();
        store
            .apply_turn_at(
                "rika",
                "user1",
                "",
                Some(TurnNotes {
                    closeness: Some(2),
                    ..Default::default()
                }),
                t0,
            )
            .unwrap();
        let closeness_before = store
            .snapshot_at("rika", "user1", t0)
            .unwrap()
            .bond
            .bond
            .closeness;

        let t1 = t0 + Duration::days(20);
        let snap = store.snapshot_at("rika", "user1", t1).unwrap();
        let expected = (closeness_before - 6.0 * CLOSENESS_DRIFT_PER_DAY).max(CLOSENESS_DRIFT_MIN);
        assert!((snap.bond.bond.closeness - expected).abs() < 0.0001);
    }

    #[test]
    fn legacy_import() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy_dir = tmp.path().join("data/rika/user1/memory");
        std::fs::create_dir_all(&legacy_dir).unwrap();
        let semantic = LegacyMemory {
            id: "s1".into(),
            ts: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            memory_type: "semantic".into(),
            summary: "User likes tea".into(),
            importance: 0.8,
            tags: vec![],
            metadata: serde_json::Value::Null,
        };
        let episodic = LegacyMemory {
            id: "e1".into(),
            ts: Utc.with_ymd_and_hms(2026, 1, 2, 0, 0, 0).unwrap(),
            memory_type: "episodic".into(),
            summary: "Talked about hobbies".into(),
            importance: 0.7,
            tags: vec![],
            metadata: serde_json::Value::Null,
        };
        std::fs::write(
            legacy_dir.join("semantic.jsonl"),
            format!("{}\n", serde_json::to_string(&semantic).unwrap()),
        )
        .unwrap();
        std::fs::write(
            legacy_dir.join("episodic.jsonl"),
            format!("{}\n", serde_json::to_string(&episodic).unwrap()),
        )
        .unwrap();

        let store = CompanionMemory::new(tmp.path());
        let snap = store.snapshot("rika", "user1").unwrap();
        assert_eq!(snap.facts.len(), 1);
        assert_eq!(snap.facts[0].source, FactSource::Legacy);
        assert_eq!(snap.moments.len(), 1);
        assert!(legacy_dir.join("semantic.jsonl").exists());
    }

    #[test]
    fn reset_clears_and_blocks_legacy_reimport() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy_dir = tmp.path().join("data/rika/user1/memory");
        std::fs::create_dir_all(&legacy_dir).unwrap();
        std::fs::write(
            legacy_dir.join("semantic.jsonl"),
            r#"{"id":"s1","ts":"2026-01-01T00:00:00Z","type":"semantic","summary":"Old fact","importance":0.5,"tags":[]}"#,
        )
        .unwrap();

        let store = CompanionMemory::new(tmp.path());
        store.snapshot("rika", "user1").unwrap();
        store.reset("rika", "user1").unwrap();

        let snap = store.snapshot("rika", "user1").unwrap();
        assert_eq!(snap.facts.len(), 0);
        assert_eq!(snap.bond.bond.turns, 0);
        assert_eq!(snap.bond.bond.closeness, 0.0);
    }
}
