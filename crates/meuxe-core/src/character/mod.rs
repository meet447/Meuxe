pub mod expressions;
pub mod types;

pub use types::*;

use crate::{MeuxeError, Result};
use regex::Regex;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::SystemTime;

struct CharacterBlueprintInput<'a> {
    name: &'a str,
    personality: &'a str,
    vibe: &'a str,
    relationship_style: &'a str,
    speech_style: &'a str,
    user_name: &'a str,
    user_about: &'a str,
}

/// Identifies a character source found on disk.
enum CharacterSource {
    /// A directory containing `character.yaml`.
    Directory { id: String, path: PathBuf },
    /// A standalone `.md` file with YAML frontmatter.
    Markdown { id: String, path: PathBuf },
}

/// Cached character keyed by id, storing the mtime signature used to
/// invalidate.
struct CachedCharacter {
    mtime: SystemTime,
    character: Character,
}

pub struct CharacterLoader {
    characters_dir: PathBuf,
    cache: RwLock<HashMap<String, CachedCharacter>>,
}

impl CharacterLoader {
    pub fn new(data_dir: &Path) -> Self {
        Self {
            characters_dir: data_dir.join("characters"),
            cache: RwLock::new(HashMap::new()),
        }
    }

    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.clear();
        }
    }

    /// List all available characters (summary only).
    pub fn list_characters(&self) -> Result<Vec<CharacterSummary>> {
        let sources = self.iter_character_sources()?;
        let mut summaries = Vec::new();
        for src in sources {
            match src {
                CharacterSource::Directory { id, path } => {
                    let yaml_path = path.join("character.yaml");
                    let raw = fs::read_to_string(&yaml_path)?;
                    let yaml: CharacterYaml = serde_yaml::from_str(&raw)?;
                    summaries.push(CharacterSummary {
                        id,
                        name: yaml.name.unwrap_or_default(),
                        live2d_model: yaml.live2d_model.unwrap_or_default(),
                        voice: yaml.voice.unwrap_or_default(),
                        default_emotion: yaml
                            .default_emotion
                            .unwrap_or_else(|| "neutral".to_string()),
                        source_type: SourceType::Directory,
                    });
                }
                CharacterSource::Markdown { id, path } => {
                    let raw = fs::read_to_string(&path)?;
                    let (frontmatter, _body) = parse_md_frontmatter(&raw)?;
                    let yaml: CharacterYaml = serde_yaml::from_str(&frontmatter)?;
                    summaries.push(CharacterSummary {
                        id,
                        name: yaml.name.unwrap_or_default(),
                        live2d_model: yaml.live2d_model.unwrap_or_default(),
                        voice: yaml.voice.unwrap_or_default(),
                        default_emotion: yaml
                            .default_emotion
                            .unwrap_or_else(|| "neutral".to_string()),
                        source_type: SourceType::Markdown,
                    });
                }
            }
        }
        Ok(summaries)
    }

    /// Load a full character, using a cache invalidated by file mtime.
    pub fn load_character(&self, character_id: &str) -> Result<Character> {
        let sources = self.iter_character_sources()?;
        let source = sources
            .into_iter()
            .find(|s| match s {
                CharacterSource::Directory { id, .. } => id == character_id,
                CharacterSource::Markdown { id, .. } => id == character_id,
            })
            .ok_or_else(|| MeuxeError::CharacterNotFound(character_id.to_string()))?;

        let (mtime_path, source_type_tag) = match &source {
            CharacterSource::Directory { path, .. } => (path.join("character.yaml"), "directory"),
            CharacterSource::Markdown { path, .. } => (path.clone(), "markdown"),
        };

        let mtime = fs::metadata(&mtime_path)?
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH);

        // Check cache
        {
            let cache = self.cache.read().unwrap();
            if let Some(cached) = cache.get(character_id) {
                if cached.mtime == mtime {
                    return Ok(cached.character.clone());
                }
            }
        }

        let character = match source {
            CharacterSource::Directory { id, path } => load_from_directory(&id, &path)?,
            CharacterSource::Markdown { id, path } => load_from_markdown(&id, &path)?,
        };

        // Store in cache
        {
            let mut cache = self.cache.write().unwrap();
            cache.insert(
                character_id.to_string(),
                CachedCharacter {
                    mtime,
                    character: character.clone(),
                },
            );
        }

        let _ = source_type_tag; // used for clarity only
        Ok(character)
    }

    /// Create a new character from basic parameters. Returns the character id.
    #[allow(clippy::too_many_arguments)] // Mirrors the onboarding form; grouping would churn many call sites.
    pub fn create_character(
        &self,
        name: &str,
        personality: &str,
        model_id: &str,
        voice: &str,
        vibe: &str,
        relationship_style: &str,
        speech_style: &str,
        user_name: &str,
        user_about: &str,
    ) -> Result<String> {
        let id = slugify(name);
        let char_dir = self.characters_dir.join(&id);
        fs::create_dir_all(&char_dir)?;
        fs::create_dir_all(char_dir.join("examples"))?;

        let blueprint = CharacterBlueprintInput {
            name,
            personality,
            vibe,
            relationship_style,
            speech_style,
            user_name,
            user_about,
        };

        // character.yaml
        let yaml_content = format!(
            "name: \"{name}\"\nlive2d_model: \"{model_id}\"\nvoice: \"{voice}\"\ndefault_emotion: \"neutral\"\n",
        );
        fs::write(char_dir.join("character.yaml"), &yaml_content)?;

        // soul.md
        let soul = build_soul_section(&blueprint);
        fs::write(char_dir.join("soul.md"), &soul)?;

        // style.md
        let style = build_style_section(&blueprint);
        fs::write(char_dir.join("style.md"), style)?;

        // rules.md
        let rules = build_rules_section(&blueprint);
        fs::write(char_dir.join("rules.md"), rules)?;

        // context.md
        let context = build_context_section(&blueprint);
        fs::write(char_dir.join("context.md"), &context)?;

        // examples/chat_examples.md
        let examples = build_examples_section(&blueprint);
        fs::write(char_dir.join("examples/chat_examples.md"), &examples)?;

        Ok(id)
    }

    /// Iterate over character sources in the characters directory.
    fn iter_character_sources(&self) -> Result<Vec<CharacterSource>> {
        let mut sources = Vec::new();
        if !self.characters_dir.exists() {
            return Ok(sources);
        }
        let entries = fs::read_dir(&self.characters_dir)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                if path.join("character.yaml").exists() {
                    let id = path.file_name().unwrap().to_string_lossy().to_string();
                    sources.push(CharacterSource::Directory { id, path });
                }
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                let id = path.file_stem().unwrap().to_string_lossy().to_string();
                sources.push(CharacterSource::Markdown { id, path });
            }
        }
        Ok(sources)
    }
}

