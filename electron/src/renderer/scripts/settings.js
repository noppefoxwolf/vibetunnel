// Settings window functionality
const { electronAPI } = window;

// Current settings
let settings = {};

// Initialize
async function init() {
  // Load current settings
  settings = await electronAPI.getSettings();
  
  // Apply settings to UI
  applySettingsToUI();
  
  // Setup tab switching
  setupTabs();
  
  // Setup event handlers
  setupEventHandlers();
  
  // Load system info
  loadSystemInfo();
  
  // Platform-specific adjustments
  adjustForPlatform();
}

// Apply settings to UI elements
function applySettingsToUI() {
  // General settings
  document.getElementById('serverPort').value = settings.serverPort || 4020;
  document.getElementById('launchAtLogin').checked = settings.launchAtLogin || false;
  document.getElementById('showDockIcon').checked = settings.showDockIcon || false;
  document.getElementById('autoCleanupOnQuit').checked = settings.autoCleanupOnQuit || true;
  
  // Dashboard settings
  document.getElementById('accessMode').value = settings.accessMode || 'localhost';
  document.getElementById('networkPassword').value = settings.networkPassword || '';
  document.getElementById('ngrokAuthToken').value = settings.ngrokAuthToken || '';
  
  // Advanced settings
  document.getElementById('serverMode').value = settings.serverMode || 'rust';
  document.getElementById('updateChannel').value = settings.updateChannel || 'stable';
  document.getElementById('debugMode').checked = settings.debugMode || false;
  
  // Show/hide conditional fields
  updateConditionalFields();
}

// Setup tab switching
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Update active states
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });
}

// Setup event handlers
function setupEventHandlers() {
  // General settings
  document.getElementById('serverPort').addEventListener('change', async (e) => {
    const port = parseInt(e.target.value);
    if (port >= 1024 && port <= 65535) {
      await electronAPI.setSetting('serverPort', port);
    }
  });
  
  document.getElementById('launchAtLogin').addEventListener('change', async (e) => {
    await electronAPI.setSetting('launchAtLogin', e.target.checked);
  });
  
  document.getElementById('showDockIcon').addEventListener('change', async (e) => {
    await electronAPI.setSetting('showDockIcon', e.target.checked);
  });
  
  document.getElementById('autoCleanupOnQuit').addEventListener('change', async (e) => {
    await electronAPI.setSetting('autoCleanupOnQuit', e.target.checked);
  });
  
  // Dashboard settings
  document.getElementById('accessMode').addEventListener('change', async (e) => {
    await electronAPI.setSetting('accessMode', e.target.value);
    updateConditionalFields();
  });
  
  document.getElementById('networkPassword').addEventListener('change', async (e) => {
    await electronAPI.setSetting('networkPassword', e.target.value);
  });
  
  document.getElementById('ngrokAuthToken').addEventListener('change', async (e) => {
    await electronAPI.setSetting('ngrokAuthToken', e.target.value);
  });
  
  // Advanced settings
  document.getElementById('serverMode').addEventListener('change', async (e) => {
    await electronAPI.setSetting('serverMode', e.target.value);
  });
  
  document.getElementById('updateChannel').addEventListener('change', async (e) => {
    await electronAPI.setSetting('updateChannel', e.target.value);
  });
  
  document.getElementById('debugMode').addEventListener('change', async (e) => {
    await electronAPI.setSetting('debugMode', e.target.checked);
  });
  
  // Buttons
  document.getElementById('openLogsBtn').addEventListener('click', () => {
    electronAPI.openLogFile();
  });
  
  document.getElementById('openRecordingsBtn').addEventListener('click', () => {
    electronAPI.openRecordingsFolder();
  });
  
  document.getElementById('checkUpdatesBtn').addEventListener('click', () => {
    electronAPI.checkForUpdates();
  });
  
  document.getElementById('openWebsiteBtn').addEventListener('click', () => {
    electronAPI.openExternal('https://vibetunnel.com');
  });
}

// Update conditional fields based on settings
function updateConditionalFields() {
  const accessMode = document.getElementById('accessMode').value;
  
  // Show/hide network password field
  document.getElementById('networkPasswordGroup').style.display = 
    accessMode === 'network' ? 'block' : 'none';
  
  // Show/hide ngrok token field
  document.getElementById('ngrokTokenGroup').style.display = 
    accessMode === 'ngrok' ? 'block' : 'none';
}

// Load system information
async function loadSystemInfo() {
  const info = await electronAPI.getSystemInfo();
  
  document.getElementById('appVersion').textContent = info.version;
  document.getElementById('platform').textContent = `${info.platform} (${info.arch})`;
  document.getElementById('electronVersion').textContent = info.electron;
  document.getElementById('nodeVersion').textContent = info.node;
}

// Platform-specific adjustments
async function adjustForPlatform() {
  const info = await electronAPI.getSystemInfo();
  
  // Disable Swift mode on non-macOS platforms
  if (info.platform !== 'darwin') {
    const swiftOption = document.getElementById('swiftOption');
    swiftOption.disabled = true;
    swiftOption.textContent = 'Swift (macOS only - unavailable)';
    
    // Force Rust mode if Swift was selected
    if (settings.serverMode === 'swift') {
      document.getElementById('serverMode').value = 'rust';
      await electronAPI.setSetting('serverMode', 'rust');
    }
  }
  
  // Hide dock icon option on non-macOS platforms
  if (info.platform !== 'darwin') {
    const dockIconSetting = document.getElementById('showDockIcon').closest('.setting-group');
    dockIconSetting.style.display = 'none';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);