import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Store from 'electron-store';
import type { StoreSchema } from '../types/store';

// Mock electron app first
vi.mock('electron', () => ({
  app: {
    getName: () => 'vibetunnel',
    getVersion: () => '1.0.0',
  },
}));

// Mock electron-store
vi.mock('electron-store', () => {
  const storage = new Map<string, any>([
    ['serverPort', 4020],
    ['launchAtLogin', false],
    ['showDockIcon', true],
    ['serverMode', 'rust'],
    ['autoCleanupOnQuit', true],
    ['dashboardPassword', ''],
    ['accessMode', 'localhost'],
    ['terminalApp', 'default'],
    ['cleanupOnStartup', true],
    ['updateChannel', 'stable'],
    ['debugMode', false],
    ['firstRun', true],
    ['recordingsPath', ''],
    ['logPath', ''],
    ['sessions', []],
  ]);
  
  const mockStore = {
    get: vi.fn((key: string, defaultValue?: any) => {
      return storage.has(key) ? storage.get(key) : defaultValue;
    }),
    set: vi.fn((key: string, value: any) => {
      storage.set(key, value);
    }),
    has: vi.fn((key: string) => storage.has(key)),
    delete: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => {
      storage.clear();
      // Restore defaults
      storage.set('serverPort', 4020);
      storage.set('launchAtLogin', false);
      storage.set('showDockIcon', true);
      storage.set('serverMode', 'rust');
    }),
    store: {},
  };
  
  return {
    default: vi.fn(() => mockStore),
  };
});

describe('Store Module', () => {
  let store: Store<StoreSchema>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const storeModule = await import('../main/store');
    store = storeModule.default;
  });

  it('should create store instance without errors', () => {
    expect(store).toBeDefined();
  });

  it('should have default values', () => {
    expect(store.get('serverPort')).toBe(4020);
    expect(store.get('launchAtLogin')).toBe(false);
    expect(store.get('showDockIcon')).toBe(true);
    expect(store.get('serverMode')).toBe('rust');
  });

  it('should allow setting and getting values', () => {
    store.set('serverPort', 5000);
    expect(store.get('serverPort')).toBe(5000);

    store.set('debugMode', true);
    expect(store.get('debugMode')).toBe(true);
  });

  it('should handle has() method', () => {
    store.set('testKey' as any, 'testValue');
    expect(store.has('testKey' as any)).toBe(true);
    expect(store.has('nonExistentKey' as any)).toBe(false);
  });

  it('should handle clear() method', () => {
    store.set('serverPort', 6000);
    store.clear();
    expect(store.get('serverPort')).toBe(4020); // Should return default
  });
});