/// <reference path="../../types/electron.d.ts" />

// Settings - TypeScript version with proper type safety
console.log('Settings script starting (TypeScript version)...');

interface Settings {
  serverPort?: number;
  launchAtLogin?: boolean;
  showDockIcon?: boolean;
  autoCleanupOnQuit?: boolean;
  dashboardPassword?: string;
  accessMode?: 'localhost' | 'network' | 'ngrok';
  terminalApp?: string;
  cleanupOnStartup?: boolean;
  serverMode?: 'rust' | 'go';
  updateChannel?: 'stable' | 'beta';
  debugMode?: boolean;
  [key: string]: any; // Allow dynamic properties
}

let settings: Settings = {};

// Initialize
async function initialize(): Promise<void> {
  console.log('Initializing settings...');
  
  if (!window.electronAPI) {
    console.error('electronAPI not available!');
    alert('Settings cannot load: electronAPI not available');
    return;
  }
  
  try {
    await loadSettings();
    applySettingsToUI();
    setupTabNavigation();
    setupAllHandlers();
  } catch (error) {
    console.error('Failed to initialize settings:', error);
  }
}

// Load settings
async function loadSettings(): Promise<void> {
  try {
    settings = await window.electronAPI.getSettings();
    console.log('Settings loaded:', settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    settings = {};
  }
}

// Helper function to safely get element by ID with type
function getElementById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// Apply settings to UI
function applySettingsToUI(): void {
  // Type-safe element access
  const serverPort = getElementById<HTMLInputElement>('serverPort');
  if (serverPort) serverPort.value = String(settings.serverPort || 4020);
  
  const launchAtLogin = getElementById<HTMLInputElement>('launchAtLogin');
  if (launchAtLogin) launchAtLogin.checked = settings.launchAtLogin === true;
  
  const showDockIcon = getElementById<HTMLInputElement>('showDockIcon');
  if (showDockIcon) showDockIcon.checked = settings.showDockIcon === true;
  
  const autoCleanupOnQuit = getElementById<HTMLInputElement>('autoCleanupOnQuit');
  if (autoCleanupOnQuit) autoCleanupOnQuit.checked = settings.autoCleanupOnQuit !== false;
  
  const passwordProtect = getElementById<HTMLInputElement>('passwordProtect');
  if (passwordProtect) passwordProtect.checked = !!settings.dashboardPassword;
  
  const dashboardPort = getElementById<HTMLInputElement>('dashboardPort');
  if (dashboardPort) dashboardPort.value = String(settings.serverPort || 4020);
  
  const accessMode = getElementById<HTMLSelectElement>('accessMode');
  if (accessMode) accessMode.value = settings.accessMode || 'localhost';
  
  const terminalApp = getElementById<HTMLSelectElement>('terminalApp');
  if (terminalApp) terminalApp.value = settings.terminalApp || 'default';
  
  const cleanupOnStartup = getElementById<HTMLInputElement>('cleanupOnStartup');
  if (cleanupOnStartup) cleanupOnStartup.checked = settings.cleanupOnStartup !== false;
  
  const serverMode = getElementById<HTMLSelectElement>('serverMode');
  if (serverMode) serverMode.value = settings.serverMode || 'rust';
  
  const updateChannel = getElementById<HTMLSelectElement>('updateChannel');
  if (updateChannel) updateChannel.value = settings.updateChannel || 'stable';
  
  const debugMode = getElementById<HTMLInputElement>('debugMode');
  if (debugMode) debugMode.checked = settings.debugMode === true;
  
  loadSystemInfo();
}

// Tab navigation
function setupTabNavigation(): void {
  console.log('Setting up tab navigation...');
  
  const tabs = document.querySelectorAll<HTMLElement>('.tab');
  console.log(`Found ${tabs.length} tabs`);
  
  tabs.forEach(tab => {
    const tabId = tab.getAttribute('data-tab');
    if (!tabId) return;
    
    tab.addEventListener('click', function(this: HTMLElement, e: Event) {
      e.stopPropagation();
      console.log(`Tab clicked: ${tabId}`);
      
      // Remove active from all
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active to clicked
      this.classList.add('active');
      const content = getElementById(tabId);
      if (content) {
        content.classList.add('active');
      }
    });
  });
  
  // Listen for external tab switches
  if (window.electronAPI?.on) {
    window.electronAPI.on('switch-tab', (tabName: string) => {
      const tab = document.querySelector<HTMLElement>(`.tab[data-tab="${tabName}"]`);
      if (tab) tab.click();
    });
  }
}

// Setup all event handlers
function setupAllHandlers(): void {
  console.log('Setting up all handlers...');
  setupButtonHandlers();
  setupSettingHandlers();
}

// Button handlers
function setupButtonHandlers(): void {
  console.log('Setting up button handlers...');
  
  // Test Terminal button
  const testTerminalBtn = getElementById<HTMLButtonElement>('testTerminalBtn');
  if (testTerminalBtn) {
    testTerminalBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log('Test Terminal clicked');
      const terminalApp = getElementById<HTMLSelectElement>('terminalApp')?.value || 'default';
      try {
        await window.electronAPI.openTerminal('echo "VibeTunnel terminal test successful!"', {
          terminal: terminalApp
        });
      } catch (error) {
        alert(`Failed to open terminal: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }
  
  // Install CLI button
  const installCLIBtn = getElementById<HTMLButtonElement>('installCLIBtn');
  if (installCLIBtn) {
    installCLIBtn.addEventListener('click', async function(this: HTMLButtonElement, e) {
      e.preventDefault();
      console.log('Install CLI clicked');
      this.disabled = true;
      this.textContent = 'Installing...';
      
      try {
        await window.electronAPI.installCLI();
        alert('CLI tool installed successfully!');
        this.textContent = 'Reinstall CLI Tool';
      } catch (error) {
        alert(`Failed to install CLI: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.textContent = 'Install CLI Tool';
      } finally {
        this.disabled = false;
      }
    });
  }
  
  // Other buttons follow similar pattern...
}

