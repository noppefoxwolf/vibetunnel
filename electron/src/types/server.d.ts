// Type definitions for server-related functionality

export interface ServerManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  getStatus(): ServerStatus;
  getSessions(): Session[];
  createSession(options: CreateSessionOptions): Promise<Session>;
  terminateSession(sessionId: string): Promise<void>;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  pid?: number;
  startTime?: Date;
  sessions: number;
}

export interface Session {
  id: string;
  title: string;
  command?: string;
  shell?: string;
  created: Date;
  lastActivity?: Date;
  rows?: number;
  cols?: number;
  recording?: boolean;
  recordingPath?: string;
}

export interface CreateSessionOptions {
  title?: string;
  command?: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  rows?: number;
  cols?: number;
  record?: boolean;
}

export interface ServerConfig {
  port: number;
  host: string;
  mode: 'rust' | 'node';
  authToken?: string;
  recordingsPath?: string;
  logPath?: string;
  debug?: boolean;
}