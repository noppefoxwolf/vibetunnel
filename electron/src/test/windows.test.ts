import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { BrowserWindow } from 'electron';
import { createSettingsWindow, createWelcomeWindow, createConsoleWindow, getWindows, closeAllWindows } from '../main/windows';

// Mock BrowserWindow instances
const mockWindows = new Map();

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: vi.fn().mockImplementation(function(options) {
    const window = {
      id: Date.now(),
      loadFile: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      webContents: {
        send: vi.fn(),
        openDevTools: vi.fn(),
        on: vi.fn(),
      },
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
    };
    
    // Store for retrieval
    mockWindows.set(window.id, window);
    
    // Handle event listeners
    window.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'closed') {
        // Store the handler for testing
        window._closedHandler = handler;
      }
    });
    
    window.webContents.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'did-finish-load') {
        // Store the handler for testing
        window._didFinishLoadHandler = handler;
      }
    });
    
    return window;
  }),
}));

// Mock path
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
}));

describe('Windows Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset windows state
    const windows = getWindows();
    windows.settingsWindow = null;
    windows.welcomeWindow = null;
    windows.consoleWindow = null;
  });

  describe('createSettingsWindow', () => {
    it('should create settings window', () => {
      const window = createSettingsWindow();
      
      expect(window).toBeDefined();
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 700,
          height: 600,
          title: 'VibeTunnel Preferences',
          resizable: true,
        })
      );
      expect(window.loadFile).toHaveBeenCalled();
      expect(window.webContents.openDevTools).toHaveBeenCalled();
    });

    it('should focus existing window if already open', () => {
      const firstWindow = createSettingsWindow();
      const secondWindow = createSettingsWindow();
      
      expect(secondWindow).toBe(firstWindow);
      expect(firstWindow.focus).toHaveBeenCalled();
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    it('should send initial tab when specified', () => {
      const window = createSettingsWindow('about');
      
      // Check that event listener was registered
      expect(window.webContents.on).toHaveBeenCalledWith('did-finish-load', expect.any(Function));
      
      // Simulate did-finish-load event
      if ((window as any)._didFinishLoadHandler) {
        (window as any)._didFinishLoadHandler();
        expect(window.webContents.send).toHaveBeenCalledWith('switch-tab', 'about');
      }
    });

    it('should clear reference on window close', () => {
      const window = createSettingsWindow();
      
      // Check that event listener was registered
      expect(window.on).toHaveBeenCalledWith('closed', expect.any(Function));
      
      // Simulate close event
      if ((window as any)._closedHandler) {
        (window as any)._closedHandler();
        expect(getWindows().settingsWindow).toBeNull();
      }
    });
  });

  describe('createWelcomeWindow', () => {
    it('should create welcome window', () => {
      const window = createWelcomeWindow();
      
      expect(window).toBeDefined();
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 800,
          height: 600,
          title: 'Welcome to VibeTunnel',
          resizable: true,
        })
      );
      expect(window.loadFile).toHaveBeenCalled();
      expect(window.webContents.openDevTools).toHaveBeenCalled();
    });

    it('should focus existing window if already open', () => {
      const firstWindow = createWelcomeWindow();
      const secondWindow = createWelcomeWindow();
      
      expect(secondWindow).toBe(firstWindow);
      expect(firstWindow.focus).toHaveBeenCalled();
    });
  });

  describe('createConsoleWindow', () => {
    it('should create console window', () => {
      const window = createConsoleWindow();
      
      expect(window).toBeDefined();
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 800,
          height: 600,
          title: 'VibeTunnel Console',
          resizable: true,
        })
      );
      expect(window.loadFile).toHaveBeenCalled();
      expect(window.webContents.openDevTools).toHaveBeenCalled();
    });
  });

  describe('getWindows', () => {
    it('should return window manager object', () => {
      const windows = getWindows();
      
      expect(windows).toHaveProperty('settingsWindow');
      expect(windows).toHaveProperty('welcomeWindow');
      expect(windows).toHaveProperty('consoleWindow');
    });

    it('should return same instance', () => {
      const windows1 = getWindows();
      const windows2 = getWindows();
      
      expect(windows1).toBe(windows2);
    });
  });

  describe('closeAllWindows', () => {
    it('should close all open windows', () => {
      const settingsWindow = createSettingsWindow();
      const welcomeWindow = createWelcomeWindow();
      const consoleWindow = createConsoleWindow();
      
      closeAllWindows();
      
      expect(settingsWindow.close).toHaveBeenCalled();
      expect(welcomeWindow.close).toHaveBeenCalled();
      expect(consoleWindow.close).toHaveBeenCalled();
    });

    it('should handle destroyed windows gracefully', () => {
      const window = createSettingsWindow();
      window.isDestroyed.mockReturnValue(true);
      
      // Should not throw
      closeAllWindows();
      
      expect(window.close).not.toHaveBeenCalled();
    });
  });
});