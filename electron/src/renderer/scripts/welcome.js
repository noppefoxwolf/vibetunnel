// Welcome window functionality
const { electronAPI } = window;

let currentPage = 1;
const totalPages = 4;

// Initialize
async function init() {
  // Get system info for platform-specific instructions
  const systemInfo = await electronAPI.getSystemInfo();
  showPlatformInstructions(systemInfo.platform);
  
  // Setup event listeners
  setupEventListeners();
}

// Show platform-specific instructions
function showPlatformInstructions(platform) {
  const platformInfo = document.getElementById('platformInfo');
  
  switch (platform) {
  case 'darwin':
    platformInfo.innerHTML = `
        <h3>macOS Permissions</h3>
        <p>VibeTunnel may need the following permissions:</p>
        <div class="permission-step">
          <strong>Automation:</strong> To control Terminal.app and other terminal applications
        </div>
        <div class="permission-step">
          <strong>Accessibility (Optional):</strong> For enhanced terminal control features
        </div>
        <p>You'll be prompted to grant these permissions when needed.</p>
      `;
    break;
      
  case 'win32':
    platformInfo.innerHTML = `
        <h3>Windows Setup</h3>
        <p>VibeTunnel works with the following terminals:</p>
        <div class="permission-step">
          • Windows Terminal (recommended)
        </div>
        <div class="permission-step">
          • PowerShell / PowerShell Core
        </div>
        <div class="permission-step">
          • Command Prompt
        </div>
        <p>Windows Defender may prompt you to allow VibeTunnel to run.</p>
      `;
    break;
      
  case 'linux':
    platformInfo.innerHTML = `
        <h3>Linux Setup</h3>
        <p>VibeTunnel automatically detects your installed terminal emulator:</p>
        <div class="permission-step">
          • GNOME Terminal
        </div>
        <div class="permission-step">
          • Konsole
        </div>
        <div class="permission-step">
          • xterm
        </div>
        <div class="permission-step">
          • And many others...
        </div>
        <p>No special permissions required on most Linux distributions.</p>
      `;
    break;
      
  default:
    platformInfo.innerHTML = `
        <h3>System Setup</h3>
        <p>VibeTunnel will work with your system's default terminal emulator.</p>
      `;
  }
}

// Setup event listeners
function setupEventListeners() {
  // Navigation buttons
  document.getElementById('getStartedBtn').addEventListener('click', () => {
    window.nextPage();
  });
  
  document.getElementById('backBtn1').addEventListener('click', () => {
    window.previousPage();
  });
  
  document.getElementById('continueBtn1').addEventListener('click', () => {
    window.nextPage();
  });
  
  document.getElementById('backBtn2').addEventListener('click', () => {
    window.previousPage();
  });
  
  document.getElementById('continueBtn2').addEventListener('click', () => {
    window.nextPage();
  });
  
  document.getElementById('backBtn3').addEventListener('click', () => {
    window.previousPage();
  });
  
  document.getElementById('finishBtn').addEventListener('click', () => {
    window.finishSetup();
  });
  
  // Access mode radio buttons
  const accessModes = document.querySelectorAll('input[name="accessMode"]');
  accessModes.forEach(radio => {
    radio.addEventListener('change', (e) => {
      // Store the selected access mode
      window.selectedAccessMode = e.target.value;
    });
  });
  
  // Launch at login checkbox
  const launchAtLogin = document.getElementById('launchAtLogin');
  if (launchAtLogin) {
    launchAtLogin.addEventListener('change', (e) => {
      window.launchAtLogin = e.target.checked;
    });
  }
}

// Navigation functions
window.nextPage = function() {
  if (currentPage < totalPages) {
    // Hide current page
    const current = document.getElementById(`page${currentPage}`);
    current.classList.remove('active');
    current.classList.add('previous');
    
    // Show next page
    currentPage++;
    const next = document.getElementById(`page${currentPage}`);
    next.classList.add('active');
    
    // Update indicators
    updateIndicators();
  }
};

window.previousPage = function() {
  if (currentPage > 1) {
    // Hide current page
    const current = document.getElementById(`page${currentPage}`);
    current.classList.remove('active');
    
    // Show previous page
    currentPage--;
    const prev = document.getElementById(`page${currentPage}`);
    prev.classList.remove('previous');
    prev.classList.add('active');
    
    // Update indicators
    updateIndicators();
  }
};

// Update page indicators
function updateIndicators() {
  const indicators = document.querySelectorAll('.indicator');
  indicators.forEach((indicator, index) => {
    if (index === currentPage - 1) {
      indicator.classList.add('active');
    } else {
      indicator.classList.remove('active');
    }
  });
};

// Finish setup
window.finishSetup = async function() {
  // Apply selected settings
  const accessMode = window.selectedAccessMode || 'localhost';
  const launchAtLogin = window.launchAtLogin || false;
  
  await electronAPI.setSetting('accessMode', accessMode);
  await electronAPI.setSetting('launchAtLogin', launchAtLogin);
  await electronAPI.setSetting('firstRun', false);
  
  // Show setup completion message
  const page4 = document.getElementById('page4');
  page4.innerHTML = `
    <div style="text-align: center; padding: 60px 0;">
      <svg style="width: 80px; height: 80px; fill: #4caf50; margin-bottom: 20px;" viewBox="0 0 24 24">
        <path d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"/>
      </svg>
      <h2>Setup Complete!</h2>
      <p>VibeTunnel is now ready to use.</p>
      <p style="margin-top: 30px;">Opening dashboard in your browser...</p>
    </div>
  `;
  
  // Start server and open dashboard
  await electronAPI.startServer();
  
  // Wait a moment for server to start
  setTimeout(async () => {
    const serverStatus = await electronAPI.getServerStatus();
    await electronAPI.openExternal(`http://localhost:${serverStatus.port}`);
    
    // Close welcome window after a short delay
    setTimeout(() => {
      electronAPI.closeWindow();
    }, 2000);
  }, 2000);
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);