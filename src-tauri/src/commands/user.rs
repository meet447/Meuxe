use meuxe_core::config::types::AppConfig;

/// Derive the stable user id from app config (trimmed id, else slugified name, else default).
pub(crate) fn derive_user_id(config: &AppConfig) -> String {
    if !config.user.id.trim().is_empty() {
        return config.user.id.trim().to_string();
    }
    if !config.user.name.trim().is_empty() {
        return meuxe_core::character::slugify(config.user.name.trim());
    }
    "default-user".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use meuxe_core::config::types::{AppConfig, UserConfig};

    #[test]
    fn prefers_trimmed_id() {
        let config = AppConfig {
            user: UserConfig {
                id: "  user-1  ".into(),
                name: "Alice".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        assert_eq!(derive_user_id(&config), "user-1");
    }

    #[test]
    fn slugifies_trimmed_name_when_id_empty() {
        let config = AppConfig {
            user: UserConfig {
                id: "".into(),
                name: "  Alice  ".into(),
                ..Default::default()
            },
            ..Default::default()
        };
        assert_eq!(derive_user_id(&config), "alice");
    }
}
