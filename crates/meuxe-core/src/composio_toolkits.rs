//! Curated Composio toolkit slugs exposed in settings and onboarding.

pub struct ComposioToolkitMeta {
    pub slug: &'static str,
    pub name: &'static str,
}

pub const SUPPORTED_TOOLKITS: &[ComposioToolkitMeta] = &[
    ComposioToolkitMeta {
        slug: "github",
        name: "GitHub",
    },
    ComposioToolkitMeta {
        slug: "gmail",
        name: "Gmail",
    },
    ComposioToolkitMeta {
        slug: "slack",
        name: "Slack",
    },
    ComposioToolkitMeta {
        slug: "notion",
        name: "Notion",
    },
    ComposioToolkitMeta {
        slug: "googlecalendar",
        name: "Google Calendar",
    },
    ComposioToolkitMeta {
        slug: "googledrive",
        name: "Google Drive",
    },
    ComposioToolkitMeta {
        slug: "linear",
        name: "Linear",
    },
    ComposioToolkitMeta {
        slug: "jira",
        name: "Jira",
    },
    ComposioToolkitMeta {
        slug: "discord",
        name: "Discord",
    },
    ComposioToolkitMeta {
        slug: "trello",
        name: "Trello",
    },
    ComposioToolkitMeta {
        slug: "asana",
        name: "Asana",
    },
    ComposioToolkitMeta {
        slug: "dropbox",
        name: "Dropbox",
    },
];

pub fn default_enabled_toolkits() -> Vec<String> {
    vec!["github".to_string(), "gmail".to_string()]
}

pub fn toolkit_display_name(slug: &str) -> String {
    SUPPORTED_TOOLKITS
        .iter()
        .find(|toolkit| toolkit.slug == slug)
        .map(|toolkit| toolkit.name.to_string())
        .unwrap_or_else(|| {
            slug.split('_')
                .map(|part| {
                    let mut chars = part.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        })
}
