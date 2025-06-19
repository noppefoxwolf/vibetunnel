import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// Create a more complete mock app
const mockApp = new EventEmitter() as any;
mockApp.getVersion = vi.fn(() => '1.0.0');
mockApp.getPath = vi.fn((type: string) => {
  switch (type) {
    case 'userData': return '/mock/userData';
    case 'temp': return '/mock/temp';
    case 'exe': return '/mock/app.exe';
    default: return '/mock/path';
  }
});
mockApp.getAppPath = vi.fn(() => '/mock/app');
mockApp.isPackaged = false;
mockApp.dock = {
  show: vi.fn(),
  hide: vi.fn(),
};
mockApp.quit = vi.fn();
mockApp.relaunch = vi.fn();
mockApp.setLoginItemSettings = vi.fn();
mockApp.getLoginItemSettings = vi.fn(() => ({ openAtLogin: false }));
mockApp.requestSingleInstanceLock = vi.fn(() => true);
mockApp.whenReady = vi.fn(() => Promise.resolve());

// Mock electron
vi.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadFile: vi.fn(),
    focus: vi.fn(),
    on: vi.fn(),
    webContents: {
      send: vi.fn(),
      openDevTools: vi.fn(),
      on: vi.fn(),
    },
  })),
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
  },
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    popUpContextMenu: vi.fn(),
  })),
  dialog: {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({
      resize: vi.fn(() => ({
        setTemplateImage: vi.fn(),
      })),
    })),
  },
}));

// Mock electron-updater
vi.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdatesAndNotify: vi.fn(),
    on: vi.fn(),
    channel: 'stable',
    autoDownload: true,
    autoInstallOnAppQuit: true,
    quitAndInstall: vi.fn(),
  },
}));

// Mock other dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user'),
  networkInterfaces: vi.fn(() => ({})),
}));

vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, callback: any) => {
    if (callback) callback(null, '', '');
  }),
  spawn: vi.fn(() => ({
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    on: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  })),
}));

vi.mock('../main/store', () => ({
  default: {
    get: vi.fn((key: string) => {
      const defaults: Record<string, any> = {
        serverPort: 4020,
        launchAtLogin: false,
        showDockIcon: false,
        serverMode: 'rust',
        updateChannel: 'stable',
        firstRun: false,
        autoCleanupOnQuit: true,
      };
      return defaults[key];
    }),
    set: vi.fn(),
    has: vi.fn(() => true),
    clear: vi.fn(),
    store: {},
  },
}));

vi.mock('../main/windows', () => ({
  createSettingsWindow: vi.fn(() => ({
    focus: vi.fn(),
    webContents: { send: vi.fn() },
  })),
  createWelcomeWindow: vi.fn(() => ({
    focus: vi.fn(),
  })),
  createConsoleWindow: vi.fn(() => ({
    focus: vi.fn(),
  })),
  getWindows: vi.fn(() => ({
    settingsWindow: null,
    welcomeWindow: null,
    consoleWindow: null,
  })),
  closeAllWindows: vi.fn(),
}));

vi.mock('../main/serverManager', () => ({
  VibeTunnelServerManager: vi.fn().mockImplementation(() => ({
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    cleanup: vi.fn(() => Promise.resolve()),
    getStatus: vi.fn(() => ({ running: false, port: 4020 })),
    getSessions: vi.fn(() => []),
    on: vi.fn(),
  })),
}));

vi.mock('../main/terminalDetector', () => ({
  getAvailableTerminals: vi.fn(() => []),
  openTerminal: vi.fn(() => Promise.resolve()),
}));

describe('Main Process', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should import without errors', async () => {
    await expect(import('../main/main')).resolves.not.toThrow();
  });

  it('should request single instance lock', async () => {
    await import('../main/main');
    expect(mockApp.requestSingleInstanceLock).toHaveBeenCalled();
  });

  it('should set up app ready handler', async () => {
    await import('../main/main');
    expect(mockApp.whenReady).toHaveBeenCalled();
  });

  it('should handle second instance', async () => {
    await import('../main/main');
    
    // Find the second-instance handler
    const handler = mockApp.on.mock.calls.find(
      call => call[0] === 'second-instance'
    )?.[1];
    
    expect(handler).toBeDefined();
    
    // Test that it doesn't throw
    if (handler) {
      expect(() => handler()).not.toThrow();
    }
  });

  it('should handle before-quit event', async () => {
    await import('../main/main');
    
    // Find the before-quit handler
    const handler = mockApp.on.mock.calls.find(
      call => call[0] === 'before-quit'
    )?.[1];
    
    expect(handler).toBeDefined();
    
    // Test that it doesn't throw
    if (handler) {
      await expect(handler()).resolves.not.toThrow();
    }
  });

  it('should handle window-all-closed event', async () => {
    await import('../main/main');
    
    // Find the window-all-closed handler
    const handler = mockApp.on.mock.calls.find(
      call => call[0] === 'window-all-closed'
    )?.[1];
    
    expect(handler).toBeDefined();
    
    // Test that it doesn't throw
    if (handler) {
      expect(() => handler()).not.toThrow();
    }
  });

  it('should set up IPC handlers', async () => {
    await import('../main/main');
    
    // Trigger app ready
    const readyHandler = mockApp.whenReady.mock.calls[0]?.[0];
    if (readyHandler) {
      await readyHandler();
    }
    
    const { ipcMain } = require('electron');
    
    // Check that various IPC handlers are registered
    const handlers = ipcMain.handle.mock.calls.map(call => call[0]);
    
    expect(handlers).toContain('get-settings');
    expect(handlers).toContain('set-setting');
    expect(handlers).toContain('start-server');
    expect(handlers).toContain('stop-server');
    expect(handlers).toContain('get-server-status');
    expect(handlers).toContain('get-sessions');
    expect(handlers).toContain('get-system-info');
  });
});