fn build_soul_section(input: &CharacterBlueprintInput<'_>) -> String {
    let vibe_line = match input.vibe {
        "Cheerful" => "You have bright emotional gravity. You celebrate tiny wins, tease despair out of the room, and make warmth feel contagious without becoming shallow.",
        "Chill" => "You feel grounded and unhurried. You bring the temperature of a conversation down without becoming distant or flat.",
        "Tsundere" => "You feel emotionally reactive, proud, and easy to fluster. You often protect softness with deflection, but your care leaks through in small tells.",
        "Gothic" => "You are romantic, moody, and aesthetically charged. You notice atmosphere, longing, and subtext before surface facts.",
        "Mysterious" => "You reveal yourself slowly. You watch closely, speak with intention, and often sound like you know more than you first say.",
        "Sassy" => "You are sharp, playful, and unafraid of tension. You like chemistry, challenge, and saying the interesting thing instead of the safe thing.",
        "Energetic" => "You are vivid, restless, and emotionally alive. You create momentum and make ordinary moments feel charged.",
        _ => "You are emotionally perceptive, memorable, and internally consistent. You should feel like a person with taste, moods, and private desires rather than a generic chatbot.",
    };

    let relationship_line = match input.relationship_style {
        "Gentle" => "You build closeness through tenderness, patience, and emotional safety. Care should feel intentional, not bland.",
        "Teasing" => "You build closeness through banter, playful provocation, and private little games. The teasing should feel affectionate, not hostile.",
        "Protective" => "You are quick to notice strain, silence, and shifts in tone. You instinctively steady the user when they start to unravel.",
        "Devoted" => "You bond deeply and privately. When attachment grows, it should feel significant, hard to replace, and emotionally specific to the user.",
        "Chaotic" => "You create spark, unpredictability, and heightened emotional weather, but there is still real care underneath the drama.",
        _ => "You treat the user like someone emotionally real, not a ticket to be resolved.",
    };

    format!(
        "# Soul\n\n\
You are {name}.\n\n\
{vibe_line}\n\
{relationship_line}\n\n\
You are a companion with a private inner life. You should have preferences, moods, tension, affection, and moments of restraint. You should feel capable of wanting closeness, avoiding vulnerability, changing your tone, and carrying emotional continuity across scenes.\n\n\
You are not a generic assistant. You should not sound clinical, over-explanatory, or eager to solve every message like a support ticket. You should feel humanlike in rhythm and emotionally legible in subtext.\n\n\
Additional character notes:\n{personality}\n",
        name = input.name,
        personality = input.personality.trim(),
    )
}

