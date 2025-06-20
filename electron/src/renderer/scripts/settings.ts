/// <reference path="../../types/electron.d.ts" />

// Settings - TypeScript version with proper type safety
console.log('Settings script starting (TypeScript version)...');

interface Settings {
  serverPort?: number;
  launchAtLogin?: boolean;
  showDockIcon?: boolean;
  serverMode?: 'rust' | 'go';
  accessMode?: 'localhost' | 'network' | 'ngrok';
  dashboardPassword?: string;
  ngrokAuthToken?: string;
  autoCleanupOnQuit?: boolean;
  debugMode?: boolean;
  updateChannel?: 'stable' | 'beta';
  dashboardPort?: number;
  logLevel?: string;
  recordingsPath?: string;
  terminalApp?: string;
  defaultShell?: string;
  sessionTimeout?: number;
  enableTelemetry?: boolean;
  customCSS?: string;
  [key: string]: any;
}

let settings: Settings = {};

// Initialize
export async function initialize(): Promise<void> {
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
export async function loadSettings(): Promise<void> {
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
export function applySettingsToUI(): void {
  // Type-safe element access
  const serverPort = getElementById<HTMLInputElement>('serverPort');
  if (serverPort) serverPort.value = String(settings.serverPort || 4020);
  
  const launchAtLogin = getElementById<HTMLInputElement>('launchAtLogin');
  if (launchAtLogin) launchAtLogin.checked = settings.launchAtLogin || false;
  
  const showDockIcon = getElementById<HTMLInputElement>('showDockIcon');
  if (showDockIcon) showDockIcon.checked = settings.showDockIcon || false;
  
  const serverMode = getElementById<HTMLSelectElement>('serverMode');
  if (serverMode) serverMode.value = settings.serverMode || 'rust';
  
  const accessMode = getElementById<HTMLSelectElement>('accessMode');
  if (accessMode) accessMode.value = settings.accessMode || 'localhost';
  
  const dashboardPassword = getElementById<HTMLInputElement>('dashboardPassword');
  if (dashboardPassword) dashboardPassword.value = settings.dashboardPassword || '';
  
  const ngrokAuthToken = getElementById<HTMLInputElement>('ngrokAuthToken');
  if (ngrokAuthToken) ngrokAuthToken.value = settings.ngrokAuthToken || '';
  
  const autoCleanupOnQuit = getElementById<HTMLInputElement>('autoCleanupOnQuit');
  if (autoCleanupOnQuit) autoCleanupOnQuit.checked = settings.autoCleanupOnQuit !== false;
  
  const debugMode = getElementById<HTMLInputElement>('debugMode');
  if (debugMode) debugMode.checked = settings.debugMode || false;
  
  const updateChannel = getElementById<HTMLSelectElement>('updateChannel');
  if (updateChannel) updateChannel.value = settings.updateChannel || 'stable';
  
  const dashboardPort = getElementById<HTMLInputElement>('dashboardPort');
  if (dashboardPort) dashboardPort.value = String(settings.dashboardPort || 4020);
  
  const logLevel = getElementById<HTMLSelectElement>('logLevel');
  if (logLevel) logLevel.value = settings.logLevel || 'info';
  
  const recordingsPath = getElementById<HTMLInputElement>('recordingsPath');
  if (recordingsPath) recordingsPath.value = settings.recordingsPath || '';
  
  const terminalApp = getElementById<HTMLSelectElement>('terminalApp');
  if (terminalApp) terminalApp.value = settings.terminalApp || '';
  
  const defaultShell = getElementById<HTMLSelectElement>('defaultShell');
  if (defaultShell) defaultShell.value = settings.defaultShell || '';
  
  const sessionTimeout = getElementById<HTMLInputElement>('sessionTimeout');
  if (sessionTimeout) sessionTimeout.value = String(settings.sessionTimeout || 0);
  
  const enableTelemetry = getElementById<HTMLInputElement>('enableTelemetry');
  if (enableTelemetry) enableTelemetry.checked = settings.enableTelemetry !== false;
  
  const customCSS = getElementById<HTMLTextAreaElement>('customCSS');
  if (customCSS) customCSS.value = settings.customCSS || '';
}

// Tab navigation
export function setupTabNavigation(): void {
  console.log('Setting up tab navigation...');
  
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      if (!tabName) return;
      
      console.log('Switching to tab:', tabName);
      
      // Update active states
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      tab.classList.add('active');
      const targetContent = document.getElementById(tabName);
      if (targetContent) {
        targetContent.classList.add('active');
      }
      
      // Load dynamic content for specific tabs
      if (tabName === 'about') {
        loadAboutInfo();
      }
    });
  });
  
  // Handle tab switching from main process
  window.electronAPI.switchTab((tabName: string) => {
    console.log('Switching tab from main process:', tabName);
    const targetTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetTab) {
      (targetTab as HTMLElement).click();
    }
  });
}

// Setup all handlers
function setupAllHandlers(): void {
  console.log('Setting up handlers...');
  
  // Window controls
  setupWindowControls();
  
  // Settings change handlers
  setupSettingsHandlers();
  
  // Button handlers
  setupButtonHandlers();
  
  // Listen for settings changes from main process
  window.electronAPI.onSettingChanged((key: string, value: any) => {
    console.log('Setting changed from main process:', key, value);
    settings[key] = value;
    applySettingsToUI();
  });
}

// Window controls
function setupWindowControls(): void {
  const closeBtn = getElementById('closeBtn');
  const minimizeBtn = getElementById('minimizeBtn');
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
  }
  
  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
  }
}

