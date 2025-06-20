// Simple settings handler without LitElement
declare global {
  interface Window {
    __TAURI__: any;
  }
}

interface Settings {
  general: {
    launchAtLogin: boolean;
    showDockIcon: boolean;
    defaultTerminal: string;
    defaultShell: string;
  };
  dashboard: {
    serverPort: number;
    enablePassword: boolean;
    password: string;
    accessMode: 'localhost' | 'network' | 'ngrok';
    autoCleanup: boolean;
  };
  advanced: {
    serverMode: 'rust' | 'swift';
    debugMode: boolean;
    logLevel: string;
    sessionTimeout: number;
    ngrokAuthToken?: string;
  };
}

class SettingsManager {
  private settings: Settings = {
    general: {
      launchAtLogin: false,
      showDockIcon: true,
      defaultTerminal: 'system',
      defaultShell: 'default',
    },
    dashboard: {
      serverPort: 4020,
      enablePassword: false,
      password: '',
      accessMode: 'localhost',
      autoCleanup: true,
    },
    advanced: {
      serverMode: 'rust',
      debugMode: false,
      logLevel: 'info',
      sessionTimeout: 0,
      ngrokAuthToken: '',
    },
  };

  constructor() {
    this.init();
  }

  private async init() {
    // Load settings
    await this.loadSettings();

    // Setup UI
    this.setupTabs();
    this.setupToggles();
    this.setupInputs();
    this.bindEvents();
    
    // Ensure initial tab state is correct
    this.ensureInitialTabState();
  }

