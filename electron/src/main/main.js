"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
// Import our typed modules
const store_1 = __importDefault(require("./store"));
const serverManager_1 = require("./serverManager");
const windows_1 = require("./windows");
const terminalDetector_1 = require("./terminalDetector");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Development mode flag
const isDev = process.argv.includes('--dev');
// Global references
let tray = null;
let serverManager = null;
let menuUpdateTimer = null;
// Platform detection
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';
// Default settings
const DEFAULT_SETTINGS = {
    serverPort: 4020,
    launchAtLogin: false,
    showDockIcon: false,
    serverMode: 'rust',
    accessMode: 'localhost',
    dashboardPassword: '',
    autoCleanupOnQuit: true,
    debugMode: false,
    updateChannel: 'stable',
    firstRun: true
};
// Initialize settings
function initializeSettings() {
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
        if (!store_1.default.has(key)) {
            store_1.default.set(key, value);
        }
    });
    // Ensure serverPort is always set
    if (!store_1.default.get('serverPort')) {
        store_1.default.set('serverPort', 4020);
    }
}
// Create system tray
function createTray() {
    let iconPath;
    if (isMac) {
        // Use template image for macOS to support dark/light mode
        iconPath = path.join(__dirname, '../../assets', 'tray-iconTemplate.png');
    }
    else {
        iconPath = path.join(__dirname, '../../assets', 'tray-icon.png');
    }
    // Create tray with native image
    const icon = electron_1.nativeImage.createFromPath(iconPath);
    if (isMac) {
        // Resize icon to 16x16 for macOS menu bar
        const resizedIcon = icon.resize({ width: 16, height: 16 });
        resizedIcon.setTemplateImage(true);
        tray = new electron_1.Tray(resizedIcon);
    }
    else {
        tray = new electron_1.Tray(icon);
    }
    // Set tooltip
    tray.setToolTip('VibeTunnel');
    updateTrayMenu();
    tray.on('click', () => {
        if (isWin) {
            // Windows: left click shows menu
            tray?.popUpContextMenu();
        }
        else if (isMac) {
            // macOS: left click shows/hides settings window
            const windows = (0, windows_1.getWindows)();
            if (windows.settingsWindow) {
                if (windows.settingsWindow.isVisible()) {
                    windows.settingsWindow.hide();
                }
                else {
                    windows.settingsWindow.show();
                }
            }
            else {
                (0, windows_1.createSettingsWindow)();
            }
        }
    });
}
// Update tray menu
function updateTrayMenu() {
    if (!tray)
        return;
    const serverRunning = serverManager?.getStatus().running || false;
    const serverPort = store_1.default.get('serverPort') || 4020;
    const sessions = serverManager?.getSessions() || [];
    const sessionCount = sessions.length;
    const menuItems = [
        // Server status
        {
            label: serverRunning
                ? `• Server running on port ${serverPort}`
                : '○ Server stopped',
            enabled: false
        },
        // Session count
        {
            label: sessionCount === 1
                ? '1 active session'
                : `${sessionCount} active sessions`,
            enabled: false
        },
        { type: 'separator' },
        // Start/Stop Server
        {
            label: serverRunning ? 'Stop Server' : 'Start Server',
            click: async () => {
                try {
                    console.log('Menu click - server running:', serverRunning);
                    if (serverRunning) {
                        console.log('Stopping server from menu...');
                        await stopServer();
                    }
                    else {
                        console.log('Starting server from menu...');
                        await startServer();
                    }
                    // Force menu update after server state change
                    setTimeout(() => {
                        updateTrayMenu();
                    }, 500);
                }
                catch (error) {
                    console.error('Menu click error:', error);
                    electron_1.dialog.showErrorBox('Server Error', `Failed to ${serverRunning ? 'stop' : 'start'} server: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        },
        // Open Dashboard
        {
            label: 'Open Dashboard',
            enabled: serverRunning,
            click: () => {
                electron_1.shell.openExternal(`http://localhost:${serverPort}`);
            }
        },
        { type: 'separator' },
        // Help submenu
        {
            label: 'Help',
            submenu: [
                {
                    label: 'Show Tutorial',
                    click: () => (0, windows_1.createWelcomeWindow)()
                },
                {
                    label: 'Website',
                    click: () => electron_1.shell.openExternal('https://vibetunnel.com')
                },
                {
                    label: 'Report Issue',
                    click: () => electron_1.shell.openExternal('https://github.com/vibetunnel/vibetunnel/issues')
                },
                { type: 'separator' },
                {
                    label: 'Check for Updates',
                    click: () => {
                        if (!isDev) {
                            electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
                        }
                        else {
                            electron_1.dialog.showMessageBox({
                                type: 'info',
                                title: 'Check for Updates',
                                message: 'You have the latest version of VibeTunnel.',
                                buttons: ['OK']
                            });
                        }
                    }
                },
                { type: 'separator' },
                {
                    label: `Version ${electron_1.app.getVersion()}`,
                    enabled: false
                },
                {
                    label: 'About VibeTunnel',
                    click: () => {
                        (0, windows_1.createSettingsWindow)('about');
                    }
                }
            ]
        },
        { type: 'separator' },
        // Settings
        {
            label: 'Settings',
            accelerator: 'CmdOrCtrl+,',
            click: () => (0, windows_1.createSettingsWindow)()
        },
        { type: 'separator' },
        // Quit
        {
            label: 'Quit',
            accelerator: 'CmdOrCtrl+Q',
            click: () => electron_1.app.quit()
        }
    ];
    const contextMenu = electron_1.Menu.buildFromTemplate(menuItems);
    tray.setContextMenu(contextMenu);
    tray.setToolTip(`VibeTunnel - ${serverRunning ? 'Running' : 'Stopped'}`);
}
// Start periodic menu updates
function startMenuUpdateTimer() {
    // Stop any existing timer
    stopMenuUpdateTimer();
    // Update menu every 2 seconds to reflect session count changes
    menuUpdateTimer = setInterval(() => {
        updateTrayMenu();
    }, 2000);
}
// Stop periodic menu updates
function stopMenuUpdateTimer() {
    if (menuUpdateTimer) {
        clearInterval(menuUpdateTimer);
        menuUpdateTimer = null;
    }
}
// Handle auto-launch
function setupAutoLaunch() {
    const launchAtLogin = store_1.default.get('launchAtLogin') || false;
    console.log('[setupAutoLaunch] Called with launchAtLogin:', launchAtLogin);
    console.log('[setupAutoLaunch] Platform:', process.platform);
    console.log('[setupAutoLaunch] Is packaged:', electron_1.app.isPackaged);
    if (isMac || isWin) {
        const exePath = electron_1.app.getPath('exe');
        console.log('[setupAutoLaunch] Exe path:', exePath);
        const settings = {
            openAtLogin: launchAtLogin,
            openAsHidden: true
        };
        // On macOS, we need to use the correct API
        if (isMac && electron_1.app.isPackaged) {
            // macOS uses different settings structure
            const macPath = exePath.replace(/\.app\/.*/, '.app');
            console.log('[setupAutoLaunch] macOS packaged path:', macPath);
        }
        console.log('[setupAutoLaunch] Setting login item settings:', settings);
        electron_1.app.setLoginItemSettings(settings);
        // Verify the setting was applied
        const currentSettings = electron_1.app.getLoginItemSettings();
        console.log('[setupAutoLaunch] Current login item settings after set:', currentSettings);
        const success = currentSettings.openAtLogin === launchAtLogin;
        console.log('[setupAutoLaunch] Success:', success);
        return success;
    }
    else if (isLinux) {
        // Linux: Create/remove desktop entry
        const desktopEntry = `[Desktop Entry]
Type=Application
Name=VibeTunnel
Exec=${process.execPath}
Icon=${path.join(__dirname, '../../assets/icon.png')}
Terminal=false
StartupNotify=true
X-GNOME-Autostart-enabled=true`;
        const autostartDir = path.join(os.homedir(), '.config', 'autostart');
        const desktopFile = path.join(autostartDir, 'vibetunnel.desktop');
        try {
            if (launchAtLogin) {
                fs.mkdirSync(autostartDir, { recursive: true });
                fs.writeFileSync(desktopFile, desktopEntry);
                return true;
            }
            else {
                if (fs.existsSync(desktopFile)) {
                    fs.unlinkSync(desktopFile);
                }
                return true;
            }
        }
        catch (err) {
            console.error('Failed to setup auto launch:', err);
            return false;
        }
    }
    return false;
}
// Handle dock icon visibility (macOS)
function updateDockVisibility() {
    if (isMac && electron_1.app.dock) {
        const showDockIcon = store_1.default.get('showDockIcon') || false;
        if (showDockIcon) {
            electron_1.app.dock.show();
        }
        else {
            electron_1.app.dock.hide();
        }
    }
}
// Start server
async function startServer() {
    console.log('startServer called');
    if (!serverManager) {
        const port = store_1.default.get('serverPort') || 4020;
        const mode = store_1.default.get('serverMode') || 'rust';
        serverManager = new serverManager_1.VibeTunnelServerManager(port, mode);
        // Listen to server events
        serverManager.on('status-changed', (status) => {
            updateTrayMenu();
            // Notify all windows
            const windows = (0, windows_1.getWindows)();
            Object.values(windows).forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('server-status-changed', status);
                }
            });
        });
        serverManager.on('sessions-changed', (sessions) => {
            // Notify all windows
            const windows = (0, windows_1.getWindows)();
            Object.values(windows).forEach(window => {
                if (window && !window.isDestroyed()) {
                    window.webContents.send('sessions-changed', sessions);
                }
            });
        });
        console.log('ServerManager created');
    }
    try {
        console.log('Starting server...');
        await serverManager.start();
        console.log('Server started successfully');
        // Update tray menu immediately
        updateTrayMenu();
        // Start periodic updates of tray menu for session count
        startMenuUpdateTimer();
    }
    catch (error) {
        console.error('Failed to start server:', error);
        if (error instanceof Error) {
            console.error('Error stack:', error.stack);
            electron_1.dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}\n\nPlease check the console for more details.`);
        }
        updateTrayMenu();
    }
}
// Stop server
async function stopServer() {
    if (!serverManager)
        return;
    try {
        console.log('Stopping server...');
        await serverManager.stop();
        console.log('Server stopped');
        // Stop periodic menu updates
        stopMenuUpdateTimer();
        // Update tray menu
        updateTrayMenu();
    }
    catch (error) {
        console.error('Failed to stop server:', error);
        if (error instanceof Error) {
            electron_1.dialog.showErrorBox('Server Error', `Failed to stop server: ${error.message}`);
        }
        updateTrayMenu();
    }
}
// Setup IPC handlers
function setupIPCHandlers() {
    // Settings
    electron_1.ipcMain.handle('get-settings', () => {
        return store_1.default.store;
    });
    electron_1.ipcMain.handle('set-setting', (_event, key, value) => {
        console.log(`Setting ${key} to ${value}`);
        store_1.default.set(key, value);
        let success = true;
        // Apply changes immediately
        switch (key) {
            case 'launchAtLogin':
                console.log('[IPC] Setting launch at login to:', value);
                success = setupAutoLaunch();
                console.log('[IPC] setupAutoLaunch returned:', success);
                if (!success) {
                    // Revert the setting if it failed
                    store_1.default.set(key, !value);
                    // Provide more detailed error message
                    const currentSettings = electron_1.app.getLoginItemSettings();
                    const errorDetails = `Failed to update launch at login. Current state: ${JSON.stringify(currentSettings)}`;
                    console.error('[IPC]', errorDetails);
                    throw new Error(errorDetails);
                }
                break;
            case 'showDockIcon':
                updateDockVisibility();
                console.log('Updated dock visibility');
                break;
            case 'serverPort':
                // If server is running, it needs to be restarted with new port
                if (serverManager?.getStatus().running) {
                    electron_1.dialog.showMessageBox({
                        type: 'info',
                        title: 'Restart Required',
                        message: 'Please restart the server for the port change to take effect.',
                        buttons: ['OK']
                    });
                }
                break;
        }
        return success;
    });
    // Server control
    electron_1.ipcMain.handle('start-server', async () => {
        await startServer();
    });
    electron_1.ipcMain.handle('stop-server', async () => {
        await stopServer();
    });
    electron_1.ipcMain.handle('get-server-status', () => {
        return {
            ...serverManager?.getStatus(),
            mode: store_1.default.get('serverMode') || 'rust',
            accessMode: store_1.default.get('accessMode') || 'localhost'
        };
    });
    // Session management
    electron_1.ipcMain.handle('get-sessions', () => {
        return serverManager?.getSessions() || [];
    });
    // System info
    electron_1.ipcMain.handle('get-system-info', () => {
        return {
            platform: process.platform,
            arch: process.arch,
            version: electron_1.app.getVersion(),
            electron: process.versions.electron,
            node: process.versions.node,
            appPath: electron_1.app.getPath('exe'),
            userDataPath: electron_1.app.getPath('userData'),
            tempPath: electron_1.app.getPath('temp')
        };
    });
    // Terminal detection
    electron_1.ipcMain.handle('get-available-terminals', () => {
        return (0, terminalDetector_1.getAvailableTerminals)();
    });
    // Additional handlers
    electron_1.ipcMain.handle('create-session', async (_event, options) => {
        if (!serverManager) {
            throw new Error('Server not running');
        }
        return await serverManager.createSession(options);
    });
    electron_1.ipcMain.handle('terminate-session', async (_event, sessionId) => {
        if (!serverManager) {
            throw new Error('Server not running');
        }
        return await serverManager.terminateSession(sessionId);
    });
    electron_1.ipcMain.handle('check-for-updates', () => {
        console.log('[IPC] check-for-updates called');
        if (!isDev) {
            electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
        }
        return { status: 'checking' };
    });
    electron_1.ipcMain.handle('open-log-file', () => {
        console.log('[IPC] open-log-file called');
        const logPath = path.join(electron_1.app.getPath('userData'), 'server.log');
        console.log('[IPC] Opening log file at:', logPath);
        electron_1.shell.openPath(logPath);
        return { opened: true, path: logPath };
    });
    electron_1.ipcMain.handle('open-recordings-folder', () => {
        console.log('[IPC] open-recordings-folder called');
        const recordingsPath = path.join(electron_1.app.getPath('userData'), 'recordings');
        fs.mkdirSync(recordingsPath, { recursive: true });
        console.log('[IPC] Opening recordings folder at:', recordingsPath);
        electron_1.shell.openPath(recordingsPath);
        return { opened: true, path: recordingsPath };
    });
    electron_1.ipcMain.handle('open-external', (_event, url) => {
        console.log('[IPC] open-external called with URL:', url);
        electron_1.shell.openExternal(url);
        return { opened: true, url };
    });
    electron_1.ipcMain.handle('open-terminal', (_event, terminalCommand, options) => {
        console.log('[IPC] open-terminal called with command:', terminalCommand);
        console.log('[IPC] Terminal options:', options);
        return (0, terminalDetector_1.openTerminal)(terminalCommand, options);
    });
    // Window control handlers
    electron_1.ipcMain.on('close-window', (event) => {
        const window = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (window)
            window.close();
    });
    electron_1.ipcMain.on('minimize-window', (event) => {
        const window = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (window)
            window.minimize();
    });
    // Network info
    electron_1.ipcMain.handle('get-local-ip', () => {
        const networkInterfaces = os.networkInterfaces();
        const addresses = [];
        for (const iface of Object.values(networkInterfaces)) {
            if (!iface)
                continue;
            for (const config of iface) {
                if (config.family === 'IPv4' && !config.internal) {
                    addresses.push(config.address);
                }
            }
        }
        return addresses.length > 0 ? addresses[0] : null;
    });
    // CLI installation
    electron_1.ipcMain.handle('install-cli', async () => {
        console.log('[IPC] install-cli called');
        const cliPath = '/usr/local/bin/vt';
        const serverPort = store_1.default.get('serverPort') || 4020;
        const scriptContent = `#!/bin/bash
# VibeTunnel CLI
# This script launches VibeTunnel terminal sessions

if [ -z "$1" ]; then
    echo "Usage: vt <session-name>"
    echo "       vt --help"
    exit 1
fi

if [ "$1" = "--help" ]; then
    echo "VibeTunnel CLI"
    echo ""
    echo "Usage:"
    echo "  vt <session-name>    Start a new VibeTunnel session"
    echo "  vt --list           List active sessions"
    echo "  vt --help           Show this help message"
    exit 0
fi

if [ "$1" = "--list" ]; then
    curl -s http://localhost:${serverPort}/api/sessions | jq -r '.sessions[] | "\\(.id)\\t\\(.name)"'
    exit 0
fi

# Start new session
SESSION_NAME="$1"
open "vibetunnel://session/$SESSION_NAME"
`;
        try {
            // Write the CLI script
            fs.writeFileSync('/tmp/vt', scriptContent, { mode: 0o755 });
            // Install it to /usr/local/bin (requires sudo on macOS/Linux)
            if (isMac) {
                await execAsync(`osascript -e 'do shell script "cp /tmp/vt ${cliPath} && chmod +x ${cliPath}" with administrator privileges'`);
            }
            else if (isLinux) {
                // On Linux, we can't use osascript, need to use sudo
                try {
                    // Try to use pkexec or gksudo for GUI sudo
                    await execAsync(`pkexec cp /tmp/vt ${cliPath} && pkexec chmod +x ${cliPath}`);
                }
                catch (error) {
                    // Fallback message
                    throw new Error('Please run: sudo cp /tmp/vt /usr/local/bin/vt && sudo chmod +x /usr/local/bin/vt');
                }
            }
            else {
                // Windows: Add to PATH or use a different approach
                throw new Error('CLI installation not yet implemented for Windows');
            }
            return { success: true };
        }
        catch (error) {
            console.error('Failed to install CLI:', error);
            throw error;
        }
    });
    // Ngrok handlers
    electron_1.ipcMain.handle('start-ngrok-tunnel', async () => {
        // TODO: Implement ngrok functionality
        throw new Error('Ngrok functionality not yet implemented');
    });
    electron_1.ipcMain.handle('stop-ngrok-tunnel', async () => {
        // TODO: Implement ngrok functionality
        return { status: 'disconnected' };
    });
    electron_1.ipcMain.handle('get-ngrok-status', () => {
        // TODO: Implement ngrok functionality
        return { status: 'disconnected', url: null };
    });
    // Debug handlers
    electron_1.ipcMain.handle('open-console-window', () => {
        (0, windows_1.createConsoleWindow)();
    });
    electron_1.ipcMain.handle('open-dev-tools', (event) => {
        const window = electron_1.BrowserWindow.fromWebContents(event.sender);
        if (window) {
            window.webContents.openDevTools();
        }
    });
    electron_1.ipcMain.handle('open-user-data-folder', () => {
        electron_1.shell.openPath(electron_1.app.getPath('userData'));
    });
    electron_1.ipcMain.handle('open-welcome-window', () => {
        (0, windows_1.createWelcomeWindow)();
    });
    electron_1.ipcMain.handle('reset-all-settings', () => {
        store_1.default.clear();
        electron_1.app.relaunch();
        electron_1.app.quit();
    });
}
// Setup auto-updater
function setupAutoUpdater() {
    const updateChannel = store_1.default.get('updateChannel') || 'stable';
    electron_updater_1.autoUpdater.channel = updateChannel;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('update-available', () => {
        electron_1.dialog.showMessageBox({
            type: 'info',
            title: 'Update Available',
            message: 'A new version of VibeTunnel is available and will be downloaded in the background.',
            buttons: ['OK']
        });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', () => {
        electron_1.dialog.showMessageBox({
            type: 'info',
            title: 'Update Ready',
            message: 'A new version has been downloaded. Restart the app to apply the update.',
            buttons: ['Restart', 'Later']
        }).then((result) => {
            if (result.response === 0) {
                electron_updater_1.autoUpdater.quitAndInstall();
            }
        });
    });
    // Check for updates
    if (!isDev) {
        electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
    }
}
// App event handlers
electron_1.app.whenReady().then(() => {
    // Initialize settings
    initializeSettings();
    // Create tray icon
    createTray();
    // Setup IPC handlers
    setupIPCHandlers();
    // Setup auto-launch
    setupAutoLaunch();
    // Update dock visibility
    updateDockVisibility();
    // Show welcome window on first run
    if (store_1.default.get('firstRun')) {
        (0, windows_1.createWelcomeWindow)();
    }
    else {
        // Auto-start server
        startServer();
    }
    // DEBUG CONVENIENCE: Auto-open settings window on startup
    // TODO: Remove this before production release!
    console.log('=== DEBUG MODE: Auto-opening settings window ===');
    setTimeout(() => {
        (0, windows_1.createSettingsWindow)();
    }, 1000); // Small delay to ensure everything is initialized
    // Setup auto-updater
    setupAutoUpdater();
});
electron_1.app.on('window-all-closed', () => {
    // Don't quit when all windows are closed (tray app)
    if (!isMac) {
        // On Windows/Linux, we keep running in the tray
    }
});
electron_1.app.on('before-quit', async () => {
    // Cleanup on quit
    if (store_1.default.get('autoCleanupOnQuit')) {
        if (serverManager) {
            await serverManager.cleanup();
        }
    }
});
// Prevent multiple instances
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        // Someone tried to run a second instance, focus our window instead
        const windows = (0, windows_1.getWindows)();
        if (windows.settingsWindow) {
            if (windows.settingsWindow.isMinimized())
                windows.settingsWindow.restore();
            windows.settingsWindow.focus();
        }
        else {
            (0, windows_1.createSettingsWindow)();
        }
    });
}
//# sourceMappingURL=main.js.map