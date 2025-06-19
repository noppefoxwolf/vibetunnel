const { app, BrowserWindow, Menu, Tray, dialog, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Initialize electron store for preferences
const store = new Store();

// Development mode flag
const isDev = process.argv.includes('--dev');

// Global references
let mainWindow = null;
let tray = null;
let settingsWindow = null;
let welcomeWindow = null;
let serverManager = null;

// Platform detection
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

// Default settings
const DEFAULT_SETTINGS = {
  serverPort: 4020,
  launchAtLogin: false,
  showDockIcon: false,
  serverMode: 'rust', // 'rust' or 'swift' (swift only available on macOS)
  accessMode: 'localhost', // 'localhost', 'network', 'ngrok', 'tailscale'
  networkPassword: '',
  ngrokAuthToken: '',
  autoCleanupOnQuit: true,
  debugMode: false,
  updateChannel: 'stable', // 'stable' or 'prerelease'
  firstRun: true
};

// Initialize settings
function initializeSettings() {
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (!store.has(key)) {
      store.set(key, DEFAULT_SETTINGS[key]);
    }
  });
}

// Create system tray
function createTray() {
  const iconPath = path.join(__dirname, '../../assets', isMac ? 'tray-icon.png' : 'tray-icon.png');
  
  tray = new Tray(iconPath);
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (isWin) {
      // Windows: left click shows menu
      tray.popUpContextMenu();
    } else if (isMac) {
      // macOS: left click shows/hides main window
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
      }
    }
  });
}

// Update tray menu
function updateTrayMenu() {
  if (!tray) return;
  
  const serverStatus = serverManager?.isRunning() ? 'Running' : 'Stopped';
  const serverPort = store.get('serverPort', 4020);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `VibeTunnel - ${serverStatus}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        shell.openExternal(`http://localhost:${serverPort}`);
      }
    },
    {
      label: 'Active Sessions',
      submenu: getActiveSessionsMenu()
    },
    { type: 'separator' },
    {
      label: 'Preferences...',
      click: () => {
        createSettingsWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Start Server',
      click: () => {
        startServer();
      },
      visible: !serverManager?.isRunning()
    },
    {
      label: 'Stop Server',
      click: () => {
        stopServer();
      },
      visible: serverManager?.isRunning()
    },
    { type: 'separator' },
    {
      label: 'Quit VibeTunnel',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip(`VibeTunnel - ${serverStatus}`);
}

// Get active sessions menu items
function getActiveSessionsMenu() {
  const sessions = serverManager?.getActiveSessions() || [];
  
  if (sessions.length === 0) {
    return [{
      label: 'No active sessions',
      enabled: false
    }];
  }
  
  return sessions.map(session => ({
    label: `${session.name} (${session.id})`,
    click: () => {
      shell.openExternal(`http://localhost:${store.get('serverPort')}/session/${session.id}`);
    }
  }));
}

// Create main window (hidden by default)
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Hidden window for background operations
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });
  
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create settings window
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  
  settingsWindow = new BrowserWindow({
    width: 700,
    height: 600,
    title: 'VibeTunnel Preferences',
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });
  
  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// Create welcome window
function createWelcomeWindow() {
  if (welcomeWindow) {
    welcomeWindow.focus();
    return;
  }
  
  welcomeWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Welcome to VibeTunnel',
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });
  
  welcomeWindow.loadFile(path.join(__dirname, '../renderer/welcome.html'));
  
  welcomeWindow.on('closed', () => {
    welcomeWindow = null;
    store.set('firstRun', false);
  });
}

// Handle auto-launch
function setupAutoLaunch() {
  const launchAtLogin = store.get('launchAtLogin', false);
  
  if (isMac || isWin) {
    app.setLoginItemSettings({
      openAtLogin: launchAtLogin,
      openAsHidden: true
    });
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
    
    if (launchAtLogin) {
      fs.mkdirSync(autostartDir, { recursive: true });
      fs.writeFileSync(desktopFile, desktopEntry);
    } else {
      try {
        fs.unlinkSync(desktopFile);
      } catch (err) {
        // File doesn't exist
      }
    }
  }
}

