import { app, BrowserWindow, Menu, Tray, dialog, shell, ipcMain, nativeImage, IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

// Import our typed modules
import store from './store';
import { VibeTunnelServerManager } from './serverManager';
import { createSettingsWindow, createWelcomeWindow, createConsoleWindow, getWindows } from './windows';
import { getAvailableTerminals, openTerminal } from './terminalDetector';
import { StoreSchema } from '../types/store';

const execAsync = promisify(exec);

// Development mode flag
const isDev = process.argv.includes('--dev');

// Global references
let tray: Tray | null = null;
let serverManager: VibeTunnelServerManager | null = null;
let menuUpdateTimer: NodeJS.Timeout | null = null;

// Platform detection
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

// Default settings
const DEFAULT_SETTINGS: Partial<StoreSchema> = {
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
function initializeSettings(): void {
  Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
    if (!store.has(key as keyof StoreSchema)) {
      store.set(key as keyof StoreSchema, value as any);
    }
  });
  
  // Ensure serverPort is always set
  if (!store.get('serverPort')) {
    store.set('serverPort', 4020);
  }
}

// Create system tray
function createTray(): void {
  let iconPath: string;
  
  if (isMac) {
    // Use template image for macOS to support dark/light mode
    iconPath = path.join(__dirname, '../../assets', 'tray-iconTemplate.png');
  } else {
    iconPath = path.join(__dirname, '../../assets', 'tray-icon.png');
  }
  
  // Create tray with native image
  const icon = nativeImage.createFromPath(iconPath);
  
  if (isMac) {
    // Resize icon to 16x16 for macOS menu bar
    const resizedIcon = icon.resize({ width: 16, height: 16 });
    resizedIcon.setTemplateImage(true);
    tray = new Tray(resizedIcon);
  } else {
    tray = new Tray(icon);
  }
  
  // Set tooltip
  tray.setToolTip('VibeTunnel');
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (isWin) {
      // Windows: left click shows menu
      tray?.popUpContextMenu();
    } else if (isMac) {
      // macOS: left click shows/hides settings window
      const windows = getWindows();
      if (windows.settingsWindow) {
        if (windows.settingsWindow.isVisible()) {
          windows.settingsWindow.hide();
        } else {
          windows.settingsWindow.show();
        }
      } else {
        createSettingsWindow();
      }
    }
  });
}

// Update tray menu
function updateTrayMenu(): void {
  if (!tray) return;
  
  const serverRunning = serverManager?.getStatus().running || false;
  const serverPort = store.get('serverPort') || 4020;
  const sessions = serverManager?.getSessions() || [];
  const sessionCount = sessions.length;
  
  const menuItems: Electron.MenuItemConstructorOptions[] = [
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
          } else {
            console.log('Starting server from menu...');
            await startServer();
          }
          // Force menu update after server state change
          setTimeout(() => {
            updateTrayMenu();
          }, 500);
        } catch (error) {
          console.error('Menu click error:', error);
          dialog.showErrorBox('Server Error', `Failed to ${serverRunning ? 'stop' : 'start'} server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    },
    
    // Open Dashboard
    {
      label: 'Open Dashboard',
      enabled: serverRunning,
      click: () => {
        shell.openExternal(`http://localhost:${serverPort}`);
      }
    },
    
    { type: 'separator' },
    
    // Help submenu
    {
      label: 'Help',
      submenu: [
        {
          label: 'Show Tutorial',
          click: () => createWelcomeWindow()
        },
        {
          label: 'Website',
          click: () => shell.openExternal('https://vibetunnel.com')
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/vibetunnel/vibetunnel/issues')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            if (!isDev) {
              autoUpdater.checkForUpdatesAndNotify();
            } else {
              dialog.showMessageBox({
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
          label: `Version ${app.getVersion()}`,
          enabled: false
        },
        {
          label: 'About VibeTunnel',
          click: () => {
            createSettingsWindow('about');
          }
        }
      ]
    },
    
    { type: 'separator' },
    
    // Settings
    {
      label: 'Settings',
      accelerator: 'CmdOrCtrl+,',
      click: () => createSettingsWindow()
    },
    
    { type: 'separator' },
    
    // Quit
    {
      label: 'Quit',
      accelerator: 'CmdOrCtrl+Q',
      click: () => app.quit()
    }
  ];
  
  const contextMenu = Menu.buildFromTemplate(menuItems);
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`VibeTunnel - ${serverRunning ? 'Running' : 'Stopped'}`);
}

