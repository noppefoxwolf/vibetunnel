#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{AppHandle, Manager, WindowEvent};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

mod commands;
mod terminal;
mod server;

use commands::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = show_main_window(app.app_handle().clone());
        }))
        .invoke_handler(tauri::generate_handler![
            create_terminal,
            list_terminals,
            close_terminal,
            resize_terminal,
            write_to_terminal,
            read_from_terminal,
            start_server,
            stop_server,
            get_server_status,
            show_main_window,
            quit_app,
        ])
        .setup(|app| {
            // Create system tray menu
            let dashboard = MenuItemBuilder::new("Open Dashboard")
                .id("dashboard")
                .build(app)?;
            let settings = MenuItemBuilder::new("Settings...")
                .id("settings")
                .build(app)?;
            let quit = MenuItemBuilder::new("Quit")
                .id("quit")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&dashboard)
                .separator()
                .item(&settings)
                .separator()
                .item(&quit)
                .build()?;

            // Initialize the system tray
            let _tray = TrayIconBuilder::new()
                .tooltip("VibeTunnel")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "dashboard" => {
                        let _ = show_main_window(app.clone());
                    }
                    "settings" => {
                        // TODO: Open settings window
                        let _ = show_main_window(app.clone());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let _ = show_main_window(app.clone());
                    }
                })
                .build(app)?;

            // Start with window hidden (menu bar only mode)
            let window = app.get_webview_window("main").unwrap();
            window.hide()?;

            // Handle window close event to hide instead of quit
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });

            // Auto-start server
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Start the server automatically
                let _ = server::start_server(app_handle).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}