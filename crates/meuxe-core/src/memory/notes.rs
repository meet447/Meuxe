use serde::{Deserialize, Deserializer};

use super::types::{MoodNote, TurnNotes};

const MARKER: &str = "<<<meuxe";

/// Streaming splitter that holds back a possible `<<<meuxe` memory trailer.
pub struct TrailerSplitter {
    visible: String,
    trailer: String,
    in_trailer: bool,
}

impl Default for TrailerSplitter {
    fn default() -> Self {
        Self::new()
    }
}

impl TrailerSplitter {
    pub fn new() -> Self {
        Self {
            visible: String::new(),
            trailer: String::new(),
            in_trailer: false,
        }
    }

    pub fn feed(&mut self, chunk: &str) -> String {
        if self.in_trailer {
            self.trailer.push_str(chunk);
            return String::new();
        }

        self.visible.push_str(chunk);
        if let Some(marker_pos) = self.visible.find(MARKER) {
            let mut emitted: String = self.visible.drain(0..marker_pos).collect();
            let rest: String = self.visible.drain(..).collect();
            strip_dangling_fence_suffix(&mut emitted);
            self.trailer = rest[MARKER.len()..].to_string();
            self.in_trailer = true;
            return emitted;
        }

        let emit_len = self.visible.len() - longest_marker_prefix_suffix(&self.visible);
        self.visible.drain(0..emit_len).collect()
    }

    pub fn finish(self) -> (String, Option<String>) {
        if self.in_trailer {
            let trailer = clean_trailer(&self.trailer);
            let trailer = if trailer.is_empty() {
                None
            } else {
                Some(trailer)
            };
            (self.visible, trailer)
        } else {
            (self.visible, None)
        }
    }
}

fn strip_dangling_fence_suffix(text: &mut String) {
    let trimmed_len = text.trim_end().len();
    if trimmed_len == 0 {
        return;
    }
    let trimmed = &text[..trimmed_len];
    if trimmed.ends_with("```json") {
        text.truncate(trimmed_len - 7);
    } else if trimmed.ends_with("```") {
        text.truncate(trimmed_len - 3);
    }
    while text.ends_with('\n') || text.ends_with('\r') {
        text.pop();
    }
}

fn longest_marker_prefix_suffix(text: &str) -> usize {
    let max = MARKER.len().min(text.len());
    for len in (1..=max).rev() {
        if text.ends_with(&MARKER[..len]) {
            return len;
        }
    }
    0
}

fn clean_trailer(raw: &str) -> String {
    let mut body = raw.to_string();
    if let Some(end) = body.find(">>>") {
        body.truncate(end);
    }
    body.trim().to_string()
}

#[derive(Deserialize)]
#[serde(untagged)]
enum MoodField {
    Object(MoodNote),
    Name(String),
}

#[derive(Deserialize)]
struct TurnNotesRaw {
    #[serde(default)]
    remember: Vec<String>,
    #[serde(default)]
    moment: Option<String>,
    #[serde(default, deserialize_with = "deserialize_mood")]
    mood: Option<MoodNote>,
    #[serde(default, deserialize_with = "deserialize_closeness")]
    closeness: Option<i32>,
    #[serde(default)]
    open_threads: Vec<String>,
    #[serde(default)]
    closed_threads: Vec<String>,
}

fn deserialize_mood<'de, D>(deserializer: D) -> Result<Option<MoodNote>, D::Error>
where
    D: Deserializer<'de>,
{
    let value: Option<MoodField> = Option::deserialize(deserializer)?;
    Ok(value.map(|field| match field {
        MoodField::Object(note) => note,
        MoodField::Name(name) => MoodNote {
            name,
            intensity: None,
            cause: None,
            wants: None,
        },
    }))
}

fn deserialize_closeness<'de, D>(deserializer: D) -> Result<Option<i32>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum ClosenessValue {
        Int(i32),
        Float(f64),
    }

    let value: Option<ClosenessValue> = Option::deserialize(deserializer)?;
    Ok(value.map(|v| match v {
        ClosenessValue::Int(i) => i,
        ClosenessValue::Float(f) => f.round() as i32,
    }))
}

/// Parse a hidden turn-notes trailer into structured notes.
pub fn parse_turn_notes(trailer: &str) -> Option<TurnNotes> {
    let stripped = strip_code_fences(trailer);
    let start = stripped.find('{')?;
    let end = stripped.rfind('}')?;
    if end < start {
        return None;
    }
    let json = &stripped[start..=end];
    let raw: TurnNotesRaw = serde_json::from_str(json).ok()?;
    Some(TurnNotes {
        remember: raw.remember,
        moment: raw.moment,
        mood: raw.mood,
        closeness: raw.closeness,
        open_threads: raw.open_threads,
        closed_threads: raw.closed_threads,
    })
}

fn strip_code_fences(text: &str) -> String {
    text.replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string()
}

const TURN_NOTE_KEYS: &[&str] = &[
    "remember",
    "moment",
    "mood",
    "closeness",
    "open_threads",
    "closed_threads",
];

