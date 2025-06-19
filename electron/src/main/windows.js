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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsWindow = createSettingsWindow;
exports.createWelcomeWindow = createWelcomeWindow;
exports.createConsoleWindow = createConsoleWindow;
exports.getWindows = getWindows;
exports.closeAllWindows = closeAllWindows;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const windows = {
    settingsWindow: null,
    welcomeWindow: null,
    consoleWindow: null
};
const defaultWindowOptions = {
    webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/preload.js')
    }
};
function createSettingsWindow(initialTab) {
    if (windows.settingsWindow) {
        windows.settingsWindow.focus();
        if (initialTab) {
            windows.settingsWindow.webContents.send('switch-tab', initialTab);
        }
        return windows.settingsWindow;
    }
    windows.settingsWindow = new electron_1.BrowserWindow({
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
            windows.settingsWindow.webContents.send('switch-tab', initialTab);
        });
    }
    windows.settingsWindow.on('closed', () => {
        windows.settingsWindow = null;
    });
    return windows.settingsWindow;
}
function createWelcomeWindow() {
    if (windows.welcomeWindow) {
        windows.welcomeWindow.focus();
        return windows.welcomeWindow;
    }
    windows.welcomeWindow = new electron_1.BrowserWindow({
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
function createConsoleWindow() {
    if (windows.consoleWindow) {
        windows.consoleWindow.focus();
        return windows.consoleWindow;
    }
    windows.consoleWindow = new electron_1.BrowserWindow({
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
function getWindows() {
    return windows;
}
function closeAllWindows() {
    Object.values(windows).forEach(window => {
        if (window && !window.isDestroyed()) {
            window.close();
        }
    });
}
//# sourceMappingURL=windows.js.map