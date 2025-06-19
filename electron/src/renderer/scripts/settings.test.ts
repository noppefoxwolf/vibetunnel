import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock ElectronAPI
const mockElectronAPI: Partial<ElectronAPI> = {
  getSettings: vi.fn(),
  setSetting: vi.fn(),
  getSystemInfo: vi.fn(),
  on: vi.fn(),
  openTerminal: vi.fn(),
  installCLI: vi.fn(),
  openLogFile: vi.fn(),
  openRecordingsFolder: vi.fn(),
  checkForUpdates: vi.fn(),
  openExternal: vi.fn()
};

describe('Settings Script', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window & typeof globalThis;

  beforeEach(() => {
    // Setup DOM
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div class="tab active" data-tab="general">General</div>
          <div class="tab" data-tab="dashboard">Dashboard</div>
          <div class="tab" data-tab="advanced">Advanced</div>
          <div class="tab" data-tab="about">About</div>
          
          <div id="general" class="tab-content active"></div>
          <div id="dashboard" class="tab-content"></div>
          <div id="advanced" class="tab-content"></div>
          <div id="about" class="tab-content"></div>
          
          <input id="serverPort" type="number" />
          <input id="launchAtLogin" type="checkbox" />
          <input id="showDockIcon" type="checkbox" />
          <input id="autoCleanupOnQuit" type="checkbox" />
          <input id="passwordProtect" type="checkbox" />
          <input id="dashboardPort" type="number" />
          <select id="accessMode">
            <option value="localhost">Localhost</option>
            <option value="network">Network</option>
          </select>
          <select id="terminalApp">
            <option value="default">Default</option>
          </select>
          <input id="cleanupOnStartup" type="checkbox" />
          <select id="serverMode">
            <option value="rust">Rust</option>
            <option value="node">Node</option>
          </select>
          <select id="updateChannel">
            <option value="stable">Stable</option>
            <option value="beta">Beta</option>
          </select>
          <input id="debugMode" type="checkbox" />
          
          <button id="testTerminalBtn">Test Terminal</button>
          <button id="installCLIBtn">Install CLI</button>
          
          <span id="appVersion"></span>
          <span id="platform"></span>
          <span id="electronVersion"></span>
          <span id="nodeVersion"></span>
        </body>
      </html>
    `);
    
    document = dom.window.document;
    window = dom.window as any;
    
    // Add electronAPI to window
    (window as any).electronAPI = mockElectronAPI;
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should load settings on initialization', async () => {
      const mockSettings: Settings = {
        serverPort: 4020,
        launchAtLogin: true,
        showDockIcon: false
      };
      
      (mockElectronAPI.getSettings as Mock).mockResolvedValue(mockSettings);
      
      // Import and run initialization
      const { initialize } = await import('./settings');
      await initialize();
      
      expect(mockElectronAPI.getSettings).toHaveBeenCalled();
    });

    it('should handle missing electronAPI gracefully', async () => {
      // Remove electronAPI
      delete (window as any).electronAPI;
      
      const alertMock = vi.fn();
      window.alert = alertMock;
      
      const { initialize } = await import('./settings');
      await initialize();
      
      expect(alertMock).toHaveBeenCalledWith('Settings cannot load: electronAPI not available');
    });
  });

  describe('applySettingsToUI', () => {
    it('should apply settings to form elements', async () => {
      const mockSettings: Settings = {
        serverPort: 5000,
        launchAtLogin: true,
        showDockIcon: false,
        accessMode: 'network'
      };
      
      (mockElectronAPI.getSettings as Mock).mockResolvedValue(mockSettings);
      
      const { initialize } = await import('./settings');
      await initialize();
      
      // Check that values were applied
      const serverPort = document.getElementById('serverPort') as HTMLInputElement;
      expect(serverPort.value).toBe('5000');
      
      const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement;
      expect(launchAtLogin.checked).toBe(true);
      
      const showDockIcon = document.getElementById('showDockIcon') as HTMLInputElement;
      expect(showDockIcon.checked).toBe(false);
      
      const accessMode = document.getElementById('accessMode') as HTMLSelectElement;
      expect(accessMode.value).toBe('network');
    });
  });

  describe('tab navigation', () => {
    it('should switch tabs when clicked', async () => {
      (mockElectronAPI.getSettings as Mock).mockResolvedValue({});
      
      const { initialize } = await import('./settings');
      await initialize();
      
      // Click on dashboard tab
      const dashboardTab = document.querySelector('[data-tab="dashboard"]') as HTMLElement;
      dashboardTab.click();
      
      // Check active states
      expect(dashboardTab.classList.contains('active')).toBe(true);
      expect(document.getElementById('dashboard')?.classList.contains('active')).toBe(true);
      
      // Check that general tab is no longer active
      const generalTab = document.querySelector('[data-tab="general"]') as HTMLElement;
      expect(generalTab.classList.contains('active')).toBe(false);
      expect(document.getElementById('general')?.classList.contains('active')).toBe(false);
    });
  });

  describe('button handlers', () => {
    it('should call openTerminal when test terminal button is clicked', async () => {
      (mockElectronAPI.getSettings as Mock).mockResolvedValue({});
      
      const { initialize } = await import('./settings');
      await initialize();
      
      const testTerminalBtn = document.getElementById('testTerminalBtn') as HTMLButtonElement;
      testTerminalBtn.click();
      
      expect(mockElectronAPI.openTerminal).toHaveBeenCalledWith(
        'echo "VibeTunnel terminal test successful!"',
        { terminal: 'default' }
      );
    });

    it('should handle CLI installation', async () => {
      (mockElectronAPI.getSettings as Mock).mockResolvedValue({});
      (mockElectronAPI.installCLI as Mock).mockResolvedValue(undefined);
      
      const { initialize } = await import('./settings');
      await initialize();
      
      const installBtn = document.getElementById('installCLIBtn') as HTMLButtonElement;
      
      // Click install button
      installBtn.click();
      
      // Should disable button and change text
      expect(installBtn.disabled).toBe(true);
      expect(installBtn.textContent).toBe('Installing...');
      
      // Wait for promise to resolve
      await vi.waitFor(() => {
        expect(mockElectronAPI.installCLI).toHaveBeenCalled();
      });
    });
  });

  describe('setting handlers', () => {
    it('should validate port number', async () => {
      (mockElectronAPI.getSettings as Mock).mockResolvedValue({ serverPort: 4020 });
      
      const alertMock = vi.fn();
      window.alert = alertMock;
      
      const { initialize } = await import('./settings');
      await initialize();
      
      const serverPort = document.getElementById('serverPort') as HTMLInputElement;
      
      // Try invalid port
      serverPort.value = '500';
      serverPort.dispatchEvent(new Event('change'));
      
      expect(alertMock).toHaveBeenCalledWith('Port must be between 1024 and 65535');
      expect(serverPort.value).toBe('4020'); // Should revert
    });

    it('should save checkbox changes', async () => {
      (mockElectronAPI.getSettings as Mock).mockResolvedValue({});
      (mockElectronAPI.setSetting as Mock).mockResolvedValue(undefined);
      
      const { initialize } = await import('./settings');
      await initialize();
      
      const launchAtLogin = document.getElementById('launchAtLogin') as HTMLInputElement;
      launchAtLogin.checked = true;
      launchAtLogin.dispatchEvent(new Event('change'));
      
      expect(mockElectronAPI.setSetting).toHaveBeenCalledWith('launchAtLogin', true);
    });
  });
});