// Start periodic menu updates
function startMenuUpdateTimer(): void {
  // Stop any existing timer
  stopMenuUpdateTimer();
  
  // Update menu every 2 seconds to reflect session count changes
  menuUpdateTimer = setInterval(() => {
    updateTrayMenu();
  }, 2000);
}

// Stop periodic menu updates
function stopMenuUpdateTimer(): void {
  if (menuUpdateTimer) {
    clearInterval(menuUpdateTimer);
    menuUpdateTimer = null;
  }
}

// Handle auto-launch
function setupAutoLaunch(): boolean {
  const launchAtLogin = store.get('launchAtLogin') || false;
  
  console.log('[setupAutoLaunch] Called with launchAtLogin:', launchAtLogin);
  console.log('[setupAutoLaunch] Platform:', process.platform);
  console.log('[setupAutoLaunch] Is packaged:', app.isPackaged);
  
  if (isMac || isWin) {
    const exePath = app.getPath('exe');
    console.log('[setupAutoLaunch] Exe path:', exePath);
    
    const settings = {
      openAtLogin: launchAtLogin,
      openAsHidden: true
    };
    
    // On macOS, we need to use the correct API
    if (isMac && app.isPackaged) {
      // macOS uses different settings structure
      const macPath = exePath.replace(/\.app\/.*/, '.app');
      console.log('[setupAutoLaunch] macOS packaged path:', macPath);
    }
    
    console.log('[setupAutoLaunch] Setting login item settings:', settings);
    app.setLoginItemSettings(settings);
    
    // Verify the setting was applied
    const currentSettings = app.getLoginItemSettings();
    console.log('[setupAutoLaunch] Current login item settings after set:', currentSettings);
    
    const success = currentSettings.openAtLogin === launchAtLogin;
    console.log('[setupAutoLaunch] Success:', success);
    return success;
  } else if (isLinux) {
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
      } else {
        if (fs.existsSync(desktopFile)) {
          fs.unlinkSync(desktopFile);
        }
        return true;
      }
    } catch (err) {
      console.error('Failed to setup auto launch:', err);
      return false;
    }
  }
  
  return false;
}

// Handle dock icon visibility (macOS)
function updateDockVisibility(): void {
  if (isMac && app.dock) {
    const showDockIcon = store.get('showDockIcon') || false;
    if (showDockIcon) {
      app.dock.show();
    } else {
      app.dock.hide();
    }
  }
}

