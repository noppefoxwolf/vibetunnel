use tauri::AppHandle;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, Menu};

pub struct TrayMenuManager;

impl TrayMenuManager {
    pub fn create_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
        // Server status
        let server_status = MenuItemBuilder::new("Server: Starting...")
            .id("server_status")
            .enabled(false)
            .build(app)?;
        
        // Dashboard access
        let dashboard = MenuItemBuilder::new("Open Dashboard")
            .id("dashboard")
            .accelerator("Cmd+D")
            .build(app)?;
        
        let copy_dashboard_url = MenuItemBuilder::new("Copy Dashboard URL")
            .id("copy_dashboard_url")
            .build(app)?;
        
        // Session info
        let sessions_info = MenuItemBuilder::new("Sessions: 0 active")
            .id("sessions_info")
            .enabled(false)
            .build(app)?;
        
        let new_session = MenuItemBuilder::new("New Terminal Session")
            .id("new_session")
            .accelerator("Cmd+T")
            .build(app)?;
        
        let kill_all_sessions = MenuItemBuilder::new("Kill All Sessions")
            .id("kill_all_sessions")
            .build(app)?;
        
        // Network access submenu
        let localhost_mode = MenuItemBuilder::new("✓ Localhost Only")
            .id("access_localhost")
            .build(app)?;
        
        let network_mode = MenuItemBuilder::new("  Network (LAN)")
            .id("access_network")
            .build(app)?;
        
        let ngrok_mode = MenuItemBuilder::new("  Ngrok (Internet)")
            .id("access_ngrok")
            .build(app)?;
        
        let network_menu = SubmenuBuilder::new(app, "Network Access")
            .item(&localhost_mode)
            .item(&network_mode)
            .item(&ngrok_mode)
            .separator()
            .item(&MenuItemBuilder::new("Configure Ngrok...").id("configure_ngrok").build(app)?)
            .build()?;
        
        // Tools submenu
        let install_cli = MenuItemBuilder::new("Install CLI Tool")
            .id("install_cli")
            .build(app)?;
        
        let open_logs = MenuItemBuilder::new("Open Logs")
            .id("open_logs")
            .build(app)?;
        
        let debug_console = MenuItemBuilder::new("Debug Console")
            .id("debug_console")
            .build(app)?;
        
        let tools_menu = SubmenuBuilder::new(app, "Tools")
            .item(&install_cli)
            .separator()
            .item(&open_logs)
            .item(&debug_console)
            .build()?;
        
        // Help submenu
        let show_tutorial = MenuItemBuilder::new("Show Tutorial")
            .id("show_tutorial")
            .build(app)?;
        
        let documentation = MenuItemBuilder::new("Documentation")
            .id("documentation")
            .build(app)?;
        
        let website = MenuItemBuilder::new("Website")
            .id("website")
            .build(app)?;
        
        let report_issue = MenuItemBuilder::new("Report Issue")
            .id("report_issue")
            .build(app)?;
        
        let check_updates = MenuItemBuilder::new("Check for Updates...")
            .id("check_updates")
            .build(app)?;
        
        let about = MenuItemBuilder::new("About VibeTunnel")
            .id("about")
            .build(app)?;
        
        let help_menu = SubmenuBuilder::new(app, "Help")
            .item(&show_tutorial)
            .item(&documentation)
            .separator()
            .item(&website)
            .item(&report_issue)
            .separator()
            .item(&check_updates)
            .separator()
            .item(&about)
            .build()?;
        
        // Settings
        let settings = MenuItemBuilder::new("Settings...")
            .id("settings")
            .accelerator("Cmd+,")
            .build(app)?;
        
        // Quit
        let quit = MenuItemBuilder::new("Quit VibeTunnel")
            .id("quit")
            .accelerator("Cmd+Q")
            .build(app)?;
        
        // Build the complete menu
        let menu = MenuBuilder::new(app)
            .item(&server_status)
            .separator()
            .item(&dashboard)
            .item(&copy_dashboard_url)
            .separator()
            .item(&sessions_info)
            .item(&new_session)
            .item(&kill_all_sessions)
            .separator()
            .item(&network_menu)
            .item(&tools_menu)
            .separator()
            .item(&help_menu)
            .item(&settings)
            .separator()
            .item(&quit)
            .build()?;
        
        Ok(menu)
    }
    
    pub async fn update_server_status(app: &AppHandle, port: u16, running: bool) {
        if let Some(_tray) = app.tray_by_id("main") {
            let status_text = if running {
                format!("Server: Running on port {}", port)
            } else {
                "Server: Stopped".to_string()
            };
            
            // Note: In Tauri v2, dynamic menu updates require rebuilding the menu
            // For now, we'll just log the status
            tracing::debug!("Server status: {}", status_text);
            
            // TODO: Implement menu rebuilding for dynamic updates
            // This would involve recreating the entire menu with updated text
        }
    }
    
    pub async fn update_session_count(app: &AppHandle, count: usize) {
        if let Some(_tray) = app.tray_by_id("main") {
            let text = if count == 0 {
                "Sessions: No active sessions".to_string()
            } else if count == 1 {
                "Sessions: 1 active session".to_string()
            } else {
                format!("Sessions: {} active sessions", count)
            };
            
            tracing::debug!("Session count: {}", text);
            
            // TODO: Implement menu rebuilding for dynamic updates
        }
    }
    
    pub async fn update_access_mode(_app: &AppHandle, mode: &str) {
        // Update checkmarks in access mode menu
        let _modes = vec![
            ("access_localhost", mode == "localhost"),
            ("access_network", mode == "network"),
            ("access_ngrok", mode == "ngrok"),
        ];
        
        // Note: In Tauri v2, we need to rebuild the menu to update checkmarks
        tracing::debug!("Access mode updated to: {}", mode);
        
        // TODO: Implement menu rebuilding for dynamic updates
    }
}