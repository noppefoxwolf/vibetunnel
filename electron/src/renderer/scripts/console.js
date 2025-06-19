"use strict";
/// <reference path="../../types/electron.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
exports.addLog = addLog;
exports.filterLogs = filterLogs;
exports.exportLogs = exportLogs;
// Console window - TypeScript version
console.log('Console script starting (TypeScript version)...');
// State
let logs = [];
let autoScroll = true;
let searchTerm = '';
let levelFilter = 'all';
// Initialize
function init() {
    setupEventHandlers();
    startLogCapture();
}
// Setup event handlers
function setupEventHandlers() {
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('input', (e) => {
            const target = e.target;
            searchTerm = target.value.toLowerCase();
            filterLogs();
        });
    }
    const logLevelFilter = document.getElementById('logLevelFilter');
    if (logLevelFilter) {
        logLevelFilter.addEventListener('change', (e) => {
            const target = e.target;
            levelFilter = target.value;
            filterLogs();
        });
    }
    const autoScrollCheckbox = document.getElementById('autoScroll');
    if (autoScrollCheckbox) {
        autoScrollCheckbox.addEventListener('change', (e) => {
            const target = e.target;
            autoScroll = target.checked;
        });
    }
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            console.log('Clear button clicked');
            logs = [];
            renderLogs();
        });
    }
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportLogs);
    }
}
// Start capturing logs
function startLogCapture() {
    // Initial log
    addLog('info', 'Console', 'VibeTunnel Console Started');
    // Simulate logs for demo - replace with actual log capture
    const demoLogGenerator = setInterval(() => {
        const levels = ['info', 'debug', 'warning', 'error'];
        const sources = ['Server', 'Session', 'API', 'Terminal'];
        const messages = [
            'Processing request',
            'Session created',
            'Client connected',
            'Health check passed',
            'Terminal resized',
            'Session terminated',
            'API request received'
        ];
        if (Math.random() > 0.7) {
            const level = levels[Math.floor(Math.random() * levels.length)];
            const source = sources[Math.floor(Math.random() * sources.length)];
            const message = messages[Math.floor(Math.random() * messages.length)];
            addLog(level, source, message);
        }
    }, 2000);
    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
        clearInterval(demoLogGenerator);
    });
}
// Add log entry
function addLog(level, source, message) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, level, source, message };
    logs.push(logEntry);
    // Keep only last 1000 logs
    if (logs.length > 1000) {
        logs.shift();
    }
    // Update display if matches filter
    if (matchesFilter(logEntry)) {
        appendLogEntry(logEntry);
    }
}
// Check if log matches current filters
function matchesFilter(log) {
    // Level filter
    if (levelFilter !== 'all' && log.level !== levelFilter) {
        return false;
    }
    // Search filter
    if (searchTerm) {
        const searchableText = `${log.source} ${log.message}`.toLowerCase();
        if (!searchableText.includes(searchTerm)) {
            return false;
        }
    }
    return true;
}
// Filter and re-render logs
function filterLogs() {
    const filtered = logs.filter(matchesFilter);
    renderLogs(filtered);
}
// Render logs
function renderLogs(logsToRender = logs) {
    const content = document.getElementById('consoleContent');
    if (!content)
        return;
    content.innerHTML = '';
    if (logsToRender.length === 0) {
        content.innerHTML = '<div class="empty-state">No logs to display</div>';
        return;
    }
    logsToRender.forEach(log => {
        appendLogEntry(log);
    });
}
// Append single log entry
function appendLogEntry(log) {
    const content = document.getElementById('consoleContent');
    if (!content)
        return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
    <span class="log-timestamp">${log.timestamp}</span>
    <span class="log-level ${log.level}">${log.level}</span>
    <span class="log-source">${log.source}</span>
    <span class="log-message">${highlightMessage(log.message)}</span>
  `;
    content.appendChild(entry);
    // Auto-scroll if enabled
    if (autoScroll) {
        const body = document.getElementById('consoleBody');
        if (body) {
            body.scrollTop = body.scrollHeight;
        }
    }
}
// Highlight message content
function highlightMessage(message) {
    // Simple syntax highlighting
    return message
        .replace(/"([^"]*)"/g, '<span class="string">"$1"</span>')
        .replace(/\b(\d+)\b/g, '<span class="number">$1</span>')
        .replace(/\b(error|failed|failure)\b/gi, '<span class="error-text">$1</span>');
}
// Export logs
function exportLogs() {
    console.log('Export button clicked');
    try {
        const logText = logs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`).join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vibetunnel-logs-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Export completed');
    }
    catch (error) {
        console.error('Export failed:', error);
        alert(`Failed to export logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
//# sourceMappingURL=console.js.map