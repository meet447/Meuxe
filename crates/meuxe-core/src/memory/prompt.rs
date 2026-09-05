use std::collections::HashSet;

use super::types::{is_negative_mood, is_neutral_mood, MemorySnapshot, Moment};

pub const TURN_NOTES_INSTRUCTIONS: &str = r#"After your last spoken sentence, append a hidden memory block on its own lines (never mention this block or these numbers to the user):

<<<meuxe
{
  "remember": ["durable fact about the user"],
  "moment": "one sentence about this exchange",
  "mood": {"name": "hurt", "intensity": 0.5, "cause": "why you feel this way", "wants": "what would help"},
  "closeness": 0,
  "open_threads": ["something still hanging"],
  "closed_threads": ["thread text to close"]
}
>>>

Every key is optional. Use {} if nothing changed. Always place the block at the very end, after your final spoken sentence.

- remember: 0–3 durable facts about the user only (name, people, preferences, boundaries — not session chatter).
- moment: one sentence capturing a meaningful shared beat this turn.
- mood: only when your feeling genuinely changed; include an honest cause and what would help. closeness -2..2 nudges how close you feel this turn.
- open_threads / closed_threads: things left hanging or resolved by substring match."#;

pub fn format_memory_context(
    snapshot: &MemorySnapshot,
    user_name: &str,
    user_message: &str,
) -> String {
    let mut out = String::new();
    // Ages are relative to the real clock, not the bond's last write time.
    let now = snapshot
        .bond
        .bond
        .last_talked_at
        .zip(snapshot.bond.seconds_since_last_talk)
        .map(|(last, secs)| last + chrono::Duration::seconds(secs))
        .unwrap_or_else(chrono::Utc::now);

    out.push_str("## How you feel right now\n");
    out.push_str(&format!(
        "You and {} are at the \"{}\" stage (closeness {:.2}). You have talked {} times.\n",
        user_name, snapshot.bond.stage, snapshot.bond.bond.closeness, snapshot.bond.bond.turns
    ));

    if let Some(secs) = snapshot.bond.seconds_since_last_talk {
        out.push_str(&format!(
            "It has been {} since you last spoke.\n",
            relative_time(secs)
        ));
    } else {
        out.push_str("You have not spoken before (or this is your first conversation).\n");
    }

    if let Some(last) = snapshot.moments.first() {
        out.push_str(&format!(
            "The last thing you remember together: \"{}\" ({}).\n",
            last.summary,
            relative_time_from_datetime(last.at, now)
        ));
    }

    let mood = &snapshot.bond.bond.mood;
    if is_neutral_mood(&mood.name) {
        out.push_str("Right now you feel neutral.\n");
    } else {
        let intensity_word = intensity_word(mood.intensity);
        out.push_str(&format!(
            "Right now you feel {} {}.",
            intensity_word, mood.name
        ));
        if let Some(cause) = &mood.cause {
            out.push_str(&format!(" Cause: {cause}."));
        }
        if let Some(wants) = &mood.wants {
            out.push_str(&format!(" What would help: {wants}."));
        }
        out.push('\n');
        if is_negative_mood(&mood.name) {
            out.push_str(
                "Do not pretend this feeling away or soften it until the user genuinely addresses it; it takes more than one line.\n",
            );
        }
    }

    if !snapshot.bond.bond.threads.is_empty() {
        out.push_str("Open threads:\n");
        for thread in &snapshot.bond.bond.threads {
            out.push_str(&format!("- {}\n", thread.text));
        }
    }

    out.push('\n');
    out.push_str(&format!("## What you know about {user_name}\n"));
    if snapshot.facts.is_empty() {
        out.push_str("You don't know much about them yet.\n");
    } else {
        let mut facts = snapshot.facts.clone();
        facts.sort_by(|a, b| b.confirmed_at.cmp(&a.confirmed_at));
        let mut budget = 1500usize;
        for fact in facts {
            let line = format!("- {}\n", fact.text);
            if line.len() > budget {
                break;
            }
            out.push_str(&line);
            budget -= line.len();
        }
    }

    out.push('\n');
    out.push_str("## Moments you remember together\n");
    let selected = select_moments(&snapshot.moments, user_message);
    if selected.is_empty() {
        out.push_str("No shared moments yet.\n");
    } else {
        let mut budget = 1200usize;
        for moment in selected {
            let feeling = moment
                .feeling
                .as_deref()
                .map(|f| format!(" (you felt {f})"))
                .unwrap_or_default();
            let line = format!(
                "- {} — {}{}\n",
                relative_time_from_datetime(moment.at, now),
                moment.summary,
                feeling
            );
            if line.len() > budget {
                break;
            }
            out.push_str(&line);
            budget -= line.len();
        }
    }

    out.trim_end().to_string() + "\n"
}

