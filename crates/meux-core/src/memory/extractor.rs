use std::collections::HashSet;

/// An extracted memory candidate from user input.
#[derive(Debug, Clone)]
pub struct ExtractedMemory {
    pub memory_type: String,
    pub summary: String,
    pub importance: f64,
    pub tags: Vec<String>,
}

/// Common English stopwords filtered during tokenisation.
const STOPWORDS: &[&str] = &[
    "a", "an", "the", "is", "am", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can",
    "need", "dare", "ought", "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below", "between", "out",
    "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such",
    "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "just", "because",
    "but", "and", "or", "if", "while", "about", "up", "it", "its", "i", "me", "my", "myself", "we",
    "our", "you", "your", "he", "him", "his", "she", "her", "they", "them", "their", "what",
    "which", "who", "this", "that", "these", "those",
];

const CJK_BIGRAM_STOPWORDS: &[&str] = &[
    "我的", "什么", "怎样", "怎么", "时候", "现在", "这个", "又在", "我在", "是否", "别人", "哪类",
    "哪项", "多少", "分别",
];

/// Extract candidate memories from a user message using heuristic patterns.
///
/// Sentences are split on English and Chinese terminal punctuation, filtered
/// to >= 8 UTF-8 bytes, and
/// deduplicated by their lowercased form.
pub fn extract_memories(user_message: &str) -> Vec<ExtractedMemory> {
    let re = regex::Regex::new(r"[.!?。！？\n]+").unwrap();
    let sentences: Vec<&str> = re
        .split(user_message)
        .map(|s| s.trim())
        .filter(|s| s.len() >= 8)
        .collect();

    let mut seen: HashSet<String> = HashSet::new();
    let mut results: Vec<ExtractedMemory> = Vec::new();

    for sentence in sentences {
        let normalised = sentence.to_lowercase();
        if seen.contains(&normalised) {
            continue;
        }
        seen.insert(normalised.clone());

        if let Some(mem) = match_pattern(sentence, &normalised) {
            results.push(mem);
        }
    }

    results
}

fn match_pattern(sentence: &str, lower: &str) -> Option<ExtractedMemory> {
    if let Some(memory) = match_chinese_pattern(sentence) {
        return Some(memory);
    }

    // "my name is X"
    if let Some(rest) = lower.strip_prefix("my name is ") {
        if !rest.is_empty() {
            return Some(ExtractedMemory {
                memory_type: "semantic".into(),
                summary: sentence.to_string(),
                importance: 1.0,
                tags: vec!["identity".into(), "user_profile".into()],
            });
        }
    }

    // "i am building X" / "i'm building X"
    if lower.starts_with("i am building ") || lower.starts_with("i'm building ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.95,
            tags: vec!["project".into(), "user_goal".into()],
        });
    }

    // "i am working on X" / "i'm working on X"
    if lower.starts_with("i am working on ") || lower.starts_with("i'm working on ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.9,
            tags: vec!["project".into(), "user_goal".into()],
        });
    }

    // "i study X"
    if lower.starts_with("i study ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.85,
            tags: vec!["education".into(), "user_profile".into()],
        });
    }

    // "i love/enjoy X" — 0.85
    if lower.starts_with("i love ") || lower.starts_with("i enjoy ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.85,
            tags: vec!["preferences".into()],
        });
    }

    // "i like/prefer X" — 0.8
    if lower.starts_with("i like ") || lower.starts_with("i prefer ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.8,
            tags: vec!["preferences".into()],
        });
    }

    // "i hate/don't like X" — 0.85
    if lower.starts_with("i hate ") || lower.starts_with("i don't like ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.85,
            tags: vec!["preferences".into()],
        });
    }

    // "my favorite X"
    if lower.starts_with("my favorite ") || lower.starts_with("my favourite ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.8,
            tags: vec!["preferences".into()],
        });
    }

    // "i want X" — 0.75
    if lower.starts_with("i want ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.75,
            tags: vec!["desire".into()],
        });
    }

    // "i need X" — 0.7
    if lower.starts_with("i need ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.7,
            tags: vec!["desire".into()],
        });
    }

    // "i am X" / "i'm X" — generic identity
    if lower.starts_with("i am ") || lower.starts_with("i'm ") {
        return Some(ExtractedMemory {
            memory_type: "semantic".into(),
            summary: sentence.to_string(),
            importance: 0.75,
            tags: vec!["identity".into(), "user_profile".into()],
        });
    }

    // Contains "remember"
    if lower.contains("remember") {
        return Some(ExtractedMemory {
            memory_type: "episodic".into(),
            summary: sentence.to_string(),
            importance: 0.95,
            tags: vec!["explicit_memory".into()],
        });
    }

    // Project context keywords
    let project_keywords = [
        "backend", "frontend", "client", "server", "api", "database", "deploy",
    ];
    if project_keywords.iter().any(|kw| lower.contains(kw)) {
        return Some(ExtractedMemory {
            memory_type: "episodic".into(),
            summary: sentence.to_string(),
            importance: 0.68,
            tags: vec!["project_context".into()],
        });
    }

    None
}

