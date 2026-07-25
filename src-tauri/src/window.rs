use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn create_mini_widget(
    app: &AppHandle,
    selected_character_id: Option<&str>,
) -> Result<(), String> {
    if app.get_webview_window("mini").is_some() {
        return Ok(());
    }
    let mut query = "index.html?mode=mini".to_string();
    if let Some(character_id) = selected_character_id.filter(|id| !id.is_empty()) {
        let encoded =
            percent_encoding::utf8_percent_encode(character_id, percent_encoding::NON_ALPHANUMERIC)
                .to_string();
        query.push_str("&character=");
        query.push_str(&encoded);
    }

    WebviewWindowBuilder::new(app, "mini", WebviewUrl::App(query.into()))
        .title("Meuxe")
        .inner_size(280.0, 420.0)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn close_mini_widget(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("mini") {
        let _ = window.close();
    }
}

#[derive(Clone, serde::Serialize)]
struct ModeChangedEvent {
    mode: String,
}

#[tauri::command]
pub fn window_toggle_mini(
    app: AppHandle,
    selected_character_id: Option<String>,
) -> Result<(), String> {
    if app.get_webview_window("mini").is_some() {
        close_mini_widget(&app);
        show_main_window(&app);
        let _ = app.emit(
            "app:mode-changed",
            ModeChangedEvent {
                mode: "full".to_string(),
            },
        );
    } else {
        hide_main_window(&app);
        create_mini_widget(&app, selected_character_id.as_deref())?;
    }
    Ok(())
}

#[tauri::command]
pub fn window_expand(app: AppHandle) -> Result<(), String> {
    close_mini_widget(&app);
    show_main_window(&app);
    let _ = app.emit(
        "app:mode-changed",
        ModeChangedEvent {
            mode: "full".to_string(),
        },
    );
    Ok(())
}

#[allow(dead_code)]
pub fn cycle_window_state(app: &AppHandle) {
    let main_visible = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false);
    let mini_exists = app.get_webview_window("mini").is_some();

    if main_visible {
        hide_main_window(app);
        let _ = create_mini_widget(app, None);
    } else if mini_exists {
        close_mini_widget(app);
    } else {
        show_main_window(app);
    }
}
