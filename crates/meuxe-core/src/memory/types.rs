use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Fact {
    pub id: String,
    pub text: String,
    pub kind: FactKind,
    pub created_at: DateTime<Utc>,
    pub confirmed_at: DateTime<Utc>,
    pub mentions: u32,
    pub source: FactSource,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FactKind {
    Identity,
    People,
    Preference,
    Life,
    Work,
    Boundary,
    Other,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FactSource {
    Agent,
    User,
    Legacy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Moment {
    pub id: String,
    pub at: DateTime<Utc>,
    pub summary: String,
    pub feeling: Option<String>,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Mood {
    pub name: String,
    pub intensity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cause: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wants: Option<String>,
    pub since: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Thread {
    pub id: String,
    pub text: String,
    pub opened_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Bond {
    pub closeness: f64,
    pub mood: Mood,
    pub threads: Vec<Thread>,
    pub last_talked_at: Option<DateTime<Utc>>,
    pub turns: u64,
    pub updated_at: DateTime<Utc>,
}

impl Default for Bond {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            closeness: 0.0,
            mood: Mood {
                name: "neutral".to_string(),
                intensity: 0.0,
                cause: None,
                wants: None,
                since: now,
            },
            threads: Vec::new(),
            last_talked_at: None,
            turns: 0,
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BondView {
    pub bond: Bond,
    pub stage: &'static str,
    pub seconds_since_last_talk: Option<i64>,
}

impl Serialize for BondView {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("BondView", 8)?;
        state.serialize_field("closeness", &self.bond.closeness)?;
        state.serialize_field("stage", self.stage)?;
        state.serialize_field("mood", &self.bond.mood)?;
        state.serialize_field("threads", &self.bond.threads)?;
        state.serialize_field("last_talked_at", &self.bond.last_talked_at)?;
        state.serialize_field("seconds_since_last_talk", &self.seconds_since_last_talk)?;
        state.serialize_field("turns", &self.bond.turns)?;
        state.serialize_field("updated_at", &self.bond.updated_at)?;
        state.end()
    }
}

#[derive(Deserialize)]
struct BondViewData {
    closeness: f64,
    #[serde(default)]
    #[allow(dead_code)]
    stage: String,
    mood: Mood,
    threads: Vec<Thread>,
    last_talked_at: Option<DateTime<Utc>>,
    #[serde(default)]
    seconds_since_last_talk: Option<i64>,
    turns: u64,
    updated_at: DateTime<Utc>,
}

impl<'de> Deserialize<'de> for BondView {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let data = BondViewData::deserialize(deserializer)?;
        let bond = Bond {
            closeness: data.closeness,
            mood: data.mood,
            threads: data.threads,
            last_talked_at: data.last_talked_at,
            turns: data.turns,
            updated_at: data.updated_at,
        };
        let stage = stage_for(bond.closeness);
        Ok(Self {
            bond,
            stage,
            seconds_since_last_talk: data.seconds_since_last_talk,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MemorySnapshot {
    pub bond: BondView,
    pub facts: Vec<Fact>,
    pub moments: Vec<Moment>,
    pub memory_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct TurnNotes {
    #[serde(default)]
    pub remember: Vec<String>,
    #[serde(default)]
    pub moment: Option<String>,
    #[serde(default)]
    pub mood: Option<MoodNote>,
    #[serde(default)]
    pub closeness: Option<i32>,
    #[serde(default)]
    pub open_threads: Vec<String>,
    #[serde(default)]
    pub closed_threads: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MoodNote {
    pub name: String,
    #[serde(default)]
    pub intensity: Option<f64>,
    #[serde(default)]
    pub cause: Option<String>,
    #[serde(default)]
    pub wants: Option<String>,
}

impl BondView {
    pub fn new(bond: Bond, now: DateTime<Utc>) -> Self {
        let seconds_since_last_talk = bond.last_talked_at.map(|t| (now - t).num_seconds());
        Self {
            stage: stage_for(bond.closeness),
            seconds_since_last_talk,
            bond,
        }
    }
}

pub fn stage_for(closeness: f64) -> &'static str {
    if closeness < 0.15 {
        "just met"
    } else if closeness < 0.35 {
        "getting to know each other"
    } else if closeness < 0.6 {
        "friends"
    } else if closeness < 0.85 {
        "close"
    } else {
        "inseparable"
    }
}

pub fn is_negative_mood(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "hurt"
            | "annoyed"
            | "angry"
            | "upset"
            | "jealous"
            | "disappointed"
            | "worried"
            | "sad"
            | "lonely"
            | "frustrated"
            | "cold"
    )
}

pub fn is_neutral_mood(name: &str) -> bool {
    name.eq_ignore_ascii_case("neutral")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn bond_view_json_round_trip_preserves_bond() {
        let now = Utc.with_ymd_and_hms(2026, 9, 1, 12, 0, 0).unwrap();
        let view = BondView::new(
            Bond {
                closeness: 0.42,
                mood: Mood {
                    name: "warm".into(),
                    intensity: 0.55,
                    cause: Some("they were honest".into()),
                    wants: None,
                    since: now,
                },
                threads: vec![Thread {
                    id: "t1".into(),
                    text: "Ask about the interview".into(),
                    opened_at: now,
                }],
                last_talked_at: Some(now - chrono::Duration::hours(3)),
                turns: 7,
                updated_at: now,
            },
            now,
        );

        let json = serde_json::to_string(&view).unwrap();
        let restored: BondView = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.bond, view.bond);
        assert_eq!(
            restored.seconds_since_last_talk,
            view.seconds_since_last_talk
        );
        assert_eq!(restored.stage, view.stage);
    }

    #[test]
    fn bond_view_deserialize_uses_defaults_for_derived_fields() {
        let now = Utc.with_ymd_and_hms(2026, 9, 1, 12, 0, 0).unwrap();
        let json = serde_json::json!({
            "closeness": 0.2,
            "mood": {
                "name": "neutral",
                "intensity": 0.0,
                "since": now.to_rfc3339()
            },
            "threads": [],
            "turns": 1,
            "updated_at": now.to_rfc3339()
        });

        let view: BondView = serde_json::from_value(json).unwrap();
        assert_eq!(view.bond.closeness, 0.2);
        assert_eq!(view.stage, "getting to know each other");
        assert_eq!(view.seconds_since_last_talk, None);
    }
}
