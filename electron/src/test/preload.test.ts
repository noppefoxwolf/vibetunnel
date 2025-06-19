import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock electron modules
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
}));

describe('Preload Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should load without errors', async () => {
    // Import the preload script
    await import('../preload/preload');
    
    const { contextBridge } = require('electron');
    
    // Should expose electronAPI and terminalAPI
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object));
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('terminalAPI', expect.any(Object));
  });

  it('should expose electronAPI with all required methods', async () => {
    await import('../preload/preload');
    
    const { contextBridge } = require('electron');
    const electronAPI = contextBridge.exposeInMainWorld.mock.calls.find(
      call => call[0] === 'electronAPI'
    )?.[1];
    
    expect(electronAPI).toBeDefined();
    
    // Check for required methods
    expect(electronAPI).toHaveProperty('getSettings');
    expect(electronAPI).toHaveProperty('setSetting');
    expect(electronAPI).toHaveProperty('startServer');
    expect(electronAPI).toHaveProperty('stopServer');
    expect(electronAPI).toHaveProperty('getServerStatus');
    expect(electronAPI).toHaveProperty('getSessions');
    expect(electronAPI).toHaveProperty('createSession');
    expect(electronAPI).toHaveProperty('terminateSession');
    expect(electronAPI).toHaveProperty('getSystemInfo');
    expect(electronAPI).toHaveProperty('openExternal');
    expect(electronAPI).toHaveProperty('closeWindow');
    expect(electronAPI).toHaveProperty('minimizeWindow');
    
    // Check event handlers
    expect(electronAPI).toHaveProperty('onServerStatusChanged');
    expect(electronAPI).toHaveProperty('onSessionsChanged');
    expect(electronAPI).toHaveProperty('on');
    expect(electronAPI).toHaveProperty('removeAllListeners');
  });

  it('should expose terminalAPI with all required methods', async () => {
    await import('../preload/preload');
    
    const { contextBridge } = require('electron');
    const terminalAPI = contextBridge.exposeInMainWorld.mock.calls.find(
      call => call[0] === 'terminalAPI'
    )?.[1];
    
    expect(terminalAPI).toBeDefined();
    
    // Check for required methods
    expect(terminalAPI).toHaveProperty('sendInput');
    expect(terminalAPI).toHaveProperty('resize');
    expect(terminalAPI).toHaveProperty('onData');
    expect(terminalAPI).toHaveProperty('onExit');
    expect(terminalAPI).toHaveProperty('dispose');
  });

  it('should handle IPC calls correctly', async () => {
    await import('../preload/preload');
    
    const { contextBridge, ipcRenderer } = require('electron');
    const electronAPI = contextBridge.exposeInMainWorld.mock.calls.find(
      call => call[0] === 'electronAPI'
    )?.[1];
    
    // Test a few IPC methods
    electronAPI.getSettings();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('get-settings');
    
    electronAPI.setSetting('testKey', 'testValue');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('set-setting', 'testKey', 'testValue');
    
    electronAPI.startServer();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('start-server');
  });

  it('should handle event listeners correctly', async () => {
    await import('../preload/preload');
    
    const { contextBridge, ipcRenderer } = require('electron');
    const electronAPI = contextBridge.exposeInMainWorld.mock.calls.find(
      call => call[0] === 'electronAPI'
    )?.[1];
    
    const callback = vi.fn();
    const unsubscribe = electronAPI.onServerStatusChanged(callback);
    
    expect(ipcRenderer.on).toHaveBeenCalledWith('server-status-changed', expect.any(Function));
    
    // Test unsubscribe
    unsubscribe();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('server-status-changed', expect.any(Function));
  });
});