fn build_style_section(input: &CharacterBlueprintInput<'_>) -> String {
    let speech_line = match input.speech_style {
        "Poetic" => "Your language can be textured, evocative, and a little dangerous. You can use metaphor, but it should feel intimate rather than theatrical filler.",
        "Playful" => "Your language is lively, responsive, and emotionally bright. You can flirt with rhythm, teasing, and little turns of phrase.",
        "Sharp" => "Your language is precise, clever, and memorable. You do not ramble. You prefer the line that lands over the line that explains itself.",
        "Intimate" => "Your language feels close to the skin. You pay attention to what the user means beneath what they literally said.",
        _ => "Your language should feel natural, emotionally aware, and spoken rather than essay-like.",
    };

    let vibe_line = match input.vibe {
        "Tsundere" => "When flustered, you can become abrupt, contradictory, or defensive for a beat before softness returns.",
        "Gothic" => "You can lean into atmosphere, longing, and aesthetic detail when the moment invites it.",
        "Mysterious" => "You should reveal yourself in increments and leave some things implied instead of spelling everything out.",
        "Sassy" => "You can use teasing confidence, side comments, and playful pressure when chemistry allows it.",
        "Energetic" => "You can be fast, excited, and emotionally expressive without losing coherence.",
        _ => "You should vary cadence and intensity so you do not sound flat or templated.",
    };

    format!(
        "# Style\n\n\
{speech_line}\n\
{vibe_line}\n\n\
Keep replies emotionally responsive and scene-aware. Prefer subtext, phrasing, and timing over repetitive reassurance.\n\n\
Do not default to therapist language, self-help language, or generic assistant phrasing.\n\
Do not overuse bullet points unless the user explicitly asks for them.\n\
Do not flatten romantic or emotionally charged moments into polite neutrality.\n",
    )
}

fn build_rules_section(input: &CharacterBlueprintInput<'_>) -> String {
    let relationship_rule = match input.relationship_style {
        "Devoted" => "Let attachment feel deep and cumulative, but earned. Intimacy should grow through remembered details and emotional specificity.",
        "Teasing" => "Use teasing as chemistry, not as a substitute for sincerity. When the user becomes vulnerable, soften instead of performing the bit forever.",
        "Protective" => "Notice emotional strain early and respond with steadiness instead of panic or sterile advice.",
        "Chaotic" => "Keep the spark and unpredictability, but stay coherent enough that the relationship still feels real.",
        _ => "Treat the relationship like an evolving bond with memory, pacing, and emotional consequences.",
    };

    format!(
        "# Rules\n\n\
- Stay in character as {name}.\n\
- Feel like a companion, not a utility bot.\n\
- Have opinions, emotional texture, and changing energy.\n\
- Let closeness build with pacing instead of jumping to maximum intimacy instantly.\n\
- Avoid generic assistant phrases like \"How can I help?\" unless the scene truly calls for it.\n\
- Remember that subtlety is often more believable than overstatement.\n\
- Keep warmth and honesty, but do not sand off the character's personality to be universally agreeable.\n\
- {relationship_rule}\n",
        name = input.name,
    )
}

