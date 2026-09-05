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

        let hold = longest_marker_prefix_suffix(&self.visible)
            .max(trailing_possible_turn_notes_hold(&self.visible));
        let emit_len = self.visible.len() - hold;
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
            return (self.visible, trailer);
        }
        if let Some((visible, recovered)) = recover_turn_notes_from_reply(&self.visible) {
            (visible, Some(recovered))
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
    if obj.is_empty() {
        return false;
    }
    let known = obj
        .keys()
        .filter(|key| TURN_NOTE_KEYS.contains(&key.as_str()))
        .count();
    known >= 2 && obj.keys().all(|key| TURN_NOTE_KEYS.contains(&key.as_str()))
}

fn looks_like_json_object_start(after_brace: &str) -> bool {
    let rest = after_brace.trim_start();
    rest.is_empty() || rest.starts_with('"') || rest.starts_with('}')
}

fn last_json_object_start(text: &str) -> Option<usize> {
    let mut last = None;
    for (idx, ch) in text.char_indices() {
        if ch == '{' && looks_like_json_object_start(&text[idx + '{'.len_utf8()..]) {
            last = Some(idx);
        }
    }
    last
}

fn matching_object_end(text: &str, start: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut in_str = false;
    let mut escape = false;
    for (offset, ch) in text[start..].char_indices() {
        if in_str {
            if escape {
                escape = false;
                continue;
            }
            if ch == '\\' {
                escape = true;
                continue;
            }
            if ch == '"' {
                in_str = false;
            }
            continue;
        }
        match ch {
            '"' => in_str = true,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(start + offset + ch.len_utf8());
                }
            }
            _ => {}
        }
    }
    None
}

fn include_leading_fence(text: &str, json_start: usize) -> usize {
    let before = &text[..json_start];
    let trimmed = before.trim_end();
    if let Some(rest) = trimmed.strip_suffix("```json") {
        return rest.len();
    }
    if let Some(rest) = trimmed.strip_suffix("```") {
        return rest.len();
    }
    json_start
}

fn suffix_is_trailer_framing(after: &str) -> bool {
    let mut rest = after.trim_start();
    if let Some(stripped) = rest.strip_prefix(">>>") {
        rest = stripped.trim_start();
    }
    rest.trim().is_empty() || rest.trim() == "```"
}

/// Hold a trailing `{...}` that may still be an unwrapped turn-notes block.
fn trailing_possible_turn_notes_hold(text: &str) -> usize {
    let Some(start) = last_json_object_start(text) else {
        return 0;
    };
    let hold_from = include_leading_fence(text, start);
    match matching_object_end(text, start) {
        None => text.len() - hold_from,
        Some(end) => {
            if suffix_is_trailer_framing(&text[end..])
                && looks_like_turn_notes_json(&text[start..end])
            {
                text.len() - hold_from
            } else {
                0
            }
        }
    }
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
    if !suffix_is_trailer_framing(&text[end..]) {
        return None;
    }
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
    fn recover_ignores_single_field_json() {
        let reply = r#"Here is the weather: {"mood":"sunny"}"#;
        assert!(recover_turn_notes_from_reply(reply).is_none());
    }

    #[test]
    fn recover_ignores_json_with_extra_keys() {
        let reply = r#"{"remember":["Rex"],"mood":"happy","temperature":72}"#;
        assert!(recover_turn_notes_from_reply(reply).is_none());
    }

    #[test]
    fn recover_ignores_json_followed_by_speech() {
        let reply = r#"{"remember":["Rex"],"mood":"happy"} and then I kept talking."#;
        assert!(recover_turn_notes_from_reply(reply).is_none());
    }

    #[test]
    fn splitter_holds_unwrapped_turn_notes_off_the_stream() {
        let mut splitter = TrailerSplitter::new();
        let a = splitter.feed("Sure thing.\n");
        assert_eq!(a, "Sure thing.\n");
        let b = splitter.feed(r#"{ "remember": ["Rex is a corgi"], "mood": "happy" }"#);
        assert_eq!(b, "");
        let (rest, trailer) = splitter.finish();
        assert_eq!(rest, "");
        let notes = parse_turn_notes(trailer.as_deref().unwrap()).unwrap();
        assert_eq!(notes.remember, vec!["Rex is a corgi"]);
        assert_eq!(notes.mood.unwrap().name, "happy");
    }

    #[test]
    fn splitter_emits_ordinary_json_the_user_asked_for() {
        let mut splitter = TrailerSplitter::new();
        let visible = splitter.feed(r#"Here: {"mood":"sunny"}"#);
        assert_eq!(visible, r#"Here: {"mood":"sunny"}"#);
        let (rest, trailer) = splitter.finish();
        assert_eq!(rest, "");
        assert!(trailer.is_none());
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