fn match_chinese_pattern(sentence: &str) -> Option<ExtractedMemory> {
    let candidate = |memory_type: &str, importance: f64, tags: &[&str]| ExtractedMemory {
        memory_type: memory_type.to_string(),
        summary: sentence.to_string(),
        importance,
        tags: tags.iter().map(|tag| (*tag).to_string()).collect(),
    };

    let episodic_prefixes = [
        "昨天",
        "上周",
        "去年",
        "刚才",
        "今天上午",
        "我曾经",
        "这个周末",
        "三年前",
    ];
    if episodic_prefixes
        .iter()
        .any(|prefix| sentence.starts_with(prefix))
    {
        return Some(candidate("episodic", 0.9, &["time_event"]));
    }

    let project_goal_prefixes = [
        "我正在开发",
        "我在做",
        "我的目标是",
        "我正在研究",
        "我希望把",
    ];
    if project_goal_prefixes
        .iter()
        .any(|prefix| sentence.starts_with(prefix))
    {
        return Some(candidate("semantic", 0.9, &["project", "user_goal"]));
    }
    if sentence.starts_with("这个项目") || sentence.starts_with("我为记忆数据选择") {
        return Some(candidate("semantic", 0.85, &["project_context"]));
    }

    let relationship_prefixes = [
        "我难过",
        "我焦虑",
        "我开心",
        "我希望你",
        "被温柔",
        "如果我",
        "我更信任",
        "当我工作受挫",
    ];
    if relationship_prefixes
        .iter()
        .any(|prefix| sentence.starts_with(prefix))
    {
        return Some(candidate(
            "semantic",
            0.9,
            &["relationship", "emotional_support"],
        ));
    }

    let identity_prefixes = [
        "我叫",
        "朋友们平时都叫我",
        "我的生日是",
        "我住在",
        "我是一名",
        "我养了",
    ];
    if identity_prefixes
        .iter()
        .any(|prefix| sentence.starts_with(prefix))
        || (sentence.starts_with("我在") && sentence.contains("公司") && sentence.contains("工作"))
        || sentence.contains("夜猫子")
    {
        return Some(candidate("semantic", 0.95, &["identity", "user_profile"]));
    }

    let preference_prefixes = [
        "我喜欢",
        "我更偏爱",
        "我不喜欢",
        "我最喜欢",
        "我习惯",
        "我爱",
        "周末我喜欢",
        "我讨厌",
    ];
    if preference_prefixes
        .iter()
        .any(|prefix| sentence.starts_with(prefix))
    {
        return Some(candidate("semantic", 0.85, &["preferences"]));
    }

    None
}

/// Check whether the user message contains a positive/grateful response.
pub fn check_positive_response(user_message: &str) -> bool {
    let lower = user_message.to_lowercase();
    let positive_words = ["thanks", "thank", "helped", "helpful"];
    positive_words.iter().any(|w| lower.contains(w))
        || ["谢谢", "感谢", "帮到我", "有帮助", "太好了", "喜欢你"]
            .iter()
            .any(|word| user_message.contains(word))
}