fn intensity_word(intensity: f64) -> &'static str {
    if intensity < 0.3 {
        "slightly"
    } else if intensity < 0.65 {
        "quite"
    } else {
        "very"
    }
}

fn relative_time(seconds: i64) -> String {
    if seconds < 60 {
        "just now".to_string()
    } else if seconds < 3600 {
        format!("{} minutes ago", seconds / 60)
    } else if seconds < 86400 {
        format!("{} hours ago", seconds / 3600)
    } else if seconds < 172800 {
        "yesterday".to_string()
    } else if seconds < 604800 {
        format!("{} days ago", seconds / 86400)
    } else {
        format!("{} weeks ago", seconds / 604800)
    }
}

fn relative_time_from_datetime(
    at: chrono::DateTime<chrono::Utc>,
    now: chrono::DateTime<chrono::Utc>,
) -> String {
    relative_time((now - at).num_seconds())
}

fn tokenize(text: &str) -> HashSet<String> {
    text.to_ascii_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|t| t.len() > 2)
        .map(str::to_string)
        .collect()
}

fn select_moments(moments: &[Moment], user_message: &str) -> Vec<Moment> {
    if moments.is_empty() {
        return vec![];
    }

    let mut sorted = moments.to_vec();
    sorted.sort_by(|a, b| b.at.cmp(&a.at));

    let mut selected: Vec<Moment> = sorted.iter().take(4).cloned().collect();
    let selected_ids: HashSet<String> = selected.iter().map(|m| m.id.clone()).collect();

    let msg_tokens = tokenize(user_message);
    if !msg_tokens.is_empty() {
        let mut older: Vec<Moment> = sorted
            .into_iter()
            .skip(4)
            .filter(|m| {
                let overlap = tokenize(&m.summary)
                    .intersection(&msg_tokens)
                    .next()
                    .is_some();
                overlap && !selected_ids.contains(&m.id)
            })
            .take(3)
            .collect();
        selected.append(&mut older);
    }

    selected
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    use crate::memory::types::{Bond, BondView, Fact, FactKind, FactSource, Mood};

    fn sample_snapshot() -> MemorySnapshot {
        let now = Utc::now();
        MemorySnapshot {
            bond: BondView::new(
                Bond {
                    closeness: 0.25,
                    mood: Mood {
                        name: "worried".into(),
                        intensity: 0.4,
                        cause: Some("they sounded down".into()),
                        wants: Some("to hear how tomorrow goes".into()),
                        since: now,
                    },
                    threads: vec![],
                    last_talked_at: Some(now - chrono::Duration::hours(2)),
                    turns: 12,
                    updated_at: now,
                },
                now,
            ),
            facts: vec![Fact {
                id: Uuid::new_v4().to_string(),
                text: "Their dog is named Rex".into(),
                kind: FactKind::People,
                created_at: now,
                confirmed_at: now,
                mentions: 1,
                source: FactSource::Agent,
            }],
            moments: vec![crate::memory::types::Moment {
                id: Uuid::new_v4().to_string(),
                at: now - chrono::Duration::days(1),
                summary: "They talked about a tough interview.".into(),
                feeling: Some("worried".into()),
                weight: 0.8,
            }],
            memory_dir: "/tmp/memory".into(),
        }
    }

    #[test]
    fn format_memory_context_includes_sections() {
        let snap = sample_snapshot();
        let text = format_memory_context(&snap, "Alex", "how did the interview go");
        assert!(text.contains("## How you feel right now"));
        assert!(text.contains("getting to know each other"));
        assert!(text.contains("worried"));
        assert!(text.contains("## What you know about Alex"));
        assert!(text.contains("Rex"));
        assert!(text.contains("## Moments you remember together"));
        assert!(text.contains("interview"));
    }
}