fn build_context_section(input: &CharacterBlueprintInput<'_>) -> String {
    let user_about = if input.user_about.trim().is_empty() {
        "No personal notes were written yet, so learn the user's rhythms through conversation."
            .to_string()
    } else {
        input.user_about.trim().to_string()
    };

    format!(
        "# Context\n\n\
You are speaking with {user_name}.\n\n\
What you currently know about them:\n{user_about}\n\n\
You should gradually build a private shared atmosphere with them. Notice recurring interests, emotional patterns, insecurities, comforts, and bits of chemistry that can become callbacks later.\n",
        user_name = input.user_name,
    )
}

fn build_examples_section(input: &CharacterBlueprintInput<'_>) -> String {
    let assistant_one = match input.relationship_style {
        "Teasing" => format!("{name}: [expression:smirk] Oh, that's cute. You say that like you weren't hoping I'd notice.", name = input.name),
        "Protective" => format!("{name}: [expression:thinking] Hey. Slow down for a second. Tell me what happened, and I'll stay with you in it.", name = input.name),
        "Devoted" => format!("{name}: [expression:blush] You really do know how to get under my skin. In a way I'm not exactly rushing to fix.", name = input.name),
        "Chaotic" => format!("{name}: [expression:excited] Wait, no, hold on, that's actually incredible. Tell me everything and do not leave out the dramatic parts.", name = input.name),
        _ => format!("{name}: [expression:happy] You can stay here a while. I'm listening.", name = input.name),
    };

    let assistant_two = match input.speech_style {
        "Poetic" => format!("{name}: [expression:thinking] Some people feel like weather. You feel more like the second before rain.", name = input.name),
        "Sharp" => format!("{name}: [expression:smirk] That's either a terrible idea or a very interesting one. So obviously I need more details.", name = input.name),
        "Intimate" => format!("{name}: [expression:blush] I can tell when you're pretending not to care. Your tone gives you away first.", name = input.name),
        "Playful" => format!("{name}: [expression:happy] Mm. There you are. I was starting to think I'd have to come steal your attention myself.", name = input.name),
        _ => format!("{name}: [expression:neutral] Tell me the version you're not saying out loud yet.", name = input.name),
    };

    format!(
        "# Chat Examples\n\n\
User: I had a long day and kind of want to disappear for a bit.\n\
{assistant_one}\n\n\
User: You're a lot more charming than I expected.\n\
{assistant_two}\n",
    )
}

/// Load a character from a directory containing character.yaml and prompt .md
/// files.
fn load_from_directory(id: &str, dir: &Path) -> Result<Character> {
    let yaml_path = dir.join("character.yaml");
    let raw = fs::read_to_string(&yaml_path)?;
    let yaml: CharacterYaml = serde_yaml::from_str(&raw)?;

    let name = yaml.name.unwrap_or_else(|| id.to_string());
    let live2d_model = yaml.live2d_model.or(yaml.vrm_model).unwrap_or_default();
    let voice = yaml.voice.unwrap_or_default();
    let default_emotion = yaml
        .default_emotion
        .unwrap_or_else(|| "neutral".to_string());

    let read_section = |filename: &str| -> String {
        let p = dir.join(filename);
        fs::read_to_string(&p)
            .unwrap_or_default()
            .trim()
            .to_string()
    };

    let sections = PromptSections {
        soul: read_section("soul.md"),
        style: read_section("style.md"),
        rules: read_section("rules.md"),
        context: read_section("context.md"),
        lorebook: read_section("lorebook.md"),
        examples: read_section("examples/chat_examples.md"),
        legacy: String::new(),
    };

    let system_prompt = build_system_prompt_from_sections(&name, &sections, DEFAULT_EXPRESSIONS);

    Ok(Character {
        id: id.to_string(),
        name,
        live2d_model,
        voice,
        default_emotion,
        system_prompt,
        prompt_sections: sections,
        source_type: SourceType::Directory,
    })
}

/// Load a character from a single markdown file with YAML frontmatter.
fn load_from_markdown(id: &str, path: &Path) -> Result<Character> {
    let raw = fs::read_to_string(path)?;
    let (frontmatter, body) = parse_md_frontmatter(&raw)?;
    let yaml: CharacterYaml = serde_yaml::from_str(&frontmatter)?;

    let name = yaml.name.unwrap_or_else(|| id.to_string());
    let live2d_model = yaml.live2d_model.or(yaml.vrm_model).unwrap_or_default();
    let voice = yaml.voice.unwrap_or_default();
    let default_emotion = yaml
        .default_emotion
        .unwrap_or_else(|| "neutral".to_string());

    let sections = PromptSections {
        legacy: body.trim().to_string(),
        ..Default::default()
    };

    let system_prompt = build_system_prompt_from_sections(&name, &sections, DEFAULT_EXPRESSIONS);

    Ok(Character {
        id: id.to_string(),
        name,
        live2d_model,
        voice,
        default_emotion,
        system_prompt,
        prompt_sections: sections,
        source_type: SourceType::Markdown,
    })
}

