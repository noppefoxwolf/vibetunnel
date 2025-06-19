// Type definitions for Electron Store

import { Settings } from './electron';

export interface StoreSchema {
  // All possible store keys and their types
  serverPort: number;
  launchAtLogin: boolean;
  showDockIcon: boolean;
  autoCleanupOnQuit: boolean;
  dashboardPassword: string;
  accessMode: 'localhost' | 'network' | 'ngrok';
  terminalApp: string;
  cleanupOnStartup: boolean;
  serverMode: 'rust' | 'go';
  updateChannel: 'stable' | 'beta';
  debugMode: boolean;
  firstRun: boolean;
  recordingsPath: string;
  logPath: string;
  ngrokAuthToken?: string;
  sessions: StoredSession[];
}

export interface StoredSession {
  id: string;
  title: string;
  created: string; // ISO date string
  command?: string;
}

export interface ElectronStore {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K] | undefined;
  get<K extends keyof StoreSchema>(key: K, defaultValue: StoreSchema[K]): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
  delete<K extends keyof StoreSchema>(key: K): void;
  clear(): void;
  has<K extends keyof StoreSchema>(key: K): boolean;
  onDidChange<K extends keyof StoreSchema>(
    key: K,
    callback: (newValue?: StoreSchema[K], oldValue?: StoreSchema[K]) => void
  ): () => void;
}