// Handle dock icon visibility (macOS)
function updateDockVisibility() {
  if (isMac) {
    const showDockIcon = store.get('showDockIcon', false);
    if (showDockIcon) {
      app.dock.show();
    } else {
      app.dock.hide();
    }
  }
}

// Start server
async function startServer() {
  if (!serverManager) {
    const ServerManager = require('./serverManager');
    serverManager = new ServerManager();
  }
  
  try {
    await serverManager.start();
    updateTrayMenu();
  } catch (error) {
    dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}`);
  }
}

// Stop server
async function stopServer() {
  if (!serverManager) return;
  
  try {
    await serverManager.stop();
    updateTrayMenu();
  } catch (error) {
    dialog.showErrorBox('Server Error', `Failed to stop server: ${error.message}`);
  }
}

// Setup IPC handlers
function setupIPCHandlers() {
  // Settings
  ipcMain.handle('get-settings', () => {
    return store.store;
  });
  
  ipcMain.handle('set-setting', (event, key, value) => {
    store.set(key, value);
    
    // Apply changes
    if (key === 'launchAtLogin') {
      setupAutoLaunch();
    } else if (key === 'showDockIcon') {
      updateDockVisibility();
    }
    
    return true;
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
      running: serverManager?.isRunning() || false,
      port: store.get('serverPort', 4020),
      mode: store.get('serverMode', 'rust'),
      accessMode: store.get('accessMode', 'localhost')
    };
  });
  
  // Session management
  ipcMain.handle('get-sessions', () => {
    return serverManager?.getActiveSessions() || [];
  });
  
  // System info
  ipcMain.handle('get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electron: process.versions.electron,
      node: process.versions.node
    };
  });
  
  // Terminal detection
  ipcMain.handle('get-available-terminals', () => {
    return require('./terminalDetector').getAvailableTerminals();
  });
  
  // Additional handlers
  ipcMain.handle('create-session', async (event, options) => {
    if (!serverManager) {
      throw new Error('Server not running');
    }
    return await serverManager.createSession(options);
  });
  
  ipcMain.handle('terminate-session', async (event, sessionId) => {
    if (!serverManager) {
      throw new Error('Server not running');
    }
    return await serverManager.terminateSession(sessionId);
  });
  
  ipcMain.handle('check-for-updates', () => {
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  });
  
  ipcMain.handle('open-log-file', () => {
    const logPath = path.join(app.getPath('userData'), 'server.log');
    shell.openPath(logPath);
  });
  
  ipcMain.handle('open-recordings-folder', () => {
    const recordingsPath = path.join(app.getPath('userData'), 'recordings');
    fs.mkdirSync(recordingsPath, { recursive: true });
    shell.openPath(recordingsPath);
  });
  
  ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
  });
  
  ipcMain.handle('open-terminal', (event, terminalCommand, options) => {
    const TerminalDetector = require('./terminalDetector');
    return TerminalDetector.openTerminal(terminalCommand, options);
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
}

// Setup auto-updater
function setupAutoUpdater() {
  const updateChannel = store.get('updateChannel', 'stable');
  
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
  
  // Create main window (hidden)
  createMainWindow();
  
  // Setup IPC handlers
  setupIPCHandlers();
  
  // Setup auto-launch
  setupAutoLaunch();
  
  // Update dock visibility
  updateDockVisibility();
  
  // Show welcome window on first run
  if (store.get('firstRun', true)) {
    createWelcomeWindow();
  } else {
    // Auto-start server
    startServer();
  }
  
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
  if (store.get('autoCleanupOnQuit', true)) {
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
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.focus();
    } else {
      createSettingsWindow();
    }
  });
}