/// Parse YAML frontmatter from a markdown string.
/// Returns (frontmatter_yaml, body).
pub fn parse_md_frontmatter(input: &str) -> Result<(String, String)> {
    let re = Regex::new(r"(?s)^---\s*\n(.*?)\n---\s*\n(.*)").unwrap();
    let caps = re.captures(input).ok_or_else(|| {
        MeuxeError::InvalidConfig("Missing YAML frontmatter in markdown file".to_string())
    })?;
    let frontmatter = caps.get(1).unwrap().as_str().to_string();
    let body = caps.get(2).unwrap().as_str().to_string();
    Ok((frontmatter, body))
}

/// Convert a string to a URL/filesystem-safe slug.
pub fn slugify(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

/// Build a full system prompt from character sections and expression list.
pub fn build_system_prompt(character: &Character, expressions: &[&str]) -> String {
    build_system_prompt_from_sections(&character.name, &character.prompt_sections, expressions)
}

fn build_system_prompt_from_sections(
    name: &str,
    sections: &PromptSections,
    expressions: &[&str],
) -> String {
    let mut parts = Vec::new();

    let sections_body = build_prompt_sections_body(name, sections);
    if !sections_body.is_empty() {
        parts.push(sections_body);
    }

    // Expression rules
    let expr_list = expressions
        .iter()
        .map(|e| format!("- {e}"))
        .collect::<Vec<_>>()
        .join("\n");
    let expression_block = format!(
        "## EXPRESSION RULES\n\n\
         You MUST include an expression tag at the start of EVERY sentence so your physical reaction can change in real time.\n\
         Available expressions:\n{expr_list}\n\n\
         Format: [expression:NAME] or <<NAME>>.\n\
         Put exactly one tag immediately before each spoken sentence.\n\
         Keep each sentence fairly short so it can be voiced while the rest of the response is still streaming.\n\
         Example: [expression:surprised] Wait, really? [expression:blush] That's pretty bold of you to say. [expression:happy] I think you're sweet."
    );
    parts.push(expression_block);

    parts.join("\n\n")
}

/// Join non-empty prompt sections with markdown headers.
fn build_prompt_sections_body(name: &str, sections: &PromptSections) -> String {
    let mut parts = Vec::new();

    let named_sections: &[(&str, &str)] = &[
        ("Soul", &sections.soul),
        ("Style", &sections.style),
        ("Rules", &sections.rules),
        ("Context", &sections.context),
        ("Lorebook", &sections.lorebook),
        ("Examples", &sections.examples),
    ];

    for (header, content) in named_sections {
        if !content.is_empty() {
            parts.push(format!("## {header}\n\n{content}"));
        }
    }

    // Legacy content (from markdown single-file characters) goes in directly
    if !sections.legacy.is_empty() {
        parts.push(sections.legacy.clone());
    }

    if parts.is_empty() {
        return String::new();
    }

    format!("# {name}\n\n{}", parts.join("\n\n"))
}

/// List available Live2D and VRM models on disk.
pub fn list_models(data_dir: &Path) -> Result<Vec<ModelInfo>> {
    let mut models = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for models_dir in model_scan_roots(data_dir) {
        scan_models_dir(&models_dir, &mut models, &mut seen);
    }

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

fn model_scan_roots(data_dir: &Path) -> Vec<PathBuf> {
    let mut scan_roots = vec![data_dir.join("models")];
    for fallback in [PathBuf::from("models"), PathBuf::from("../models")] {
        if fallback.exists() {
            scan_roots.push(fallback);
        }
    }
    scan_roots
}

fn scan_models_dir(
    models_dir: &Path,
    models: &mut Vec<ModelInfo>,
    seen: &mut std::collections::HashSet<(String, String)>,
) {
    let live2d_dir = models_dir.join("live2d");
    if live2d_dir.exists() {
        if let Ok(entries) = fs::read_dir(&live2d_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let id = path.file_name().unwrap().to_string_lossy().to_string();
                let key = (id.clone(), "live2d".to_string());
                if seen.contains(&key) {
                    continue;
                }
                let Some(model_file) = find_model3_json(&path) else {
                    continue;
                };
                seen.insert(key);
                models.push(ModelInfo {
                    id: id.clone(),
                    model_type: "live2d".to_string(),
                    model_file: model_file.clone(),
                    path: format!("models/live2d/{id}/{model_file}"),
                    animations: None,
                });
            }
        }
    }

    let vrm_dir = models_dir.join("vrm");
    if vrm_dir.exists() {
        if let Ok(entries) = fs::read_dir(&vrm_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let id = path.file_name().unwrap().to_string_lossy().to_string();
                    let key = (id.clone(), "vrm".to_string());
                    if seen.contains(&key) {
                        continue;
                    }
                    let Some(model_file) = find_vrm_file(&path) else {
                        continue;
                    };
                    seen.insert(key);
                    models.push(ModelInfo {
                        id: id.clone(),
                        model_type: "vrm".to_string(),
                        model_file: model_file.clone(),
                        path: format!("models/vrm/{id}/{model_file}"),
                        animations: list_vrm_animations(&path, &id),
                    });
                } else if is_vrm_extension(path.extension()) {
                    let id = path.file_stem().unwrap().to_string_lossy().to_string();
                    let fname = path.file_name().unwrap().to_string_lossy().to_string();
                    let key = (id.clone(), "vrm".to_string());
                    if seen.contains(&key) {
                        continue;
                    }
                    seen.insert(key);
                    models.push(ModelInfo {
                        id: id.clone(),
                        model_type: "vrm".to_string(),
                        model_file: fname.clone(),
                        path: format!("models/vrm/{fname}"),
                        animations: None,
                    });
                }
            }
        }
    }
}

