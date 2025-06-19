"use strict";
/// <reference path="../../types/electron.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialize = initialize;
exports.loadSettings = loadSettings;
exports.applySettingsToUI = applySettingsToUI;
exports.setupTabNavigation = setupTabNavigation;
// Settings - TypeScript version with proper type safety
console.log('Settings script starting (TypeScript version)...');
let settings = {};
// Initialize
async function initialize() {
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
    }
    catch (error) {
        console.error('Failed to initialize settings:', error);
    }
}
// Load settings
async function loadSettings() {
    try {
        settings = await window.electronAPI.getSettings();
        console.log('Settings loaded:', settings);
    }
    catch (error) {
        console.error('Failed to load settings:', error);
        settings = {};
    }
}
// Helper function to safely get element by ID with type
function getElementById(id) {
    return document.getElementById(id);
}
// Apply settings to UI
function applySettingsToUI() {
    // Type-safe element access
    const serverPort = getElementById('serverPort');
    if (serverPort)
        serverPort.value = String(settings.serverPort || 4020);
    const launchAtLogin = getElementById('launchAtLogin');
    if (launchAtLogin)
        launchAtLogin.checked = settings.launchAtLogin === true;
    const showDockIcon = getElementById('showDockIcon');
    if (showDockIcon)
        showDockIcon.checked = settings.showDockIcon === true;
    const autoCleanupOnQuit = getElementById('autoCleanupOnQuit');
    if (autoCleanupOnQuit)
        autoCleanupOnQuit.checked = settings.autoCleanupOnQuit !== false;
    const passwordProtect = getElementById('passwordProtect');
    if (passwordProtect)
        passwordProtect.checked = !!settings.dashboardPassword;
    const dashboardPort = getElementById('dashboardPort');
    if (dashboardPort)
        dashboardPort.value = String(settings.serverPort || 4020);
    const accessMode = getElementById('accessMode');
    if (accessMode)
        accessMode.value = settings.accessMode || 'localhost';
    const terminalApp = getElementById('terminalApp');
    if (terminalApp)
        terminalApp.value = settings.terminalApp || 'default';
    const cleanupOnStartup = getElementById('cleanupOnStartup');
    if (cleanupOnStartup)
        cleanupOnStartup.checked = settings.cleanupOnStartup !== false;
    const serverMode = getElementById('serverMode');
    if (serverMode)
        serverMode.value = settings.serverMode || 'rust';
    const updateChannel = getElementById('updateChannel');
    if (updateChannel)
        updateChannel.value = settings.updateChannel || 'stable';
    const debugMode = getElementById('debugMode');
    if (debugMode)
        debugMode.checked = settings.debugMode === true;
    loadSystemInfo();
}
// Tab navigation
function setupTabNavigation() {
    console.log('Setting up tab navigation...');
    const tabs = document.querySelectorAll('.tab');
    console.log(`Found ${tabs.length} tabs`);
    tabs.forEach(tab => {
        const tabId = tab.getAttribute('data-tab');
        if (!tabId)
            return;
        tab.addEventListener('click', function (e) {
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
        window.electronAPI.on('switch-tab', (tabName) => {
            const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
            if (tab)
                tab.click();
        });
    }
}
// Setup all event handlers
function setupAllHandlers() {
    console.log('Setting up all handlers...');
    setupTitlebarButtons();
    setupButtonHandlers();
    setupSettingHandlers();
}

// Setup titlebar buttons
function setupTitlebarButtons() {
    const closeBtn = document.getElementById('closeBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    const maximizeBtn = document.getElementById('maximizeBtn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.electronAPI.closeWindow();
        });
    }
    
    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
            window.electronAPI.minimizeWindow();
        });
    }
    
    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', () => {
            // Since the window is not maximizable, this button is disabled
            // You could implement maximize functionality if needed
        });
    }
}
// Button handlers
function setupButtonHandlers() {
    console.log('Setting up button handlers...');
    // Test Terminal button
    const testTerminalBtn = getElementById('testTerminalBtn');
    if (testTerminalBtn) {
        testTerminalBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            console.log('Test Terminal clicked');
            const terminalApp = getElementById('terminalApp')?.value || 'default';
            try {
                await window.electronAPI.openTerminal('echo "VibeTunnel terminal test successful!"', {
                    terminal: terminalApp
                });
            }
            catch (error) {
                alert(`Failed to open terminal: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    // Install CLI button
    const installCLIBtn = getElementById('installCLIBtn');
    if (installCLIBtn) {
        installCLIBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            console.log('Install CLI clicked');
            this.disabled = true;
            this.textContent = 'Installing...';
            try {
                await window.electronAPI.installCLI();
                alert('CLI tool installed successfully!');
                this.textContent = 'Reinstall CLI Tool';
            }
            catch (error) {
                alert(`Failed to install CLI: ${error instanceof Error ? error.message : 'Unknown error'}`);
                this.textContent = 'Install CLI Tool';
            }
            finally {
                this.disabled = false;
            }
        });
    }
    // Other buttons follow similar pattern...
}
// Setting change handlers
function setupSettingHandlers() {
    console.log('Setting up setting handlers...');
    // Server port
    const serverPort = getElementById('serverPort');
    if (serverPort) {
        serverPort.addEventListener('change', async (e) => {
            const target = e.target;
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
    const checkboxIds = [
        'launchAtLogin', 'showDockIcon', 'autoCleanupOnQuit',
        'cleanupOnStartup', 'debugMode'
    ];
    checkboxIds.forEach(id => {
        const element = getElementById(id);
        if (element) {
            element.addEventListener('change', async (e) => {
                const target = e.target;
                try {
                    await window.electronAPI.setSetting(String(id), target.checked);
                    settings[id] = target.checked;
                }
                catch (error) {
                    console.error(`Failed to update ${String(id)}:`, error);
                    target.checked = !target.checked;
                    alert(`Failed to update ${String(id)}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            });
        }
    });
}
// Load system info
async function loadSystemInfo() {
    try {
        const info = await window.electronAPI.getSystemInfo();
        const appVersion = getElementById('appVersion');
        if (appVersion)
            appVersion.textContent = info.version;
        const platform = getElementById('platform');
        if (platform)
            platform.textContent = `${info.platform} (${info.arch})`;
        const electronVersion = getElementById('electronVersion');
        if (electronVersion)
            electronVersion.textContent = info.electron;
        const nodeVersion = getElementById('nodeVersion');
        if (nodeVersion)
            nodeVersion.textContent = info.node;
    }
    catch (error) {
        console.error('Failed to load system info:', error);
    }
}
// Start initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
}
else {
    initialize();
}
//# sourceMappingURL=settings.js.map