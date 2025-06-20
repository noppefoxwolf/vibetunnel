import { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import * as path from 'path';

export interface WindowManager {
  settingsWindow: BrowserWindow | null;
  welcomeWindow: BrowserWindow | null;
  consoleWindow: BrowserWindow | null;
}

const windows: WindowManager = {
  settingsWindow: null,
  welcomeWindow: null,
  consoleWindow: null
};

const defaultWindowOptions: BrowserWindowConstructorOptions = {
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, '../preload/preload.js')
  }
};

export function createSettingsWindow(initialTab?: string): BrowserWindow {
  if (windows.settingsWindow) {
    windows.settingsWindow.focus();
    if (initialTab) {
      windows.settingsWindow.webContents.send('switch-tab', initialTab);
    }
    return windows.settingsWindow;
  }

  windows.settingsWindow = new BrowserWindow({
    ...defaultWindowOptions,
    width: 900,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    title: 'VibeTunnel Preferences',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    resizable: true,
    minimizable: true,
    maximizable: true,
    backgroundColor: '#000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
  });

  windows.settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  // DevTools disabled by default (can be opened via debug button)

  // Send initial tab after window loads
  if (initialTab) {
    windows.settingsWindow.webContents.on('did-finish-load', () => {
      windows.settingsWindow!.webContents.send('switch-tab', initialTab);
    });
  }

  windows.settingsWindow.on('closed', () => {
    windows.settingsWindow = null;
  });

  return windows.settingsWindow;
}

export function createWelcomeWindow(): BrowserWindow {
  if (windows.welcomeWindow) {
    windows.welcomeWindow.focus();
    return windows.welcomeWindow;
  }

  windows.welcomeWindow = new BrowserWindow({
    ...defaultWindowOptions,
    width: 800,
    height: 600,
    title: 'Welcome to VibeTunnel',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    resizable: false,
    minimizable: true,
    maximizable: false,
    backgroundColor: '#000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
  });

  windows.welcomeWindow.loadFile(path.join(__dirname, '../renderer/welcome.html'));

  // DevTools disabled by default (can be opened via debug button)

  windows.welcomeWindow.on('closed', () => {
    windows.welcomeWindow = null;
  });

  return windows.welcomeWindow;
}

export function createConsoleWindow(): BrowserWindow {
  if (windows.consoleWindow) {
    windows.consoleWindow.focus();
    return windows.consoleWindow;
  }

  windows.consoleWindow = new BrowserWindow({
    ...defaultWindowOptions,
    width: 800,
    height: 600,
    title: 'VibeTunnel Console',
    resizable: true,
  });

  windows.consoleWindow.loadFile(path.join(__dirname, '../renderer/console.html'));

  // DevTools disabled by default (can be opened via debug button)

  windows.consoleWindow.on('closed', () => {
    windows.consoleWindow = null;
  });

  return windows.consoleWindow;
}

export function getWindows(): WindowManager {
  return windows;
}

export function closeAllWindows(): void {
  Object.values(windows).forEach(window => {
    if (window && !window.isDestroyed()) {
      window.close();
    }
  });
}