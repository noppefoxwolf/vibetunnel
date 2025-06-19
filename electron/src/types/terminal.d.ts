// Type definitions for terminal/PTY functionality

export interface Terminal {
  pid: number;
  cols: number;
  rows: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  on(event: 'data', listener: (data: string) => void): void;
  on(event: 'exit', listener: (code: number) => void): void;
}

export interface TerminalOptions {
  name?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  encoding?: string;
}

export interface TerminalApp {
  id: string;
  name: string;
  path: string;
  available: boolean;
}

export interface TerminalMessage {
  type: 'data' | 'resize' | 'exit' | 'error';
  sessionId: string;
  data?: string;
  cols?: number;
  rows?: number;
  exitCode?: number;
  error?: string;
}