// Start server
async function startServer(): Promise<void> {
  console.log('startServer called');
  
  if (!serverManager) {
    const port = store.get('serverPort') || 4020;
    const mode = store.get('serverMode') || 'rust';
    serverManager = new VibeTunnelServerManager(port, mode);
    
    // Listen to server events
    serverManager.on('status-changed', (status) => {
      updateTrayMenu();
      
      // Notify all windows
      const windows = getWindows();
      Object.values(windows).forEach(window => {
        if (window && !window.isDestroyed()) {
          window.webContents.send('server-status-changed', status);
        }
      });
    });
    
    serverManager.on('sessions-changed', (sessions) => {
      // Notify all windows
      const windows = getWindows();
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
  } catch (error) {
    console.error('Failed to start server:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
      dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}\n\nPlease check the console for more details.`);
    }
    updateTrayMenu();
  }
}

// Stop server
async function stopServer(): Promise<void> {
  if (!serverManager) return;
  
  try {
    console.log('Stopping server...');
    await serverManager.stop();
    console.log('Server stopped');
    
    // Stop periodic menu updates
    stopMenuUpdateTimer();
    
    // Update tray menu
    updateTrayMenu();
  } catch (error) {
    console.error('Failed to stop server:', error);
    if (error instanceof Error) {
      dialog.showErrorBox('Server Error', `Failed to stop server: ${error.message}`);
    }
    updateTrayMenu();
  }
}

// Setup IPC handlers
function setupIPCHandlers(): void {
  // Settings
  ipcMain.handle('get-settings', () => {
    return store.store;
  });
  
  ipcMain.handle('set-setting', (_event: IpcMainInvokeEvent, key: string, value: any) => {
    console.log(`Setting ${key} to ${value}`);
    store.set(key as keyof StoreSchema, value);
    
    let success = true;
    
    // Apply changes immediately
    switch (key) {
    case 'launchAtLogin':
      console.log('[IPC] Setting launch at login to:', value);
      success = setupAutoLaunch();
      console.log('[IPC] setupAutoLaunch returned:', success);
      
      if (!success) {
        // Revert the setting if it failed
        store.set(key as keyof StoreSchema, !value);
        
        // Provide more detailed error message
        const currentSettings = app.getLoginItemSettings();
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
        dialog.showMessageBox({
          type: 'info',
          title: 'Restart Required',
          message: 'Please restart the server for the port change to take effect.',
          buttons: ['OK']
        });
      }
      break;
    case 'serverMode':
      // Restart server with new mode
      if (serverManager?.getStatus().running) {
        console.log('[IPC] Server mode changed, restarting server...');
        (async () => {
          try {
            await stopServer();
            // Dispose of the old server manager
            serverManager = null;
            // Start with new mode
            await startServer();
          } catch (error) {
            console.error('[IPC] Failed to restart server with new mode:', error);
            dialog.showErrorBox('Server Error', `Failed to restart server: ${error}`);
          }
        })();
      }
      break;
    }
    
    return success;
  });
  
  // Server control
  ipcMain.handle('start-server', async () => {
    await startServer();
  });
  
  ipcMain.handle('stop-server', async () => {
    await stopServer();
  });
  
  ipcMain.handle('get-server-status', () => {
    return {
      ...serverManager?.getStatus(),
      mode: store.get('serverMode') || 'rust',
      accessMode: store.get('accessMode') || 'localhost'
    };
  });
  
  // Session management
  ipcMain.handle('get-sessions', () => {
    return serverManager?.getSessions() || [];
  });
  
  // System info
  ipcMain.handle('get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node,
      appPath: app.getPath('exe'),
      userDataPath: app.getPath('userData'),
      tempPath: app.getPath('temp')
    };
  });
  
  // Terminal detection
  ipcMain.handle('get-available-terminals', () => {
    return getAvailableTerminals();
  });
  
  // Additional handlers
  ipcMain.handle('create-session', async (_event: IpcMainInvokeEvent, options: any) => {
    if (!serverManager) {
      throw new Error('Server not running');
    }
    return await serverManager.createSession(options);
  });
  
  ipcMain.handle('terminate-session', async (_event: IpcMainInvokeEvent, sessionId: string) => {
    if (!serverManager) {
      throw new Error('Server not running');
    }
    return await serverManager.terminateSession(sessionId);
  });
  
  ipcMain.handle('check-for-updates', () => {
    console.log('[IPC] check-for-updates called');
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
    return { status: 'checking' };
  });
  
  ipcMain.handle('open-log-file', () => {
    console.log('[IPC] open-log-file called');
    const logPath = path.join(app.getPath('userData'), 'server.log');
    console.log('[IPC] Opening log file at:', logPath);
    shell.openPath(logPath);
    return { opened: true, path: logPath };
  });
  
  ipcMain.handle('open-recordings-folder', () => {
    console.log('[IPC] open-recordings-folder called');
    const recordingsPath = path.join(app.getPath('userData'), 'recordings');
    fs.mkdirSync(recordingsPath, { recursive: true });
    console.log('[IPC] Opening recordings folder at:', recordingsPath);
    shell.openPath(recordingsPath);
    return { opened: true, path: recordingsPath };
  });
  
  ipcMain.handle('open-external', (_event: IpcMainInvokeEvent, url: string) => {
    console.log('[IPC] open-external called with URL:', url);
    shell.openExternal(url);
    return { opened: true, url };
  });
  
  ipcMain.handle('open-terminal', (_event: IpcMainInvokeEvent, terminalCommand: string, options?: any) => {
    console.log('[IPC] open-terminal called with command:', terminalCommand);
    console.log('[IPC] Terminal options:', options);
    return openTerminal(terminalCommand, options);
  });
  
  // Window control handlers
  ipcMain.on('close-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) window.close();
  });
  
  ipcMain.on('minimize-window', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) window.minimize();
  });
  
  // Network info
  ipcMain.handle('get-local-ip', () => {
    const networkInterfaces = os.networkInterfaces();
    const addresses: string[] = [];
    
    for (const iface of Object.values(networkInterfaces)) {
      if (!iface) continue;
      for (const config of iface) {
        if (config.family === 'IPv4' && !config.internal) {
          addresses.push(config.address);
        }
      }
    }
    
    return addresses.length > 0 ? addresses[0] : null;
  });
  
  // CLI installation
  ipcMain.handle('install-cli', async () => {
    console.log('[IPC] install-cli called');
    const cliPath = '/usr/local/bin/vt';
    const serverPort = store.get('serverPort') || 4020;
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
      } else if (isLinux) {
        // On Linux, we can't use osascript, need to use sudo
        try {
          // Try to use pkexec or gksudo for GUI sudo
          await execAsync(`pkexec cp /tmp/vt ${cliPath} && pkexec chmod +x ${cliPath}`);
        } catch (error) {
          // Fallback message
          throw new Error('Please run: sudo cp /tmp/vt /usr/local/bin/vt && sudo chmod +x /usr/local/bin/vt');
        }
      } else {
        // Windows: Add to PATH or use a different approach
        throw new Error('CLI installation not yet implemented for Windows');
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to install CLI:', error);
      throw error;
    }
  });
  
  // Ngrok handlers
  ipcMain.handle('start-ngrok-tunnel', async () => {
    // TODO: Implement ngrok functionality
    throw new Error('Ngrok functionality not yet implemented');
  });
  
  ipcMain.handle('stop-ngrok-tunnel', async () => {
    // TODO: Implement ngrok functionality
    return { status: 'disconnected' };
  });
  
  ipcMain.handle('get-ngrok-status', () => {
    // TODO: Implement ngrok functionality
    return { status: 'disconnected', url: null };
  });
  
  // Debug handlers
  ipcMain.handle('open-console-window', () => {
    createConsoleWindow();
  });
  
  ipcMain.handle('open-dev-tools', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.webContents.openDevTools();
    }
  });
  
  ipcMain.handle('open-user-data-folder', () => {
    shell.openPath(app.getPath('userData'));
  });
  
  ipcMain.handle('open-welcome-window', () => {
    createWelcomeWindow();
  });
  
  ipcMain.handle('reset-all-settings', () => {
    store.clear();
    app.relaunch();
    app.quit();
  });
  
  // Context menu for right-click
  ipcMain.on('show-context-menu', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Inspect Element',
          click: () => {
            window.webContents.inspectElement(0, 0);
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            window.webContents.reload();
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            window.webContents.reloadIgnoringCache();
          }
        }
      ]);
      contextMenu.popup({ window });
    }
  });
}

// Setup auto-updater
function setupAutoUpdater(): void {
  const updateChannel = store.get('updateChannel') || 'stable';
  
  autoUpdater.channel = updateChannel;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  
  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: 'A new version of VibeTunnel is available and will be downloaded in the background.',
      buttons: ['OK']
    });
  });
  
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart the app to apply the update.',
      buttons: ['Restart', 'Later']
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });
  
  // Check for updates
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// App event handlers
app.whenReady().then(() => {
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
  if (store.get('firstRun')) {
    createWelcomeWindow();
  } else {
    // Auto-start server
    startServer();
  }
  
  // DEBUG CONVENIENCE: Auto-open settings window on startup
  // TODO: Remove this before production release!
  console.log('=== DEBUG MODE: Auto-opening settings window ===');
  setTimeout(() => {
    createSettingsWindow();
  }, 1000); // Small delay to ensure everything is initialized
  
  // Setup auto-updater
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  // Don't quit when all windows are closed (tray app)
  if (!isMac) {
    // On Windows/Linux, we keep running in the tray
  }
});

app.on('before-quit', async () => {
  // Cleanup on quit
  if (store.get('autoCleanupOnQuit')) {
    if (serverManager) {
      await serverManager.cleanup();
    }
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    const windows = getWindows();
    if (windows.settingsWindow) {
      if (windows.settingsWindow.isMinimized()) windows.settingsWindow.restore();
      windows.settingsWindow.focus();
    } else {
      createSettingsWindow();
    }
  });
}