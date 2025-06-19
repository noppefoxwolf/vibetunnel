// Type definitions for Electron renderer API

interface ElectronAPI {
  // Settings
  getSettings(): Promise<Settings>;
  setSetting(key: string, value: any): Promise<void>;
  
  // Server control
  startServer(): Promise<void>;
  stopServer(): Promise<void>;
  getServerStatus(): Promise<ServerStatus>;
  
  // Session management
  getSessions(): Promise<Session[]>;
  createSession(options: SessionOptions): Promise<Session>;
  terminateSession(sessionId: string): Promise<void>;
  
  // System info
  getSystemInfo(): Promise<SystemInfo>;
  getAvailableTerminals(): Promise<string[]>;
  
  // Window control
  closeWindow(): void;
  minimizeWindow(): void;
  
  // Updates
  checkForUpdates(): Promise<void>;
  
  // File operations
  openLogFile(): Promise<void>;
  openRecordingsFolder(): Promise<void>;
  
  // External links
  openExternal(url: string): Promise<void>;
  
  // Terminal operations
  openTerminal(command: string, options?: TerminalOptions): Promise<void>;
  
  // Network
  getLocalIP(): Promise<string>;
  
  // CLI
  installCLI(): Promise<void>;
  
  // Events
  on(channel: string, callback: (...args: any[]) => void): void;
  removeAllListeners(channel: string): void;
}

interface Settings {
  serverPort?: number;
  launchAtLogin?: boolean;
  showDockIcon?: boolean;
  autoCleanupOnQuit?: boolean;
  dashboardPassword?: string;
  accessMode?: 'localhost' | 'network' | 'ngrok';
  terminalApp?: string;
  cleanupOnStartup?: boolean;
  serverMode?: 'rust' | 'node';
  updateChannel?: 'stable' | 'beta';
  debugMode?: boolean;
  firstRun?: boolean;
}

interface ServerStatus {
  running: boolean;
  port: number;
  sessions: number;
}

interface Session {
  id: string;
  title: string;
  created: Date;
  // Add more session properties as needed
}

interface SessionOptions {
  title?: string;
  command?: string;
}

interface SystemInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  electron: string;
  node: string;
}

interface TerminalOptions {
  terminal?: string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};