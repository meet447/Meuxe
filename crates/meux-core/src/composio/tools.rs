use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::composio_toolkits::default_enabled_toolkits;
use crate::error::{MeuxError, Result};

use super::catalog::{build_catalog, ComposioCatalogEntry};
use super::client::{is_composio_connected, ComposioClient};
use crate::config::types::ComposioConnectionConfig;

#[derive(Clone, Default)]
pub struct ComposioToolState {
    pub api_key: Option<String>,
    pub user_id: String,
    pub connections: HashMap<String, ComposioConnectionConfig>,
    pub enabled_toolkits: Vec<String>,
    pub catalog: HashMap<String, ComposioCatalogEntry>,
}

pub type ComposioToolStateHandle = Arc<RwLock<ComposioToolState>>;

impl ComposioToolState {
    pub fn toolkit_connected(&self, toolkit: &str) -> bool {
        self.connections
            .get(toolkit)
            .map(|connection| is_composio_connected(&connection.status))
            .unwrap_or(false)
    }

    pub fn client(&self) -> Result<ComposioClient> {
        let api_key = self
            .api_key
            .as_ref()
            .filter(|key| !key.trim().is_empty())
            .ok_or_else(|| {
                MeuxError::Tool(
                    "Composio API key is not configured. Add it in Settings → Integrations."
                        .to_string(),
                )
            })?;
        Ok(ComposioClient::new(api_key.clone()))
    }

    pub fn resolved_enabled_toolkits(&self) -> Vec<String> {
        if self.enabled_toolkits.is_empty() {
            default_enabled_toolkits()
        } else {
            self.enabled_toolkits.clone()
        }
    }
}

pub async fn refresh_catalog_for(
    state: &ComposioToolState,
) -> Result<HashMap<String, ComposioCatalogEntry>> {
    if state
        .api_key
        .as_ref()
        .is_none_or(|key| key.trim().is_empty())
    {
        return Ok(HashMap::new());
    }
    let mut fetch_state = state.clone();
    fetch_state.enabled_toolkits = state.resolved_enabled_toolkits();
    fetch_state.catalog.clear();
    build_catalog(&fetch_state).await
}

pub fn composio_tool_available(name: &str, state: &ComposioToolState) -> bool {
    if state
        .api_key
        .as_ref()
        .is_none_or(|key| key.trim().is_empty())
    {
        return false;
    }
    state.catalog.contains_key(name)
}