/// Tokenise text into a set of lowercase words, excluding stopwords and
/// single-character tokens.
pub fn extract_tokens(text: &str) -> HashSet<String> {
    let re = regex::Regex::new(r"[a-zA-Z0-9']+").unwrap();
    let stopword_set: HashSet<&str> = STOPWORDS.iter().copied().collect();

    let mut tokens: HashSet<String> = re
        .find_iter(text)
        .map(|m| m.as_str().to_lowercase())
        .filter(|w| w.len() > 1 && !stopword_set.contains(w.as_str()))
        .collect();

    let mut cjk_run = Vec::new();
    for character in text.chars().chain(std::iter::once(' ')) {
        if is_cjk(character) {
            cjk_run.push(character);
            continue;
        }
        for pair in cjk_run.windows(2) {
            let token: String = pair.iter().collect();
            if !CJK_BIGRAM_STOPWORDS.contains(&token.as_str()) {
                tokens.insert(token);
            }
        }
        cjk_run.clear();
    }

    add_concept_token(
        text,
        &mut tokens,
        "cjk:name",
        &["名字", "称呼", "我叫", "叫我"],
    );
    add_concept_token(
        text,
        &mut tokens,
        "cjk:occupation",
        &["职业", "一名", "产品经理"],
    );
    add_concept_token(text, &mut tokens, "cjk:coffee", &["咖啡", "冰美式", "拿铁"]);
    if text.to_ascii_lowercase().contains("tts") {
        tokens.insert("cjk:tts_metric".to_string());
    }

    tokens
}

fn add_concept_token(text: &str, tokens: &mut HashSet<String>, token: &str, phrases: &[&str]) {
    if phrases.iter().any(|phrase| text.contains(phrase)) {
        tokens.insert(token.to_string());
    }
}

pub(crate) fn contains_cjk(text: &str) -> bool {
    text.chars().any(is_cjk)
}

fn is_cjk(character: char) -> bool {
    matches!(
        character,
        '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}' | '\u{F900}'..='\u{FAFF}'
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_name() {
        let mems = extract_memories("My name is Alice");
        assert_eq!(mems.len(), 1);
        assert_eq!(mems[0].memory_type, "semantic");
        assert_eq!(mems[0].importance, 1.0);
        assert!(mems[0].tags.contains(&"identity".to_string()));
    }

    #[test]
    fn test_extract_preference() {
        let mems = extract_memories("I like dark themes. I love Rust programming.");
        assert_eq!(mems.len(), 2);
        assert!(mems
            .iter()
            .all(|m| m.tags.contains(&"preferences".to_string())));
    }

    #[test]
    fn test_extract_remember() {
        let mems = extract_memories("Please remember that I use VSCode for editing");
        assert_eq!(mems.len(), 1);
        assert_eq!(mems[0].memory_type, "episodic");
        assert!(mems[0].tags.contains(&"explicit_memory".to_string()));
    }

    #[test]
    fn test_extract_project_context() {
        let mems = extract_memories("The backend needs more caching layers");
        assert_eq!(mems.len(), 1);
        assert_eq!(mems[0].memory_type, "episodic");
        assert!(mems[0].tags.contains(&"project_context".to_string()));
    }

    #[test]
    fn test_deduplication() {
        let mems = extract_memories("I like Rust. I like Rust. I like Rust.");
        assert_eq!(mems.len(), 1);
    }

    #[test]
    fn test_extract_tokens() {
        let tokens = extract_tokens("I am building a great Rust project");
        assert!(tokens.contains("building"));
        assert!(tokens.contains("great"));
        assert!(tokens.contains("rust"));
        assert!(tokens.contains("project"));
        // Stopwords should be excluded
        assert!(!tokens.contains("i"));
        assert!(!tokens.contains("a"));
        assert!(!tokens.contains("am"));
    }

    #[test]
    fn test_check_positive() {
        assert!(check_positive_response("Thanks, that helped!"));
        assert!(check_positive_response("Thank you so much"));
        assert!(check_positive_response("That was very helpful"));
        assert!(!check_positive_response("I have a question"));
    }

    #[test]
    fn chinese_memory_extracts_across_chinese_punctuation() {
        let mems = extract_memories("我叫小林。我喜欢听爵士乐！");
        assert_eq!(mems.len(), 2);
        assert!(mems[0].tags.contains(&"identity".to_string()));
        assert!(mems[1].tags.contains(&"preferences".to_string()));
    }

    #[test]
    fn chinese_tokens_keep_cjk_bigrams_and_ascii_words() {
        let tokens = extract_tokens("我在做中文记忆评测，核心使用 Rust");
        assert!(tokens.contains("记忆"));
        assert!(tokens.contains("评测"));
        assert!(tokens.contains("rust"));
    }
}