// Setting change handlers
function setupSettingHandlers(): void {
  console.log('Setting up setting handlers...');
  
  // Server port
  const serverPort = getElementById<HTMLInputElement>('serverPort');
  if (serverPort) {
    serverPort.addEventListener('change', async (e) => {
      const target = e.target as HTMLInputElement;
      const port = parseInt(target.value);
      if (isNaN(port) || port < 1024 || port > 65535) {
        alert('Port must be between 1024 and 65535');
        target.value = String(settings.serverPort || 4020);
        return;
      }
      await window.electronAPI.setSetting('serverPort', port);
      settings.serverPort = port;
    });
  }
  
  // Checkboxes
  const checkboxIds: string[] = [
    'launchAtLogin', 'showDockIcon', 'autoCleanupOnQuit',
    'cleanupOnStartup', 'debugMode'
  ];
  
  checkboxIds.forEach(id => {
    const element = getElementById<HTMLInputElement>(id);
    if (element) {
      element.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        try {
          await window.electronAPI.setSetting(String(id), target.checked);
          settings[id] = target.checked;
        } catch (error) {
          console.error(`Failed to update ${String(id)}:`, error);
          target.checked = !target.checked;
          alert(`Failed to update ${String(id)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
    }
  });
  
  // Select elements
  const selectIds: string[] = [
    'accessMode', 'terminalApp', 'serverMode', 'updateChannel'
  ];
  
  selectIds.forEach(id => {
    const element = getElementById<HTMLSelectElement>(id);
    if (element) {
      element.addEventListener('change', async (e) => {
        const target = e.target as HTMLSelectElement;
        try {
          await window.electronAPI.setSetting(String(id), target.value);
          settings[id] = target.value;
        } catch (error) {
          console.error(`Failed to update ${String(id)}:`, error);
          // Revert to previous value
          target.value = settings[id] || '';
          alert(`Failed to update ${String(id)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
    }
  });
}

// Load system info
async function loadSystemInfo(): Promise<void> {
  try {
    const info = await window.electronAPI.getSystemInfo();
    
    const appVersion = getElementById<HTMLElement>('appVersion');
    if (appVersion) appVersion.textContent = info.version;
    
    const platform = getElementById<HTMLElement>('platform');
    if (platform) platform.textContent = `${info.platform} (${info.arch})`;
    
    const electronVersion = getElementById<HTMLElement>('electronVersion');
    if (electronVersion) electronVersion.textContent = info.electron;
    
    const nodeVersion = getElementById<HTMLElement>('nodeVersion');
    if (nodeVersion) nodeVersion.textContent = info.node;
  } catch (error) {
    console.error('Failed to load system info:', error);
  }
}

// Start initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// Export for testing
export { initialize, loadSettings, applySettingsToUI, setupTabNavigation };