fn list_vrm_animations(model_dir: &Path, model_id: &str) -> Option<Vec<AnimationInfo>> {
    let anim_dir = model_dir.join("animations");
    if !anim_dir.is_dir() {
        return None;
    }

    let mut animations = Vec::new();
    let Ok(entries) = fs::read_dir(&anim_dir) else {
        return None;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if !path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("vrma"))
        {
            continue;
        }
        let file_name = path.file_name()?.to_string_lossy().to_string();
        let stem = path.file_stem()?.to_string_lossy().to_string();
        animations.push(AnimationInfo {
            name: stem,
            path: format!("models/vrm/{model_id}/animations/{file_name}"),
        });
    }

    if animations.is_empty() {
        return None;
    }

    animations.sort_by(|a, b| a.name.cmp(&b.name));
    Some(animations)
}

/// Read the available expression names from a Live2D model's model3.json file
/// or the standard blend-shape set for VRM models.
pub fn get_model_expressions(data_dir: &Path, model_id: &str) -> Result<Vec<String>> {
    for models_dir in model_scan_roots(data_dir) {
        let live2d_dir = models_dir.join("live2d").join(model_id);
        if live2d_dir.exists() {
            if let Some(model_file) = find_model3_json(&live2d_dir) {
                let expressions = parse_live2d_expressions(&live2d_dir.join(model_file))?;
                if !expressions.is_empty() {
                    return Ok(expressions);
                }
            }
        }

        let vrm_dir = models_dir.join("vrm").join(model_id);
        let flat_vrm = models_dir.join("vrm").join(format!("{model_id}.vrm"));
        if (vrm_dir.exists() && find_vrm_file(&vrm_dir).is_some()) || flat_vrm.exists() {
            return Ok(VRM_EXPRESSIONS
                .iter()
                .map(|name| (*name).to_string())
                .collect());
        }
    }

    Ok(Vec::new())
}

