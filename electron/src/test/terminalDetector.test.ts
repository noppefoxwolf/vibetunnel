import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAvailableTerminals, openTerminal } from '../main/terminalDetector';
import type { Terminal } from '../main/terminalDetector';

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => {
    // Mock some terminals as existing
    if (path.includes('Terminal.app')) return true;
    if (path.includes('iTerm.app')) return false;
    if (path.includes('cmd.exe')) return true;
    if (path.includes('powershell.exe')) return true;
    return false;
  }),
}));

// Mock child_process
const mockExec = vi.fn((cmd: string, options: any, callback?: any) => {
  // Handle callback-style exec
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (callback) {
    // Simulate successful execution
    callback(null, '', '');
  }
});

vi.mock('child_process', () => ({
  exec: mockExec,
}));

// Mock os
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user'),
  networkInterfaces: vi.fn(() => ({})),
}));

describe('Terminal Detector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.platform
    Object.defineProperty(process, 'platform', {
      value: process.platform,
      writable: true,
    });
  });

  describe('getAvailableTerminals', () => {
    it('should return array of terminals', () => {
      const terminals = getAvailableTerminals();
      expect(Array.isArray(terminals)).toBe(true);
    });

    it('should detect terminals on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      const terminals = getAvailableTerminals();
      
      // Should find Terminal.app since we mocked it as existing
      const terminal = terminals.find(t => t.name === 'Terminal');
      expect(terminal).toBeDefined();
      expect(terminal?.available).toBe(true);
      expect(terminal?.command).toBe('open -a Terminal');
    });

    it('should detect terminals on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      const terminals = getAvailableTerminals();
      
      // Should always have Command Prompt and PowerShell
      const cmd = terminals.find(t => t.name === 'Command Prompt');
      const ps = terminals.find(t => t.name === 'Windows PowerShell');
      
      expect(cmd).toBeDefined();
      expect(ps).toBeDefined();
    });

    it('should detect terminals on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      const terminals = getAvailableTerminals();
      expect(Array.isArray(terminals)).toBe(true);
      // Linux detection is async, so we just check it returns an array
    });

    it('should return empty array for unknown platform', () => {
      Object.defineProperty(process, 'platform', { value: 'unknown' });
      
      const terminals = getAvailableTerminals();
      expect(terminals).toEqual([]);
    });
  });

  describe('openTerminal', () => {
    beforeEach(() => {
      mockExec.mockClear();
    });

    it('should call exec for macOS', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      await openTerminal('Terminal', { sessionId: 'test-session' });
      
      expect(mockExec).toHaveBeenCalled();
      const call = mockExec.mock.calls[0];
      expect(call[0]).toContain('osascript');
      expect(call[0]).toContain('test-session');
    });

    it('should call exec for Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      await openTerminal('cmd.exe', { sessionId: 'test-session' });
      
      expect(mockExec).toHaveBeenCalled();
    });

    it('should call exec for Linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      await openTerminal('gnome-terminal', { sessionId: 'test-session' });
      
      expect(mockExec).toHaveBeenCalled();
      const call = mockExec.mock.calls[0];
      expect(call[0]).toContain('gnome-terminal');
    });

    it('should handle options correctly', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      
      await openTerminal('Terminal', {
        cwd: '/test/directory',
        sessionId: 'my-session',
      });
      
      expect(mockExec).toHaveBeenCalled();
      const call = mockExec.mock.calls[0];
      expect(call[0]).toContain('/test/directory');
      expect(call[0]).toContain('my-session');
    });
  });
});