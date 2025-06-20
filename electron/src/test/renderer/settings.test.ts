import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock the window.electronAPI
const mockElectronAPI = {
  getSettings: vi.fn(),
  setSetting: vi.fn(),
  getSystemInfo: vi.fn(),
  openExternal: vi.fn(),
  onSettingChanged: vi.fn(),
  onServerStatusChanged: vi.fn(),
  switchTab: vi.fn()
};

describe('Settings Renderer', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    // Create a basic DOM structure
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <div class="tabs">
          <li class="tab active" data-tab="general">General</li>
          <li class="tab" data-tab="dashboard">Dashboard</li>
        </div>
        <div class="tab-content active" id="general">
          <input type="checkbox" id="launchAtLogin">
          <input type="checkbox" id="showDockIcon">
          <input type="number" id="serverPort" value="4020">
        </div>
        <div class="tab-content" id="dashboard"></div>
      </body>
      </html>
    `, {
      url: 'http://localhost',
      runScripts: 'dangerously'
    });

    document = dom.window.document;
    window = dom.window as any;
    
    // Set up the mock electronAPI
    (window as any).electronAPI = mockElectronAPI;
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  it('should load settings on initialization', async () => {
    const mockSettings = {
      launchAtLogin: true,
      showDockIcon: false,
      serverPort: 4020
    };
    
    mockElectronAPI.getSettings.mockResolvedValue(mockSettings);
    
    // Import and run the settings module
    const settingsModule = await import('../../renderer/scripts/settings');
    await settingsModule.initialize();
    
    expect(mockElectronAPI.getSettings).toHaveBeenCalled();
  });

  it('should apply settings to UI elements', async () => {
    const mockSettings = {
      launchAtLogin: true,
      showDockIcon: false,
      serverPort: 5000
    };
    
    mockElectronAPI.getSettings.mockResolvedValue(mockSettings);
    
    const settingsModule = await import('../../renderer/scripts/settings');
    await settingsModule.loadSettings();
    settingsModule.applySettingsToUI();
    
    const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement;
    const showDockIcon = document.getElementById('showDockIcon') as HTMLInputElement;
    const serverPort = document.getElementById('serverPort') as HTMLInputElement;
    
    expect(launchAtLogin.checked).toBe(true);
    expect(showDockIcon.checked).toBe(false);
    expect(serverPort.value).toBe('5000');
  });

  it('should handle tab navigation', async () => {
    const settingsModule = await import('../../renderer/scripts/settings');
    settingsModule.setupTabNavigation();
    
    const dashboardTab = document.querySelector('[data-tab="dashboard"]') as HTMLElement;
    dashboardTab.click();
    
    const generalContent = document.getElementById('general');
    const dashboardContent = document.getElementById('dashboard');
    
    expect(generalContent?.classList.contains('active')).toBe(false);
    expect(dashboardContent?.classList.contains('active')).toBe(true);
  });

  it('should handle settings changes', async () => {
    mockElectronAPI.setSetting.mockResolvedValue(true);
    mockElectronAPI.getSettings.mockResolvedValue({ launchAtLogin: false });
    
    const settingsModule = await import('../../renderer/scripts/settings');
    await settingsModule.initialize();
    
    const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement;
    launchAtLogin.checked = true;
    launchAtLogin.dispatchEvent(new Event('change'));
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(mockElectronAPI.setSetting).toHaveBeenCalledWith('launchAtLogin', true);
  });

  it('should handle errors gracefully', async () => {
    mockElectronAPI.getSettings.mockRejectedValue(new Error('Failed to load settings'));
    
    const consoleError = vi.spyOn(console, 'error');
    
    const settingsModule = await import('../../renderer/scripts/settings');
    await settingsModule.initialize();
    
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize settings'));
  });
});