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
    width: 700,
    height: 600,
    title: 'VibeTunnel Preferences',
    resizable: true,
    minimizable: true,
    maximizable: true,
  });

  windows.settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  // Always open DevTools for debugging
  windows.settingsWindow.webContents.openDevTools();

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
    resizable: true,
    minimizable: true,
    maximizable: true,
  });

  windows.welcomeWindow.loadFile(path.join(__dirname, '../renderer/welcome.html'));

  // Always open DevTools for debugging
  windows.welcomeWindow.webContents.openDevTools();

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

  // Always open DevTools for debugging
  windows.consoleWindow.webContents.openDevTools();

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