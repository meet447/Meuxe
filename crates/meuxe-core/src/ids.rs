use crate::{MeuxeError, Result};

/// Reject ids that are unsafe for filesystem path segments.
pub fn validate_id(id: &str) -> Result<&str> {
    if id.is_empty() {
        return Err(MeuxeError::InvalidId("id must not be empty".into()));
    }
    if id == "." || id == ".." {
        return Err(MeuxeError::InvalidId(format!("invalid id: {id}")));
    }
    if id.contains('/') || id.contains('\\') || id.contains('\0') {
        return Err(MeuxeError::InvalidId(format!("invalid id: {id}")));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    {
        return Err(MeuxeError::InvalidId(format!("invalid id: {id}")));
    }
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_empty() {
        for bad in ["", "../x", "a/b", ".", "..", "a\\b", "has space"] {
            assert!(validate_id(bad).is_err(), "expected Err for {bad:?}");
        }
    }

    #[test]
    fn accepts_known_ids() {
        for good in ["rika", "default-user", "Hiyori_v2", "aria_nova", "haru"] {
            assert!(validate_id(good).is_ok(), "expected Ok for {good:?}");
        }
    }
}