  private ensureInitialTabState() {
    // Make sure the first tab and its content are properly displayed
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      const targetTab = activeTab.getAttribute('data-tab');
      if (targetTab) {
        const targetContent = document.getElementById(targetTab);
        if (targetContent) {
          // Ensure it's visible
          targetContent.style.display = 'block';
          targetContent.classList.add('active');
        }
      }
    }
  }

  private async loadSettings() {
    if (window.__TAURI__) {
      try {
        const loaded = await window.__TAURI__.invoke('get_settings');
        if (loaded) {
          this.settings = loaded;
          this.updateUI();
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }
  }

  private async saveSettings() {
    if (window.__TAURI__) {
      try {
        await window.__TAURI__.invoke('save_settings', { settings: this.settings });
      } catch (error) {
        console.error('Failed to save settings:', error);
      }
    }
  }

  private isTabSwitching = false;
  private tabSwitchTimeout: NodeJS.Timeout | null = null;

  private setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Prevent rapid switching
        if (this.isTabSwitching) {
          return;
        }

        const targetTab = tab.getAttribute('data-tab');
        if (!targetTab) {
          return;
        }

        // Check if already active
        if (tab.classList.contains('active')) {
          return;
        }

        // Clear any pending timeout
        if (this.tabSwitchTimeout) {
          clearTimeout(this.tabSwitchTimeout);
        }

        this.isTabSwitching = true;

        // Update active states
        tabs.forEach((t) => t.classList.remove('active'));
        contents.forEach((c) => {
          c.classList.remove('active');
          // Force style recalculation to prevent animation issues
          c.style.display = 'none';
        });

        // Add active class to clicked tab
        tab.classList.add('active');

        // Switch content with a small delay to ensure DOM updates
        requestAnimationFrame(() => {
          const targetContent = document.getElementById(targetTab);
          if (targetContent) {
            targetContent.style.display = 'block';
            // Force reflow before adding active class
            void targetContent.offsetHeight;
            targetContent.classList.add('active');
          }

          // Reset tab switching flag after animation completes
          this.tabSwitchTimeout = setTimeout(() => {
            this.isTabSwitching = false;
          }, 300); // Match the animation duration
        });
      });
    });
  }

  private setupToggles() {
    // Setup all toggle switches
    const toggles = [
      {
        id: 'launchAtLogin',
        setting: () => this.settings.general.launchAtLogin,
        update: (v: boolean) => {
          this.settings.general.launchAtLogin = v;
        },
      },
      {
        id: 'showDockIcon',
        setting: () => this.settings.general.showDockIcon,
        update: (v: boolean) => {
          this.settings.general.showDockIcon = v;
        },
      },
      {
        id: 'enablePassword',
        setting: () => this.settings.dashboard.enablePassword,
        update: (v: boolean) => {
          this.settings.dashboard.enablePassword = v;
          this.togglePasswordField(v);
        },
      },
      {
        id: 'debugMode',
        setting: () => this.settings.advanced.debugMode,
        update: (v: boolean) => {
          this.settings.advanced.debugMode = v;
        },
      },
      {
        id: 'autoCleanup',
        setting: () => this.settings.dashboard.autoCleanup,
        update: (v: boolean) => {
          this.settings.dashboard.autoCleanup = v;
        },
      },
    ];

    toggles.forEach(({ id, setting, update }) => {
      const toggle = document.getElementById(id);
      if (toggle) {
        // Set initial state
        if (setting()) {
          toggle.classList.add('active');
        }

        // Add click handler
        toggle.addEventListener('click', () => {
          const isActive = toggle.classList.toggle('active');
          update(isActive);
          this.saveSettings();
        });
      }
    });
  }

  private setupInputs() {
    // Server port
    const serverPort = document.getElementById('serverPort') as HTMLInputElement;
    if (serverPort) {
      serverPort.value = this.settings.dashboard.serverPort.toString();
      serverPort.addEventListener('change', () => {
        this.settings.dashboard.serverPort = parseInt(serverPort.value) || 4020;
        this.saveSettings();
      });
    }

    // Dashboard password
    const password = document.getElementById('dashboardPassword') as HTMLInputElement;
    if (password) {
      password.value = this.settings.dashboard.password;
      password.addEventListener('input', () => {
        this.settings.dashboard.password = password.value;
        this.saveSettings();
      });
    }

    // Default terminal
    const terminal = document.getElementById('defaultTerminal') as HTMLSelectElement;
    if (terminal) {
      terminal.value = this.settings.general.defaultTerminal;
      terminal.addEventListener('change', () => {
        this.settings.general.defaultTerminal = terminal.value;
        this.saveSettings();
      });
    }

    // Default shell
    const shell = document.getElementById('defaultShell') as HTMLSelectElement;
    if (shell) {
      shell.value = this.settings.general.defaultShell;
      shell.addEventListener('change', () => {
        this.settings.general.defaultShell = shell.value;
        this.saveSettings();
      });
    }

    // Server mode
    const serverMode = document.getElementById('serverMode') as HTMLSelectElement;
    if (serverMode) {
      serverMode.value = this.settings.advanced.serverMode;
      serverMode.addEventListener('change', () => {
        this.settings.advanced.serverMode = serverMode.value as 'rust' | 'swift';
        this.saveSettings();
      });
    }

    // Log level
    const logLevel = document.getElementById('logLevel') as HTMLSelectElement;
    if (logLevel) {
      logLevel.value = this.settings.advanced.logLevel;
      logLevel.addEventListener('change', () => {
        this.settings.advanced.logLevel = logLevel.value;
        this.saveSettings();
      });
    }

    // Session timeout
    const sessionTimeout = document.getElementById('sessionTimeout') as HTMLInputElement;
    if (sessionTimeout) {
      sessionTimeout.value = this.settings.advanced.sessionTimeout.toString();
      sessionTimeout.addEventListener('change', () => {
        this.settings.advanced.sessionTimeout = parseInt(sessionTimeout.value) || 0;
        this.saveSettings();
      });
    }

    // Ngrok auth token
    const ngrokAuthToken = document.getElementById('ngrokAuthToken') as HTMLInputElement;
    if (ngrokAuthToken) {
      ngrokAuthToken.value = this.settings.advanced.ngrokAuthToken || '';
      ngrokAuthToken.addEventListener('input', () => {
        this.settings.advanced.ngrokAuthToken = ngrokAuthToken.value;
        this.saveSettings();
      });
    }

    // Access mode radio buttons
    const accessModes = document.querySelectorAll('input[name="accessMode"]');
    accessModes.forEach((radio) => {
      const input = radio as HTMLInputElement;
      if (input.value === this.settings.dashboard.accessMode) {
        input.checked = true;
      }
      input.addEventListener('change', () => {
        if (input.checked) {
          this.settings.dashboard.accessMode = input.value as 'localhost' | 'network' | 'ngrok';
          this.saveSettings();
        }
      });
    });
  }

  private bindEvents() {
    // Check if password should be shown
    this.togglePasswordField(this.settings.dashboard.enablePassword);
  }

  private togglePasswordField(show: boolean) {
    const passwordRow = document.getElementById('passwordRow');
    if (passwordRow) {
      if (show) {
        passwordRow.classList.remove('hidden');
      } else {
        passwordRow.classList.add('hidden');
      }
    }
  }

  private updateUI() {
    // Update toggles
    const updateToggle = (id: string, value: boolean) => {
      const toggle = document.getElementById(id);
      if (toggle) {
        if (value) {
          toggle.classList.add('active');
        } else {
          toggle.classList.remove('active');
        }
      }
    };

    updateToggle('launchAtLogin', this.settings.general.launchAtLogin);
    updateToggle('showDockIcon', this.settings.general.showDockIcon);
    updateToggle('enablePassword', this.settings.dashboard.enablePassword);
    updateToggle('debugMode', this.settings.advanced.debugMode);
    updateToggle('autoCleanup', this.settings.dashboard.autoCleanup);

    // Update inputs
    const serverPort = document.getElementById('serverPort') as HTMLInputElement;
    if (serverPort) serverPort.value = this.settings.dashboard.serverPort.toString();

    const password = document.getElementById('dashboardPassword') as HTMLInputElement;
    if (password) password.value = this.settings.dashboard.password;

    const terminal = document.getElementById('defaultTerminal') as HTMLSelectElement;
    if (terminal) terminal.value = this.settings.general.defaultTerminal;

    const shell = document.getElementById('defaultShell') as HTMLSelectElement;
    if (shell) shell.value = this.settings.general.defaultShell;

    const serverMode = document.getElementById('serverMode') as HTMLSelectElement;
    if (serverMode) serverMode.value = this.settings.advanced.serverMode;

    const logLevel = document.getElementById('logLevel') as HTMLSelectElement;
    if (logLevel) logLevel.value = this.settings.advanced.logLevel;

    const sessionTimeout = document.getElementById('sessionTimeout') as HTMLInputElement;
    if (sessionTimeout) sessionTimeout.value = this.settings.advanced.sessionTimeout.toString();

    const ngrokAuthToken = document.getElementById('ngrokAuthToken') as HTMLInputElement;
    if (ngrokAuthToken) ngrokAuthToken.value = this.settings.advanced.ngrokAuthToken || '';

    // Update radio buttons
    const accessModes = document.querySelectorAll('input[name="accessMode"]');
    accessModes.forEach((radio) => {
      const input = radio as HTMLInputElement;
      input.checked = input.value === this.settings.dashboard.accessMode;
    });

    // Show/hide password field
    this.togglePasswordField(this.settings.dashboard.enablePassword);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SettingsManager());
} else {
  new SettingsManager();
}
