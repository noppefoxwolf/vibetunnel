import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import { VibeTunnelServerManager } from '../main/serverManager';

// Mock child_process
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((type: string) => {
      if (type === 'userData') return '/mock/userData';
      return '/mock/path';
    }),
    getAppPath: vi.fn(() => '/mock/app'),
  },
}));

describe('ServerManager', () => {
  let serverManager: VibeTunnelServerManager;
  let mockChildProcess: Partial<ChildProcess>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock child process
    mockChildProcess = {
      stdout: new EventEmitter() as any,
      stderr: new EventEmitter() as any,
      on: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
    };

    mockSpawn.mockReturnValue(mockChildProcess);

    serverManager = new VibeTunnelServerManager(4020, 'rust');
  });

  it('should create server manager instance', () => {
    expect(serverManager).toBeDefined();
    expect(serverManager).toBeInstanceOf(EventEmitter);
  });

  it('should have correct initial status', () => {
    const status = serverManager.getStatus();
    expect(status).toEqual({
      running: false,
      port: 4020,
      pid: undefined,
      startTime: undefined,
      sessions: 0,
    });
  });

  it('should return empty sessions array when not running', () => {
    const sessions = serverManager.getSessions();
    expect(sessions).toEqual([]);
  });

  it('should handle start() method', async () => {
    const axios = require('axios').default;
    axios.get.mockResolvedValueOnce({ status: 200 });

    const startPromise = serverManager.start();
    
    // Server should attempt to start
    expect(mockSpawn).toHaveBeenCalled();
    
    // Simulate server ready
    await startPromise;
    
    const status = serverManager.getStatus();
    expect(status.running).toBe(true);
    expect(status.pid).toBe(12345);
  });

  it('should handle stop() method', async () => {
    // First start the server
    const axios = require('axios').default;
    axios.get.mockResolvedValueOnce({ status: 200 });
    await serverManager.start();

    // Then stop it
    await serverManager.stop();
    
    expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    
    const status = serverManager.getStatus();
    expect(status.running).toBe(false);
  });

  it('should handle cleanup() method', async () => {
    await serverManager.cleanup();
    // Should not throw
    expect(true).toBe(true);
  });

  it('should throw error when creating session without server running', async () => {
    await expect(serverManager.createSession({ name: 'test' })).rejects.toThrow('Server is not running');
  });

  it('should emit events', () => {
    const statusHandler = vi.fn();
    const sessionsHandler = vi.fn();
    
    serverManager.on('status-changed', statusHandler);
    serverManager.on('sessions-changed', sessionsHandler);
    
    // Should be able to emit without errors
    serverManager.emit('status-changed', serverManager.getStatus());
    serverManager.emit('sessions-changed', []);
    
    expect(statusHandler).toHaveBeenCalled();
    expect(sessionsHandler).toHaveBeenCalled();
  });
});