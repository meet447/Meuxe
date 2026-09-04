use crate::window;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), String> {
    let open =
        MenuItem::with_id(app, "open", "Open", true, None::<&str>).map_err(|e| e.to_string())?;
    let toggle_mini = MenuItem::with_id(app, "toggle_mini", "Toggle Mini Mode", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit =
        MenuItem::with_id(app, "quit", "Quit", true, None::<&str>).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(app, &[&open, &toggle_mini, &quit]).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let builder = TrayIconBuilder::new()
        .icon(tauri::include_image!("./icons/tray/trayTemplate@2x.png"))
        .icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = TrayIconBuilder::new().icon(tauri::include_image!("./icons/tray/tray@2x.png"));

    builder
        .menu(&menu)
        .tooltip("Meuxe")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => window::show_main_window(app),
            "toggle_mini" => {
                let _ = window::window_toggle_mini(app.clone(), None);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::show_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}
