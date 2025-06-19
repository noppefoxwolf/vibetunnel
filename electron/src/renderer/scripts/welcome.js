"use strict";
/// <reference path="../../types/electron.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialize = initialize;
exports.showPlatformInstructions = showPlatformInstructions;
exports.navigateToPage = navigateToPage;
exports.finishSetup = finishSetup;
// Welcome window - TypeScript version
console.log('Welcome script starting (TypeScript version)...');
// State
let currentPage = 1;
const totalPages = 4;
let selectedAccessMode = 'localhost';
let launchAtLogin = false;
// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
}
else {
    initialize();
}
async function initialize() {
    console.log('Initializing welcome screen...');
    if (!window.electronAPI) {
        console.error('electronAPI not available');
        return;
    }
    try {
        const systemInfo = await window.electronAPI.getSystemInfo();
        showPlatformInstructions(systemInfo.platform);
    }
    catch (error) {
        console.error('Failed to get system info:', error);
    }
    setupEventListeners();
}
function showPlatformInstructions(platform) {
    const platformInfo = document.getElementById('platformInfo');
    if (!platformInfo)
        return;
    const instructions = {
        darwin: `
      <h3>macOS Permissions</h3>
      <p>VibeTunnel may need the following permissions:</p>
      <div class="permission-step">
        <strong>Automation:</strong> To control Terminal.app and other terminal applications
      </div>
      <div class="permission-step">
        <strong>Accessibility (Optional):</strong> For enhanced terminal control features
      </div>
      <p>You'll be prompted to grant these permissions when needed.</p>
    `,
        win32: `
      <h3>Windows Setup</h3>
      <p>VibeTunnel works with the following terminals:</p>
      <div class="permission-step">• Windows Terminal (recommended)</div>
      <div class="permission-step">• PowerShell / PowerShell Core</div>
      <div class="permission-step">• Command Prompt</div>
      <p>Windows Defender may prompt you to allow VibeTunnel to run.</p>
    `,
        linux: `
      <h3>Linux Setup</h3>
      <p>VibeTunnel automatically detects your installed terminal emulator:</p>
      <div class="permission-step">• GNOME Terminal</div>
      <div class="permission-step">• Konsole</div>
      <div class="permission-step">• xterm</div>
      <div class="permission-step">• And many others...</div>
      <p>No special permissions required on most Linux distributions.</p>
    `
    };
    platformInfo.innerHTML = instructions[platform] || instructions.linux;
}
function setupEventListeners() {
    // Navigation buttons
    const navigationButtons = [
        { id: 'getStartedBtn', action: () => navigateToPage(2) },
        { id: 'backBtn1', action: () => navigateToPage(1) },
        { id: 'continueBtn1', action: () => navigateToPage(3) },
        { id: 'backBtn2', action: () => navigateToPage(2) },
        { id: 'continueBtn2', action: () => navigateToPage(4) },
        { id: 'backBtn3', action: () => navigateToPage(3) },
        { id: 'finishBtn', action: finishSetup }
    ];
    navigationButtons.forEach(({ id, action }) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                action();
            });
        }
    });
    // Access mode radio buttons
    const accessModes = document.querySelectorAll('input[name="accessMode"]');
    accessModes.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const target = e.target;
            selectedAccessMode = target.value;
        });
    });
    // Launch at login checkbox
    const launchAtLoginCheckbox = document.getElementById('launchAtLogin');
    if (launchAtLoginCheckbox) {
        launchAtLoginCheckbox.addEventListener('change', (e) => {
            const target = e.target;
            launchAtLogin = target.checked;
        });
    }
}
function navigateToPage(pageNumber) {
    if (pageNumber < 1 || pageNumber > totalPages)
        return;
    // Hide current page
    const currentPageElement = document.getElementById(`page${currentPage}`);
    if (currentPageElement) {
        currentPageElement.classList.remove('active');
        if (pageNumber > currentPage) {
            currentPageElement.classList.add('previous');
        }
    }
    // Show new page
    currentPage = pageNumber;
    const newPageElement = document.getElementById(`page${currentPage}`);
    if (newPageElement) {
        newPageElement.classList.remove('previous');
        newPageElement.classList.add('active');
    }
    // Update indicators
    updateIndicators();
}
function updateIndicators() {
    const indicators = document.querySelectorAll('.indicator');
    indicators.forEach((indicator, index) => {
        if (index === currentPage - 1) {
            indicator.classList.add('active');
        }
        else {
            indicator.classList.remove('active');
        }
    });
}
async function finishSetup() {
    console.log('Finishing setup...');
    if (!window.electronAPI) {
        alert('Error: electronAPI not available');
        return;
    }
    try {
        // Save settings
        await Promise.all([
            window.electronAPI.setSetting('accessMode', selectedAccessMode),
            window.electronAPI.setSetting('launchAtLogin', launchAtLogin),
            window.electronAPI.setSetting('firstRun', false)
        ]);
        // Update UI
        const page4 = document.getElementById('page4');
        if (page4) {
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
        }
        // Start server and open dashboard
        await window.electronAPI.startServer();
        // Wait for server to start
        setTimeout(async () => {
            const serverStatus = await window.electronAPI.getServerStatus();
            await window.electronAPI.openExternal(`http://localhost:${serverStatus.port}`);
            // Close window after a short delay
            setTimeout(() => {
                window.electronAPI.closeWindow();
            }, 2000);
        }, 2000);
    }
    catch (error) {
        console.error('Setup failed:', error);
        alert(`Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
//# sourceMappingURL=welcome.js.map