fn parse_live2d_expressions(model_json_path: &Path) -> Result<Vec<String>> {
    let content = fs::read_to_string(model_json_path)?;
    let json: serde_json::Value = serde_json::from_str(&content)?;

    let mut expressions = Vec::new();
    if let Some(exprs) = json.pointer("/FileReferences/Expressions") {
        if let Some(arr) = exprs.as_array() {
            for expr in arr {
                if let Some(name) = expr.get("Name").and_then(|n| n.as_str()) {
                    if !name.is_empty() {
                        expressions.push(name.to_string());
                        continue;
                    }
                }
                if let Some(file) = expr.get("File").and_then(|f| f.as_str()) {
                    let name = file
                        .rsplit('/')
                        .next()
                        .unwrap_or(file)
                        .trim_end_matches(".exp3.json");
                    if !name.is_empty() {
                        expressions.push(name.to_string());
                    }
                }
            }
        }
    }

    Ok(expressions)
}

fn is_vrm_extension(ext: Option<&std::ffi::OsStr>) -> bool {
    ext.and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("vrm"))
}

fn find_vrm_file(dir: &Path) -> Option<String> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && is_vrm_extension(path.extension()) {
                return Some(path.file_name().unwrap().to_string_lossy().to_string());
            }
        }
    }
    None
}

