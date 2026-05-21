pub mod catalog;
pub mod client;
pub mod tools;

pub use catalog::{
    build_catalog, execute_catalog_entry, format_composio_result, llm_name_from_slug,
    permission_for_slug, ComposioCatalogEntry,
};
pub use client::{
    connection_status_from_value, extract_github_readme_markdown, extract_proxy_text,
    gmail_message_to_markdown, gmail_messages_to_markdown, gmail_threads_to_markdown,
    is_composio_connected, status_display_label, tool_payload, ComposioClient, GITHUB_README_TOOL,
    GMAIL_FETCH_TOOL,
};
pub use tools::{
    composio_tool_available, refresh_catalog_for, ComposioToolState, ComposioToolStateHandle,
};
