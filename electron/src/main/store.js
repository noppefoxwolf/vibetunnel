"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_store_1 = __importDefault(require("electron-store"));
// Create store with type safety
const store = new electron_store_1.default({
    defaults: {
        serverPort: 4020,
        launchAtLogin: false,
        showDockIcon: true,
        autoCleanupOnQuit: true,
        dashboardPassword: '',
        accessMode: 'localhost',
        terminalApp: 'default',
        cleanupOnStartup: true,
        serverMode: 'rust',
        updateChannel: 'stable',
        debugMode: false,
        firstRun: true,
        recordingsPath: '',
        logPath: '',
        sessions: []
    }
});
exports.default = store;
//# sourceMappingURL=store.js.map