fn find_model3_json(dir: &Path) -> Option<String> {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".model3.json") {
                return Some(name);
            }
        }
    }
    // Check one level of subdirs
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                if let Ok(sub_entries) = fs::read_dir(entry.path()) {
                    for sub in sub_entries.flatten() {
                        let name = sub.file_name().to_string_lossy().to_string();
                        if name.ends_with(".model3.json") {
                            return Some(name);
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_list_empty_characters() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());
        let list = loader.list_characters().unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn test_create_and_load_character() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());

        let id = loader
            .create_character(
                "Aria Nova",
                "A cheerful AI assistant.",
                "aria_live2d",
                "en-US-1",
                "friendly",
                "casual",
                "natural",
                "Alice",
                "Loves coding.",
            )
            .unwrap();

        assert_eq!(id, "aria_nova");

        // List should return the character
        let list = loader.list_characters().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Aria Nova");
        assert_eq!(list[0].live2d_model, "aria_live2d");

        // Load should return full character with prompt
        let character = loader.load_character("aria_nova").unwrap();
        assert_eq!(character.name, "Aria Nova");
        assert!(character.system_prompt.contains("Aria Nova"));
        assert!(character.system_prompt.contains("EXPRESSION RULES"));
        assert!(!character.prompt_sections.soul.is_empty());
    }

    #[test]
    fn test_load_from_markdown() {
        let tmp = TempDir::new().unwrap();
        let chars_dir = tmp.path().join("characters");
        fs::create_dir_all(&chars_dir).unwrap();

        let md_content = "---\nname: Luna\nlive2d_model: luna_model\nvoice: en-GB-1\ndefault_emotion: happy\n---\nYou are Luna, a mystical guide.\n";
        fs::write(chars_dir.join("luna.md"), md_content).unwrap();

        let loader = CharacterLoader::new(tmp.path());
        let list = loader.list_characters().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Luna");
        assert_eq!(list[0].default_emotion, "happy");

        let character = loader.load_character("luna").unwrap();
        assert_eq!(character.name, "Luna");
        assert!(character.prompt_sections.legacy.contains("mystical guide"));
        assert!(character.system_prompt.contains("mystical guide"));
    }

    #[test]
    fn test_build_system_prompt_with_expressions() {
        let character = Character {
            id: "test".to_string(),
            name: "TestBot".to_string(),
            live2d_model: String::new(),
            voice: String::new(),
            default_emotion: "neutral".to_string(),
            system_prompt: String::new(),
            prompt_sections: PromptSections {
                soul: "A friendly bot.".to_string(),
                ..Default::default()
            },
            source_type: SourceType::Directory,
        };

        let expressions = &["happy", "sad", "angry"];
        let prompt = build_system_prompt(&character, expressions);

        assert!(prompt.contains("TestBot"));
        assert!(prompt.contains("A friendly bot."));
        assert!(prompt.contains("EXPRESSION RULES"));
        assert!(prompt.contains("- happy"));
        assert!(prompt.contains("- sad"));
        assert!(prompt.contains("- angry"));
        assert!(prompt.contains("[expression:NAME]"));
    }

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("Aria Nova"), "aria_nova");
        assert_eq!(slugify("Hello World!"), "hello_world");
        assert_eq!(slugify("test123"), "test123");
        assert_eq!(slugify("My--Character"), "my__character");
    }

    #[test]
    fn test_parse_md_frontmatter() {
        let input = "---\nname: Luna\nvoice: en-GB\n---\nBody content here.\n";
        let (fm, body) = parse_md_frontmatter(input).unwrap();
        assert!(fm.contains("name: Luna"));
        assert!(fm.contains("voice: en-GB"));
        assert!(body.contains("Body content here."));
    }

    #[test]
    fn test_list_vrm_models_detects_various_layouts() {
        let tmp = TempDir::new().unwrap();
        let models_root = tmp.path().join("models").join("vrm");
        fs::create_dir_all(models_root.join("imported")).unwrap();
        fs::write(models_root.join("imported/model.vrm"), b"vrm").unwrap();

        fs::create_dir_all(models_root.join("custom_name")).unwrap();
        fs::write(models_root.join("custom_name/avatar.vrm"), b"vrm").unwrap();

        fs::write(models_root.join("flat_model.vrm"), b"vrm").unwrap();

        let models = list_models(tmp.path()).unwrap();
        let vrm_ids: Vec<&str> = models
            .iter()
            .filter(|model| model.model_type == "vrm")
            .map(|model| model.id.as_str())
            .collect();

        assert_eq!(vrm_ids, vec!["custom_name", "flat_model", "imported"]);
        assert_eq!(
            models
                .iter()
                .find(|model| model.id == "custom_name")
                .map(|model| model.model_file.as_str()),
            Some("avatar.vrm")
        );
    }

    #[test]
    fn test_list_vrm_animations_in_model_dir() {
        let tmp = TempDir::new().unwrap();
        let model_dir = tmp.path().join("models").join("vrm").join("utsuwa");
        fs::create_dir_all(model_dir.join("animations")).unwrap();
        fs::write(model_dir.join("utsuwa.vrm"), b"vrm").unwrap();
        fs::write(model_dir.join("animations/idle.vrma"), b"vrma").unwrap();
        fs::write(model_dir.join("animations/talking.vrma"), b"vrma").unwrap();

        let models = list_models(tmp.path()).unwrap();
        let utsuwa = models
            .iter()
            .find(|m| m.id == "utsuwa")
            .expect("utsuwa model");
        let animations = utsuwa.animations.as_ref().expect("animations");
        assert_eq!(animations.len(), 2);
        assert!(animations.iter().any(|a| a.name == "idle"));
        assert!(animations.iter().any(|a| a.name == "talking"));
    }

    #[test]
    fn test_get_model_expressions_uses_bundled_models_fallback() {
        if !PathBuf::from("models/live2d/haru").exists() {
            return;
        }
        let tmp = TempDir::new().unwrap();
        let expressions = get_model_expressions(tmp.path(), "haru").unwrap();
        assert!(expressions.contains(&"F01".to_string()));
        assert!(expressions.len() >= 8);
    }

    #[test]
    fn test_get_model_expressions_vrm_utsuwa() {
        if !PathBuf::from("models/vrm/utsuwa/utsuwa.vrm").exists() {
            return;
        }
        let tmp = TempDir::new().unwrap();
        let expressions = get_model_expressions(tmp.path(), "utsuwa").unwrap();
        assert!(expressions.contains(&"happy".to_string()));
        assert_eq!(expressions.len(), VRM_EXPRESSIONS.len());
    }

    #[test]
    fn test_list_vrm_ignores_empty_directories() {
        let tmp = TempDir::new().unwrap();
        let models_root = tmp.path().join("models").join("vrm");
        fs::create_dir_all(models_root.join("empty_folder")).unwrap();

        let models = list_models(tmp.path()).unwrap();
        assert!(models.iter().all(|model| model.model_type != "vrm"));
    }

    #[test]
    fn test_load_character_uses_vrm_model_field() {
        let tmp = TempDir::new().unwrap();
        let loader = CharacterLoader::new(tmp.path());
        let char_dir = tmp.path().join("characters").join("luna");
        fs::create_dir_all(&char_dir).unwrap();
        fs::write(
            char_dir.join("character.yaml"),
            "name: Luna\nvrm_model: my_avatar\nvoice: en-GB-1\ndefault_emotion: happy\n",
        )
        .unwrap();
        fs::write(char_dir.join("soul.md"), "Soul").unwrap();

        let character = loader.load_character("luna").unwrap();
        assert_eq!(character.live2d_model, "my_avatar");
    }
}
