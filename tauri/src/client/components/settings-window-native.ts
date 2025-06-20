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
    // Load settings first and wait for completion
    await this.loadSettings();

    // Setup UI components that depend on settings
    this.setupTabs();
    this.setupToggles();
    this.setupInputs();
    this.bindEvents();

    // Update debug tab visibility based on loaded debug mode setting
    this.updateDebugTabVisibility();

    // Setup debug tab functionality after visibility is set
    this.setupDebugTab();

    // Ensure initial tab state is correct
    this.ensureInitialTabState();

    // Load and display app version
    this.loadAppVersion();
  }

  private async loadAppVersion() {
    if (window.__TAURI__) {
      try {
        const version = await window.__TAURI__.invoke('get_app_version');
        const versionElement = document.getElementById('appVersion');
        if (versionElement) {
          versionElement.textContent = `Version ${version}`;
        }
      } catch (error) {
        console.error('Failed to load app version:', error);
      }
    }
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

          // Also get the actual auto-launch status from the system
          try {
            const autoLaunchEnabled = await window.__TAURI__.invoke('get_auto_launch');
            this.settings.general.launchAtLogin = autoLaunchEnabled;
          } catch (error) {
            console.error('Failed to get auto-launch status:', error);
          }

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
        update: async (v: boolean) => {
          this.settings.general.launchAtLogin = v;
          // Actually enable/disable auto-launch
          if (window.__TAURI__) {
            try {
              await window.__TAURI__.invoke('set_auto_launch', { enabled: v });
            } catch (error) {
              console.error('Failed to set auto-launch:', error);
              // Revert the toggle if the operation failed
              this.settings.general.launchAtLogin = !v;
              const toggle = document.getElementById('launchAtLogin');
              if (toggle) {
                if (!v) {
                  toggle.classList.add('active');
                } else {
                  toggle.classList.remove('active');
                }
              }
            }
          }
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
          this.updateDebugTabVisibility();
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
        toggle.addEventListener('click', async () => {
          const isActive = toggle.classList.toggle('active');
          await update(isActive);
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

    // Setup close button
    this.setupWindowControls();
  }

  private updateDebugTabVisibility() {
    const debugTab = document.getElementById('debugTab');
    if (debugTab) {
      if (this.settings.advanced.debugMode) {
        debugTab.classList.remove('hidden');
      } else {
        debugTab.classList.add('hidden');
        // If we're currently on the debug tab and it's being hidden, switch to general
        const activeTab = document.querySelector('.tab.active');
        if (activeTab && activeTab.getAttribute('data-tab') === 'debug') {
          const generalTab = document.querySelector('.tab[data-tab="general"]');
          if (generalTab) {
            (generalTab as HTMLElement).click();
          }
        }
      }
    }
  }

  private async setupDebugTab() {
    // Setup debug mode toggle in debug tab
    const debugModeToggle = document.getElementById('debugModeToggle');
    if (debugModeToggle) {
      // Set initial state
      if (this.settings.advanced.debugMode) {
        debugModeToggle.classList.add('active');
      }

      // Add click handler
      debugModeToggle.addEventListener('click', async () => {
        const isActive = debugModeToggle.classList.toggle('active');
        this.settings.advanced.debugMode = isActive;
        // Also update the main debug mode toggle
        const mainDebugToggle = document.getElementById('debugMode');
        if (mainDebugToggle) {
          if (isActive) {
            mainDebugToggle.classList.add('active');
          } else {
            mainDebugToggle.classList.remove('active');
          }
        }
        this.updateDebugTabVisibility();
        await this.saveSettings();
      });
    }

    // Setup debug log level
    const debugLogLevel = document.getElementById('debugLogLevel') as HTMLSelectElement;
    if (debugLogLevel) {
      debugLogLevel.value = this.settings.advanced.logLevel;
      debugLogLevel.addEventListener('change', async () => {
        this.settings.advanced.logLevel = debugLogLevel.value;
        // Also update the main log level select
        const mainLogLevel = document.getElementById('logLevel') as HTMLSelectElement;
        if (mainLogLevel) {
          mainLogLevel.value = debugLogLevel.value;
        }
        await this.saveSettings();
      });
    }

    // Setup server status monitoring
    this.startServerStatusMonitoring();

    // Setup API endpoints
    this.populateApiEndpoints();

    // Setup developer tool buttons
    this.setupDeveloperTools();
  }

  private async startServerStatusMonitoring() {
    const checkServerStatus = async () => {
      const statusIndicator = document.getElementById('statusIndicator');
      const statusText = document.getElementById('statusText');
      const debugServerPort = document.getElementById('debugServerPort');
      const baseUrlLink = document.getElementById('baseUrlLink') as HTMLAnchorElement;

      if (!statusIndicator || !statusText) return;

      try {
        const response = await fetch(
          `http://127.0.0.1:${this.settings.dashboard.serverPort}/api/health`
        );
        if (response.ok) {
          statusIndicator.classList.add('healthy');
          statusIndicator.classList.remove('unhealthy');
          statusText.textContent = 'Healthy';
        } else {
          statusIndicator.classList.add('unhealthy');
          statusIndicator.classList.remove('healthy');
          statusText.textContent = 'Unhealthy';
        }
      } catch (_error) {
        statusIndicator.classList.remove('healthy', 'unhealthy');
        statusText.textContent = 'Stopped';
      }

      // Update port display
      if (debugServerPort) {
        debugServerPort.textContent = this.settings.dashboard.serverPort.toString();
      }

      // Update base URL
      if (baseUrlLink) {
        const baseUrl = `http://127.0.0.1:${this.settings.dashboard.serverPort}`;
        baseUrlLink.href = baseUrl;
        baseUrlLink.textContent = baseUrl;
        baseUrlLink.onclick = (e) => {
          e.preventDefault();
          if (window.__TAURI__) {
            window.__TAURI__.shell.open(baseUrl);
          }
        };
      }
    };

    // Check immediately
    checkServerStatus();

    // Check every 2 seconds
    setInterval(checkServerStatus, 2000);
  }

  private populateApiEndpoints() {
    const endpoints = [
      { method: 'GET', path: '/api/health', description: 'Health check endpoint' },
      { method: 'GET', path: '/api/sessions', description: 'List all sessions' },
      { method: 'POST', path: '/api/sessions', description: 'Create a new session' },
      { method: 'DELETE', path: '/api/sessions/:id', description: 'Delete a session' },
      { method: 'GET', path: '/api/sessions/:id/size', description: 'Get terminal size' },
      { method: 'POST', path: '/api/sessions/:id/resize', description: 'Resize terminal' },
      { method: 'POST', path: '/api/sessions/:id/upload', description: 'Upload file to session' },
      {
        method: 'POST',
        path: '/api/sessions/:id/download',
        description: 'Download file from session',
      },
    ];

    const endpointsList = document.getElementById('endpointsList');
    if (!endpointsList) return;

    endpointsList.innerHTML = endpoints
      .map(
        (endpoint) => `
      <div class="endpoint-item">
        <div class="endpoint-info">
          <div>
            <span class="endpoint-method">${endpoint.method}</span>
            <span class="endpoint-path">${endpoint.path}</span>
          </div>
          <div class="endpoint-description">${endpoint.description}</div>
        </div>
        ${
          endpoint.method === 'GET' && !endpoint.path.includes(':id')
            ? `<button class="button small secondary" data-endpoint="${endpoint.path}">Test</button>`
            : ''
        }
      </div>
    `
      )
      .join('');

    // Add click handlers for test buttons
    endpointsList.querySelectorAll('button[data-endpoint]').forEach((button) => {
      button.addEventListener('click', async (e) => {
        const endpoint = (e.target as HTMLElement).getAttribute('data-endpoint');
        if (endpoint) {
          await this.testEndpoint(endpoint);
        }
      });
    });
  }

  private async testEndpoint(endpoint: string) {
    const testResult = document.getElementById('testResult');
    const resultStatus = document.getElementById('resultStatus');
    const resultText = document.getElementById('resultText');

    if (!testResult || !resultStatus || !resultText) return;

    testResult.classList.remove('hidden');
    testResult.classList.remove('success', 'error');

    try {
      const response = await fetch(
        `http://127.0.0.1:${this.settings.dashboard.serverPort}${endpoint}`
      );
      const data = await response.text();

      if (response.ok) {
        testResult.classList.add('success');
        resultStatus.textContent = `✅ ${response.status}`;
        resultText.textContent = data.length > 100 ? data.substring(0, 100) + '...' : data;
      } else {
        testResult.classList.add('error');
        resultStatus.textContent = `❌ ${response.status}`;
        resultText.textContent = data || response.statusText;
      }
    } catch (error) {
      testResult.classList.add('error');
      resultStatus.textContent = '❌ Error';
      resultText.textContent = error instanceof Error ? error.message : 'Unknown error';
    }

    // Hide result after 5 seconds
    setTimeout(() => {
      testResult.classList.add('hidden');
    }, 5000);
  }

  private setupDeveloperTools() {
    // Restart server button
    const restartServerBtn = document.getElementById('restartServerBtn');
    if (restartServerBtn && window.__TAURI__) {
      restartServerBtn.addEventListener('click', async () => {
        try {
          await window.__TAURI__.invoke('restart_server');
        } catch (error) {
          console.error('Failed to restart server:', error);
        }
      });
    }

    // Show server console button
    const showConsoleBtn = document.getElementById('showConsoleBtn');
    if (showConsoleBtn && window.__TAURI__) {
      showConsoleBtn.addEventListener('click', async () => {
        try {
          await window.__TAURI__.invoke('show_server_console');
        } catch (error) {
          console.error('Failed to show server console:', error);
        }
      });
    }

    // Open system console button
    const openSystemConsoleBtn = document.getElementById('openSystemConsoleBtn');
    if (openSystemConsoleBtn && window.__TAURI__) {
      openSystemConsoleBtn.addEventListener('click', async () => {
        try {
          await window.__TAURI__.shell.open('/System/Applications/Utilities/Console.app');
        } catch (error) {
          console.error('Failed to open Console.app:', error);
        }
      });
    }

    // Show application support button
    const showAppSupportBtn = document.getElementById('showAppSupportBtn');
    if (showAppSupportBtn && window.__TAURI__) {
      showAppSupportBtn.addEventListener('click', async () => {
        try {
          const appDataDir = await window.__TAURI__.path.appDataDir();
          await window.__TAURI__.shell.open(appDataDir);
        } catch (error) {
          console.error('Failed to open app data directory:', error);
        }
      });
    }

    // Show welcome button
    const showWelcomeBtn = document.getElementById('showWelcomeBtn');
    if (showWelcomeBtn && window.__TAURI__) {
      showWelcomeBtn.addEventListener('click', async () => {
        try {
          await window.__TAURI__.invoke('show_welcome_screen');
        } catch (error) {
          console.error('Failed to show welcome screen:', error);
        }
      });
    }

    // Purge settings button
    const purgeSettingsBtn = document.getElementById('purgeSettingsBtn');
    if (purgeSettingsBtn && window.__TAURI__) {
      purgeSettingsBtn.addEventListener('click', async () => {
        const confirmed = await window.__TAURI__.dialog.confirm(
          'This will remove all stored preferences and reset the app to its default state. The app will quit after purging.\n\nAre you sure you want to continue?',
          { title: 'Purge All Settings?', type: 'warning' }
        );

        if (confirmed) {
          try {
            await window.__TAURI__.invoke('purge_all_settings');
            // App should quit after this
          } catch (error) {
            console.error('Failed to purge settings:', error);
          }
        }
      });
    }
  }

  private setupWindowControls() {
    const closeButton = document.getElementById('close-button');
    if (closeButton && window.__TAURI__) {
      closeButton.addEventListener('click', async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const currentWindow = getCurrentWindow();
        await currentWindow.close();
      });
    }
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

    // Update debug tab visibility
    this.updateDebugTabVisibility();

    // Update debug tab controls if visible
    const debugModeToggle = document.getElementById('debugModeToggle');
    if (debugModeToggle) {
      if (this.settings.advanced.debugMode) {
        debugModeToggle.classList.add('active');
      } else {
        debugModeToggle.classList.remove('active');
      }
    }

    const debugLogLevel = document.getElementById('debugLogLevel') as HTMLSelectElement;
    if (debugLogLevel) {
      debugLogLevel.value = this.settings.advanced.logLevel;
    }
  }

  private setupWindowControls() {
    const closeButton = document.getElementById('close-button');
    if (closeButton && window.__TAURI__) {
      closeButton.addEventListener('click', () => {
        const currentWindow = window.__TAURI__.window.getCurrent();
        currentWindow.close();
      });
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SettingsManager());
} else {
  new SettingsManager();
}
