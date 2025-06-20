use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use crate::server::HttpServer;
use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Terminal {
    pub id: String,
    pub name: String,
    pub pid: u32,
    pub rows: u16,
    pub cols: u16,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTerminalOptions {
    pub name: Option<String>,
    pub rows: Option<u16>,
    pub cols: Option<u16>,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub shell: Option<String>,
}

#[tauri::command]
pub async fn create_terminal(
    options: CreateTerminalOptions,
    state: State<'_, AppState>,
) -> Result<Terminal, String> {
    let terminal_manager = &state.terminal_manager;
    
    terminal_manager.create_session(
        options.name.unwrap_or_else(|| "Terminal".to_string()),
        options.rows.unwrap_or(24),
        options.cols.unwrap_or(80),
        options.cwd,
        options.env,
        options.shell,
    ).await
}

#[tauri::command]
pub async fn list_terminals(
    state: State<'_, AppState>,
) -> Result<Vec<Terminal>, String> {
    let terminal_manager = &state.terminal_manager;
    Ok(terminal_manager.list_sessions().await)
}

#[tauri::command]
pub async fn close_terminal(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = &state.terminal_manager;
    terminal_manager.close_session(&id).await
}

#[tauri::command]
pub async fn resize_terminal(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = &state.terminal_manager;
    terminal_manager.resize_session(&id, rows, cols).await
}

#[tauri::command]
pub async fn write_to_terminal(
    id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let terminal_manager = &state.terminal_manager;
    terminal_manager.write_to_session(&id, &data).await
}

#[tauri::command]
pub async fn read_from_terminal(
    id: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let terminal_manager = &state.terminal_manager;
    terminal_manager.read_from_session(&id).await
}

#[tauri::command]
pub async fn start_server(
    state: State<'_, AppState>,
) -> Result<ServerStatus, String> {
    let mut server = state.http_server.write().await;
    
    if server.is_some() {
        return Ok(ServerStatus {
            running: true,
            port: 3000, // TODO: Get actual port
            url: "http://localhost:3000".to_string(),
        });
    }
    
    // Load settings to check if password is enabled
    let settings = crate::settings::Settings::load().unwrap_or_default();
    
    // Start HTTP server with auth if configured
    let mut http_server = if settings.dashboard.enable_password && !settings.dashboard.password.is_empty() {
        let auth_config = crate::auth::AuthConfig::new(true, Some(settings.dashboard.password));
        HttpServer::with_auth(state.terminal_manager.clone(), auth_config)
    } else {
        HttpServer::new(state.terminal_manager.clone())
    };
    
    // Start server with appropriate access mode
    let port = match settings.dashboard.access_mode.as_str() {
        "network" => http_server.start_with_mode("network").await?,
        "ngrok" => {
            // For ngrok mode, start in localhost and let ngrok handle the tunneling
            let port = http_server.start_with_mode("localhost").await?;
            // Optionally start ngrok tunnel here if configured
            if let Some(auth_token) = settings.advanced.ngrok_auth_token {
                let _ = state.ngrok_manager.start_tunnel(port, Some(auth_token)).await;
            }
            port
        }
        _ => http_server.start_with_mode("localhost").await?,
    };
    
    *server = Some(http_server);
    
    Ok(ServerStatus {
        running: true,
        port,
        url: format!("http://localhost:{}", port),
    })
}

#[tauri::command]
pub async fn stop_server(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut server = state.http_server.write().await;
    
    if let Some(mut http_server) = server.take() {
        http_server.stop().await?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn get_server_status(
    state: State<'_, AppState>,
) -> Result<ServerStatus, String> {
    let server = state.http_server.read().await;
    
    if let Some(http_server) = server.as_ref() {
        let port = http_server.port();
        Ok(ServerStatus {
            running: true,
            port,
            url: format!("http://localhost:{}", port),
        })
    } else {
        Ok(ServerStatus {
            running: false,
            port: 0,
            url: String::new(),
        })
    }
}