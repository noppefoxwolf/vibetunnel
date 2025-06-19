import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

console.log('=== PRELOAD SCRIPT LOADING ===');

// Define the API we expose to the renderer
const electronAPI = {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: any) => ipcRenderer.invoke('set-setting', key, value),
  
  // Server control
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // Session management
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  createSession: (options: any) => ipcRenderer.invoke('create-session', options),
  terminateSession: (sessionId: string) => ipcRenderer.invoke('terminate-session', sessionId),
  
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
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  
  // Terminal operations
  openTerminal: (terminalCommand: string, options?: any) => 
    ipcRenderer.invoke('open-terminal', terminalCommand, options),
  
  // Network
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
  
  // CLI
  installCLI: () => ipcRenderer.invoke('install-cli'),
  
  // Ngrok
  startNgrokTunnel: () => ipcRenderer.invoke('start-ngrok-tunnel'),
  stopNgrokTunnel: () => ipcRenderer.invoke('stop-ngrok-tunnel'),
  getNgrokStatus: () => ipcRenderer.invoke('get-ngrok-status'),
  
  // Debug
  openConsoleWindow: () => ipcRenderer.invoke('open-console-window'),
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),
  openUserDataFolder: () => ipcRenderer.invoke('open-user-data-folder'),
  openWelcomeWindow: () => ipcRenderer.invoke('open-welcome-window'),
  resetAllSettings: () => ipcRenderer.invoke('reset-all-settings'),
  
  // Events
  onServerStatusChanged: (callback: (status: any) => void) => {
    const listener = (_event: IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on('server-status-changed', listener);
    return () => ipcRenderer.removeListener('server-status-changed', listener);
  },
  
  onSessionsChanged: (callback: (sessions: any[]) => void) => {
    const listener = (_event: IpcRendererEvent, sessions: any[]) => callback(sessions);
    ipcRenderer.on('sessions-changed', listener);
    return () => ipcRenderer.removeListener('sessions-changed', listener);
  },
  
  onUpdateAvailable: (callback: (info: any) => void) => {
    const listener = (_event: IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update-available', listener);
    return () => ipcRenderer.removeListener('update-available', listener);
  },
  
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const listener = (_event: IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update-downloaded', listener);
    return () => ipcRenderer.removeListener('update-downloaded', listener);
  },
  
  // Generic event listener
  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_event: IpcRendererEvent, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  
  // Remove event listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// Terminal-specific API
const terminalAPI = {
  // Terminal I/O
  sendInput: (sessionId: string, data: string) => 
    ipcRenderer.send('terminal-input', sessionId, data),
  resize: (sessionId: string, cols: number, rows: number) => 
    ipcRenderer.send('terminal-resize', sessionId, cols, rows),
  
  // Terminal events
  onData: (sessionId: string, callback: (data: string) => void) => {
    const listener = (_event: IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on(`terminal-data-${sessionId}`, listener);
    return () => ipcRenderer.removeListener(`terminal-data-${sessionId}`, listener);
  },
  
  onExit: (sessionId: string, callback: (code: number) => void) => {
    const listener = (_event: IpcRendererEvent, code: number) => callback(code);
    ipcRenderer.on(`terminal-exit-${sessionId}`, listener);
    return () => ipcRenderer.removeListener(`terminal-exit-${sessionId}`, listener);
  },
  
  // Cleanup
  dispose: (sessionId: string) => {
    ipcRenderer.removeAllListeners(`terminal-data-${sessionId}`);
    ipcRenderer.removeAllListeners(`terminal-exit-${sessionId}`);
  }
};

// Expose protected methods that allow the renderer process
// to use the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('terminalAPI', terminalAPI);