fn looks_like_turn_notes_json(json: &str) -> bool {
    let value: serde_json::Value = match serde_json::from_str(json) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let Some(obj) = value.as_object() else {
        return false;
    };
    TURN_NOTE_KEYS.iter().any(|key| obj.contains_key(*key))
}

fn find_last_json_object(text: &str) -> Option<(usize, usize)> {
    let mut end = None;
    for (idx, ch) in text.char_indices().rev() {
        if ch == '}' {
            end = Some(idx);
            break;
        }
    }
    let end = end?;
    let mut depth = 0;
    let mut start = None;
    for (idx, ch) in text[..=end].char_indices().rev() {
        match ch {
            '}' => depth += 1,
            '{' => {
                depth -= 1;
                if depth == 0 {
                    start = Some(idx);
                    break;
                }
            }
            _ => {}
        }
    }
    Some((start?, end + 1))
}

fn strip_trailer_wrapper(text: &mut String, json_start: usize, json_end: usize) {
    let before = &text[..json_start];
    let after = &text[json_end..];

    let mut visible = String::new();
    visible.push_str(before.trim_end());

    if let Some(marker_pos) = before.rfind(MARKER) {
        visible.truncate(marker_pos);
        strip_dangling_fence_suffix(&mut visible);
    } else {
        strip_dangling_fence_suffix(&mut visible);
    }

    let mut tail = after.trim_start();
    if let Some(rest) = tail.strip_prefix(">>>") {
        tail = rest.trim_start();
    }
    if !tail.is_empty() {
        if !visible.is_empty() && !visible.ends_with('\n') {
            visible.push('\n');
        }
        visible.push_str(tail);
    }

    *text = visible.trim_end().to_string();
}

/// Recover a turn-notes JSON object when the agent omitted the `<<<meuxe` wrapper.
pub fn recover_turn_notes_from_reply(text: &str) -> Option<(String, String)> {
    let (start, end) = find_last_json_object(text)?;
    let json = &text[start..end];
    if !looks_like_turn_notes_json(json) {
        return None;
    }
    let mut visible = text.to_string();
    strip_trailer_wrapper(&mut visible, start, end);
    Some((visible, json.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recover_trailing_json_without_marker() {
        let reply = r#"That sounds lovely!
{ "remember": ["Rex is a corgi"], "mood": "happy" }"#;
        let (visible, trailer) = recover_turn_notes_from_reply(reply).unwrap();
        assert_eq!(visible, "That sounds lovely!");
        let notes = parse_turn_notes(&trailer).unwrap();
        assert_eq!(notes.remember, vec!["Rex is a corgi"]);
        assert_eq!(notes.mood.unwrap().name, "happy");
    }

    #[test]
    fn recover_does_not_strip_ordinary_braces() {
        let reply = "I think {braces} in prose are fine.";
        assert!(recover_turn_notes_from_reply(reply).is_none());
    }

    #[test]
    fn recover_still_parses_meuxe_marker_path() {
        let mut splitter = TrailerSplitter::new();
        let visible = splitter.feed("Sure thing.\n<<<meuxe\n{\"remember\":[\"x\"]}\n>>>");
        assert_eq!(visible, "Sure thing.");
        let (rest, trailer) = splitter.finish();
        assert_eq!(rest, "");
        let notes = parse_turn_notes(trailer.as_deref().unwrap()).unwrap();
        assert_eq!(notes.remember, vec!["x"]);
    }

    #[test]
    fn trailer_split_across_chunks() {
        let mut splitter = TrailerSplitter::new();
        let a = splitter.feed("Hi there. <<");
        assert_eq!(a, "Hi there. ");
        let b = splitter.feed("<meuxe\n{\"remember\":[\"x\"]}\n>>>");
        assert_eq!(b, "");
        let (rest, trailer) = splitter.finish();
        assert_eq!(rest, "");
        assert_eq!(trailer.as_deref(), Some("{\"remember\":[\"x\"]}"));
    }

    #[test]
    fn lone_angle_bracket_not_marker() {
        let mut splitter = TrailerSplitter::new();
        let out = splitter.feed("I think < this is fine.");
        assert_eq!(out, "I think < this is fine.");
        let (rest, trailer) = splitter.finish();
        assert_eq!(rest, "");
        assert!(trailer.is_none());
    }

    #[test]
    fn strips_fence_before_marker() {
        let mut splitter = TrailerSplitter::new();
        let visible = splitter.feed("Reply text\n```json\n<<<meuxe\n{}\n>>>");
        assert_eq!(visible, "Reply text");
        let (rest, trailer) = splitter.finish();
        assert_eq!(rest, "");
        assert_eq!(trailer.as_deref(), Some("{}"));
    }

    #[test]
    fn parse_turn_notes_lenient() {
        let trailer = r#"Here is context
```json
{"remember":["They have a cat"],"mood":"happy","closeness":1.7}
```
"#;
        let notes = parse_turn_notes(trailer).unwrap();
        assert_eq!(notes.remember, vec!["They have a cat"]);
        assert_eq!(notes.mood.unwrap().name, "happy");
        assert_eq!(notes.closeness, Some(2));

        assert!(parse_turn_notes("not json").is_none());
    }
}
