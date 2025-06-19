import { describe, it, expect } from 'vitest';
import type { ElectronAPI } from '../types/electron';
import type { ServerManager, ServerStatus, Session } from '../types/server';
import type { TerminalAPI, TerminalSession } from '../types/terminal';
import type { StoreSchema } from '../types/store';

describe('TypeScript Types', () => {
  it('should compile ElectronAPI type', () => {
    const api: Partial<ElectronAPI> = {
      getSettings: async () => ({} as StoreSchema),
      setSetting: async (key, value) => {},
      startServer: async () => {},
      stopServer: async () => {},
    };
    
    expect(api).toBeDefined();
  });

  it('should compile ServerManager type', () => {
    const manager: Partial<ServerManager> = {
      start: async () => {},
      stop: async () => {},
      getStatus: () => ({
        running: false,
        port: 4020,
        sessions: 0,
      }),
      getSessions: () => [],
    };
    
    expect(manager).toBeDefined();
  });

  it('should compile ServerStatus type', () => {
    const status: ServerStatus = {
      running: true,
      port: 4020,
      pid: 12345,
      startTime: new Date(),
      sessions: 2,
    };
    
    expect(status.running).toBe(true);
    expect(status.port).toBe(4020);
  });

  it('should compile Session type', () => {
    const session: Session = {
      id: 'test-session',
      name: 'Test Session',
      created: new Date(),
      lastActivity: new Date(),
      active: true,
      clientIp: '127.0.0.1',
      userAgent: 'Test Agent',
    };
    
    expect(session.id).toBe('test-session');
  });

  it('should compile TerminalAPI type', () => {
    const api: Partial<TerminalAPI> = {
      sendInput: (sessionId, data) => {},
      resize: (sessionId, cols, rows) => {},
      onData: (sessionId, callback) => () => {},
      onExit: (sessionId, callback) => () => {},
      dispose: (sessionId) => {},
    };
    
    expect(api).toBeDefined();
  });

  it('should compile TerminalSession type', () => {
    const session: TerminalSession = {
      id: 'term-123',
      rows: 24,
      cols: 80,
      cwd: '/home/user',
      command: '/bin/bash',
      pid: 5678,
    };
    
    expect(session.rows).toBe(24);
    expect(session.cols).toBe(80);
  });

  it('should compile StoreSchema type', () => {
    const schema: StoreSchema = {
      serverPort: 4020,
      launchAtLogin: false,
      showDockIcon: true,
      autoCleanupOnQuit: true,
      dashboardPassword: '',
      accessMode: 'localhost',
      terminalApp: 'default',
      cleanupOnStartup: true,
      serverMode: 'rust',
      updateChannel: 'stable',
      debugMode: false,
      firstRun: true,
      recordingsPath: '/path/to/recordings',
      logPath: '/path/to/logs',
      sessions: [],
    };
    
    expect(schema.serverPort).toBe(4020);
    expect(schema.serverMode).toBe('rust');
  });

  it('should handle union types correctly', () => {
    const accessMode: StoreSchema['accessMode'] = 'network';
    expect(['localhost', 'network', 'ngrok', 'tailscale']).toContain(accessMode);
    
    const serverMode: StoreSchema['serverMode'] = 'rust';
    expect(serverMode).toBe('rust');
    
    const updateChannel: StoreSchema['updateChannel'] = 'stable';
    expect(['stable', 'beta', 'alpha']).toContain(updateChannel);
  });
});