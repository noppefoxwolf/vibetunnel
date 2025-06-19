"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
console.log('=== PRELOAD SCRIPT LOADING ===');
// Define the API we expose to the renderer
const electronAPI = {
    // Settings
    getSettings: () => electron_1.ipcRenderer.invoke('get-settings'),
    setSetting: (key, value) => electron_1.ipcRenderer.invoke('set-setting', key, value),
    // Server control
    startServer: () => electron_1.ipcRenderer.invoke('start-server'),
    stopServer: () => electron_1.ipcRenderer.invoke('stop-server'),
    getServerStatus: () => electron_1.ipcRenderer.invoke('get-server-status'),
    // Session management
    getSessions: () => electron_1.ipcRenderer.invoke('get-sessions'),
    createSession: (options) => electron_1.ipcRenderer.invoke('create-session', options),
    terminateSession: (sessionId) => electron_1.ipcRenderer.invoke('terminate-session', sessionId),
    // System info
    getSystemInfo: () => electron_1.ipcRenderer.invoke('get-system-info'),
    getAvailableTerminals: () => electron_1.ipcRenderer.invoke('get-available-terminals'),
    // Window control
    closeWindow: () => electron_1.ipcRenderer.send('close-window'),
    minimizeWindow: () => electron_1.ipcRenderer.send('minimize-window'),
    // Updates
    checkForUpdates: () => electron_1.ipcRenderer.invoke('check-for-updates'),
    // File operations
    openLogFile: () => electron_1.ipcRenderer.invoke('open-log-file'),
    openRecordingsFolder: () => electron_1.ipcRenderer.invoke('open-recordings-folder'),
    // External links
    openExternal: (url) => electron_1.ipcRenderer.invoke('open-external', url),
    // Terminal operations
    openTerminal: (terminalCommand, options) => electron_1.ipcRenderer.invoke('open-terminal', terminalCommand, options),
    // Network
    getLocalIP: () => electron_1.ipcRenderer.invoke('get-local-ip'),
    // CLI
    installCLI: () => electron_1.ipcRenderer.invoke('install-cli'),
    // Ngrok
    startNgrokTunnel: () => electron_1.ipcRenderer.invoke('start-ngrok-tunnel'),
    stopNgrokTunnel: () => electron_1.ipcRenderer.invoke('stop-ngrok-tunnel'),
    getNgrokStatus: () => electron_1.ipcRenderer.invoke('get-ngrok-status'),
    // Debug
    openConsoleWindow: () => electron_1.ipcRenderer.invoke('open-console-window'),
    openDevTools: () => electron_1.ipcRenderer.invoke('open-dev-tools'),
    openUserDataFolder: () => electron_1.ipcRenderer.invoke('open-user-data-folder'),
    openWelcomeWindow: () => electron_1.ipcRenderer.invoke('open-welcome-window'),
    resetAllSettings: () => electron_1.ipcRenderer.invoke('reset-all-settings'),
    // Events
    onServerStatusChanged: (callback) => {
        const listener = (_event, status) => callback(status);
        electron_1.ipcRenderer.on('server-status-changed', listener);
        return () => electron_1.ipcRenderer.removeListener('server-status-changed', listener);
    },
    onSessionsChanged: (callback) => {
        const listener = (_event, sessions) => callback(sessions);
        electron_1.ipcRenderer.on('sessions-changed', listener);
        return () => electron_1.ipcRenderer.removeListener('sessions-changed', listener);
    },
    onUpdateAvailable: (callback) => {
        const listener = (_event, info) => callback(info);
        electron_1.ipcRenderer.on('update-available', listener);
        return () => electron_1.ipcRenderer.removeListener('update-available', listener);
    },
    onUpdateDownloaded: (callback) => {
        const listener = (_event, info) => callback(info);
        electron_1.ipcRenderer.on('update-downloaded', listener);
        return () => electron_1.ipcRenderer.removeListener('update-downloaded', listener);
    },
    // Generic event listener
    on: (channel, callback) => {
        const listener = (_event, ...args) => callback(...args);
        electron_1.ipcRenderer.on(channel, listener);
        return () => electron_1.ipcRenderer.removeListener(channel, listener);
    },
    // Remove event listeners
    removeAllListeners: (channel) => {
        electron_1.ipcRenderer.removeAllListeners(channel);
    }
};
// Terminal-specific API
const terminalAPI = {
    // Terminal I/O
    sendInput: (sessionId, data) => electron_1.ipcRenderer.send('terminal-input', sessionId, data),
    resize: (sessionId, cols, rows) => electron_1.ipcRenderer.send('terminal-resize', sessionId, cols, rows),
    // Terminal events
    onData: (sessionId, callback) => {
        const listener = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(`terminal-data-${sessionId}`, listener);
        return () => electron_1.ipcRenderer.removeListener(`terminal-data-${sessionId}`, listener);
    },
    onExit: (sessionId, callback) => {
        const listener = (_event, code) => callback(code);
        electron_1.ipcRenderer.on(`terminal-exit-${sessionId}`, listener);
        return () => electron_1.ipcRenderer.removeListener(`terminal-exit-${sessionId}`, listener);
    },
    // Cleanup
    dispose: (sessionId) => {
        electron_1.ipcRenderer.removeAllListeners(`terminal-data-${sessionId}`);
        electron_1.ipcRenderer.removeAllListeners(`terminal-exit-${sessionId}`);
    }
};
// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', electronAPI);
electron_1.contextBridge.exposeInMainWorld('terminalAPI', terminalAPI);
//# sourceMappingURL=preload.js.map