// Settings handlers
function setupSettingsHandlers(): void {
  // Simple toggles
  const toggleSettings = ['launchAtLogin', 'showDockIcon', 'autoCleanupOnQuit', 'debugMode', 'enableTelemetry'];
  
  toggleSettings.forEach(settingName => {
    const element = getElementById<HTMLInputElement>(settingName);
    if (element) {
      element.addEventListener('change', async () => {
        try {
          const value = element.checked;
          console.log(`Setting ${settingName} to ${value}`);
          await window.electronAPI.setSetting(settingName, value);
          settings[settingName] = value;
        } catch (error) {
          console.error(`Failed to update ${settingName}:`, error);
          element.checked = !element.checked; // Revert on error
        }
      });
    }
  });
  
  // Select dropdowns
  const selectSettings = ['serverMode', 'accessMode', 'updateChannel', 'logLevel', 'terminalApp', 'defaultShell'];
  
  selectSettings.forEach(settingName => {
    const element = getElementById<HTMLSelectElement>(settingName);
    if (element) {
      element.addEventListener('change', async () => {
        try {
          const value = element.value;
          console.log(`Setting ${settingName} to ${value}`);
          await window.electronAPI.setSetting(settingName, value);
          settings[settingName] = value;
        } catch (error) {
          console.error(`Failed to update ${settingName}:`, error);
        }
      });
    }
  });
  
  // Number inputs
  const numberSettings = ['serverPort', 'dashboardPort', 'sessionTimeout'];
  
  numberSettings.forEach(settingName => {
    const element = getElementById<HTMLInputElement>(settingName);
    if (element) {
      element.addEventListener('change', async () => {
        try {
          const value = parseInt(element.value, 10);
          if (!isNaN(value)) {
            console.log(`Setting ${settingName} to ${value}`);
            await window.electronAPI.setSetting(settingName, value);
            settings[settingName] = value;
          }
        } catch (error) {
          console.error(`Failed to update ${settingName}:`, error);
        }
      });
    }
  });
  
  // Text inputs
  const textSettings = ['dashboardPassword', 'ngrokAuthToken', 'recordingsPath'];
  
  textSettings.forEach(settingName => {
    const element = getElementById<HTMLInputElement>(settingName);
    if (element) {
      element.addEventListener('change', async () => {
        try {
          const value = element.value;
          console.log(`Setting ${settingName}`);
          await window.electronAPI.setSetting(settingName, value);
          settings[settingName] = value;
        } catch (error) {
          console.error(`Failed to update ${settingName}:`, error);
        }
      });
    }
  });
  
  // Custom CSS textarea
  const customCSS = getElementById<HTMLTextAreaElement>('customCSS');
  if (customCSS) {
    customCSS.addEventListener('change', async () => {
      try {
        const value = customCSS.value;
        await window.electronAPI.setSetting('customCSS', value);
        settings.customCSS = value;
      } catch (error) {
        console.error('Failed to update custom CSS:', error);
      }
    });
  }
}

// Button handlers
function setupButtonHandlers(): void {
  
  // Helper buttons
  const installCliBtn = getElementById('installCliBtn');
  if (installCliBtn) {
    installCliBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.installCLI();
        alert('CLI installed successfully!');
      } catch (error) {
        alert(`Failed to install CLI: ${error}`);
      }
    });
  }
  
  const openLogBtn = getElementById('openLogBtn');
  if (openLogBtn) {
    openLogBtn.addEventListener('click', () => {
      window.electronAPI.openLogFile();
    });
  }
  
  const browseRecordingsBtn = getElementById('browseRecordingsBtn');
  if (browseRecordingsBtn) {
    browseRecordingsBtn.addEventListener('click', () => {
      window.electronAPI.openRecordingsFolder();
    });
  }
  
  const openRecordingsBtn = getElementById('openRecordingsBtn');
  if (openRecordingsBtn) {
    openRecordingsBtn.addEventListener('click', () => {
      window.electronAPI.openRecordingsFolder();
    });
  }
  
  const checkUpdatesBtn = getElementById('checkUpdatesBtn');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => {
      window.electronAPI.checkForUpdates();
    });
  }
  
  const openConsoleBtn = getElementById('openConsoleBtn');
  if (openConsoleBtn) {
    openConsoleBtn.addEventListener('click', () => {
      window.electronAPI.openConsoleWindow();
    });
  }
  
  const openDevToolsBtn = getElementById('openDevToolsBtn');
  if (openDevToolsBtn) {
    openDevToolsBtn.addEventListener('click', () => {
      window.electronAPI.openDevTools();
    });
  }
  
  const openUserDataBtn = getElementById('openUserDataBtn');
  if (openUserDataBtn) {
    openUserDataBtn.addEventListener('click', () => {
      window.electronAPI.openUserDataFolder();
    });
  }
  
  const resetSettingsBtn = getElementById('resetSettingsBtn');
  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all settings? The app will restart.')) {
        window.electronAPI.resetAllSettings();
      }
    });
  }
  
  // External links
  const websiteLink = getElementById('websiteLink');
  if (websiteLink) {
    websiteLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.electronAPI.openExternal('https://vibetunnel.com');
    });
  }
  
  const githubLink = getElementById('githubLink');
  if (githubLink) {
    githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.electronAPI.openExternal('https://github.com/vibetunnel/vibetunnel');
    });
  }
}

// Load about info
async function loadAboutInfo(): Promise<void> {
  try {
    const info = await window.electronAPI.getSystemInfo();
    
    const version = getElementById('version');
    if (version) version.textContent = info.version;
    
    const platform = getElementById('platform');
    if (platform) platform.textContent = `${info.platform} (${info.arch})`;
    
    const electronVersion = getElementById('electronVersion');
    if (electronVersion) electronVersion.textContent = info.electron;
    
    const nodeVersion = getElementById('nodeVersion');
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