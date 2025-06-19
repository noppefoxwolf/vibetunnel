const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  
  // Server control
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // Session management
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  createSession: (options) => ipcRenderer.invoke('create-session', options),
  terminateSession: (sessionId) => ipcRenderer.invoke('terminate-session', sessionId),
  
  // System info
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getAvailableTerminals: () => ipcRenderer.invoke('get-available-terminals'),
  
  // Window control
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  
  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // File operations
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Terminal operations
  openTerminal: (terminalCommand, options) => ipcRenderer.invoke('open-terminal', terminalCommand, options),
  
  // Events
  onServerStatusChanged: (callback) => {
    ipcRenderer.on('server-status-changed', (event, status) => callback(status));
  },
  
  onSessionsChanged: (callback) => {
    ipcRenderer.on('sessions-changed', (event, sessions) => callback(sessions));
  },
  
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  
  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Terminal-specific API for terminal renderer
contextBridge.exposeInMainWorld('terminalAPI', {
  // Terminal I/O
  sendInput: (sessionId, data) => ipcRenderer.send('terminal-input', sessionId, data),
  resize: (sessionId, cols, rows) => ipcRenderer.send('terminal-resize', sessionId, cols, rows),
  
  // Terminal events
  onData: (sessionId, callback) => {
    ipcRenderer.on(`terminal-data-${sessionId}`, (event, data) => callback(data));
  },
  
  onExit: (sessionId, callback) => {
    ipcRenderer.on(`terminal-exit-${sessionId}`, (event, code) => callback(code));
  },
  
  // Cleanup
  dispose: (sessionId) => {
    ipcRenderer.removeAllListeners(`terminal-data-${sessionId}`);
    ipcRenderer.removeAllListeners(`terminal-exit-${sessionId}`);
  }
});