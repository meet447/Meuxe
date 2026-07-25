use std::fs;
use std::path::Path;

use crate::Result;

/// Remove user-generated app data while keeping imported model assets.
pub fn reset_app_data(data_dir: &Path) -> Result<()> {
    remove_dir_if_exists(&data_dir.join("characters"))?;
    remove_dir_if_exists(&data_dir.join("data"))?;
    remove_dir_if_exists(&data_dir.join("models").join("expression_mappings"))?;
    Ok(())
}

fn remove_dir_if_exists(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn reset_removes_characters_and_data_but_not_models_root() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("characters/rika")).unwrap();
        fs::create_dir_all(root.join("data/users/u1/sessions")).unwrap();
        fs::create_dir_all(root.join("models/live2d/demo")).unwrap();
        fs::create_dir_all(root.join("models/expression_mappings")).unwrap();
        fs::write(root.join("models/live2d/demo/model.json"), "{}").unwrap();

        reset_app_data(root).unwrap();

        assert!(!root.join("characters").exists());
        assert!(!root.join("data").exists());
        assert!(!root.join("models/expression_mappings").exists());
        assert!(root.join("models/live2d/demo/model.json").exists());
    }
}
