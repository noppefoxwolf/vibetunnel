import Store from 'electron-store';
import { StoreSchema } from '../types/store';

// Create store with type safety
const store = new Store<StoreSchema>({
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

export default store;