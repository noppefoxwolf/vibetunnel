import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import axios from 'axios';
import { EventEmitter } from 'events';
import { ServerManager, ServerStatus, Session, CreateSessionOptions } from '../types/server';

interface ServerManagerEvents {
  'status-changed': (status: ServerStatus) => void;
  'sessions-changed': (sessions: Session[]) => void;
  'server-error': (error: Error) => void;
}

export class VibeTunnelServerManager extends EventEmitter implements ServerManager {
  private serverProcess: ChildProcess | null = null;
  private serverPort: number;
  private serverMode: 'rust' | 'go';
  private sessions: Map<string, Session> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private startTime: Date | null = null;

  constructor(port: number = 4020, mode: 'rust' | 'go' = 'rust') {
    super();
    this.serverPort = port;
    this.serverMode = mode;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Server is already running');
      return;
    }

    try {
      const serverPath = this.getServerPath();
      
      if (!fs.existsSync(serverPath)) {
        throw new Error(`Server binary not found at: ${serverPath}`);
      }

      console.log(`Starting ${this.serverMode} server on port ${this.serverPort}...`);
      
      const args = this.getServerArgs();
      
      this.serverProcess = spawn(serverPath, args, {
        cwd: app.getPath('userData'),
        env: {
          ...process.env,
          RUST_LOG: 'info',
          NODE_ENV: process.env.NODE_ENV || 'production'
        }
      });

      this.serverProcess.stdout?.on('data', (data) => {
        console.log(`[Server]: ${data.toString()}`);
      });

      this.serverProcess.stderr?.on('data', (data) => {
        console.error(`[Server Error]: ${data.toString()}`);
      });

      this.serverProcess.on('error', (error) => {
        console.error('Failed to start server:', error);
        this.emit('server-error', error);
        this.isRunning = false;
      });

      this.serverProcess.on('exit', (code) => {
        console.log(`Server process exited with code ${code}`);
        this.isRunning = false;
        this.startTime = null;
        this.stopPingCheck();
        this.emit('status-changed', this.getStatus());
      });

      // Wait for server to be ready
      await this.waitForServer();
      
      this.isRunning = true;
      this.startTime = new Date();
      this.startPingCheck();
      
      console.log('Server started successfully');
      this.emit('status-changed', this.getStatus());
    } catch (error) {
      console.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.serverProcess) {
      console.log('Server is not running');
      return;
    }

    console.log('Stopping server...');
    
    this.stopPingCheck();
    
    // Try graceful shutdown first
    this.serverProcess.kill('SIGTERM');
    
    // Give it 5 seconds to shut down gracefully
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.serverProcess) {
          console.log('Force killing server process...');
          this.serverProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      this.serverProcess!.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.serverProcess = null;
    this.isRunning = false;
    this.startTime = null;
    this.sessions.clear();
    
    console.log('Server stopped');
    this.emit('status-changed', this.getStatus());
  }

  async cleanup(): Promise<void> {
    await this.stop();
    // Additional cleanup if needed
  }

  getStatus(): ServerStatus {
    return {
      running: this.isRunning,
      port: this.serverPort,
      pid: this.serverProcess?.pid,
      startTime: this.startTime || undefined,
      sessions: this.sessions.size
    };
  }

  getSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  async createSession(options: CreateSessionOptions): Promise<Session> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }

    try {
      const response = await axios.post(`http://localhost:${this.serverPort}/api/sessions`, options);
      const session: Session = {
        ...response.data,
        created: new Date(response.data.created)
      };
      
      this.sessions.set(session.id, session);
      this.emit('sessions-changed', this.getSessions());
      
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  }

  async terminateSession(sessionId: string): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Server is not running');
    }

    try {
      await axios.delete(`http://localhost:${this.serverPort}/api/sessions/${sessionId}`);
      this.sessions.delete(sessionId);
      this.emit('sessions-changed', this.getSessions());
    } catch (error) {
      console.error('Failed to terminate session:', error);
      throw error;
    }
  }

  private getServerPath(): string {
    const platform = process.platform;
    const arch = process.arch;
    
    let binaryName: string;
    if (this.serverMode === 'rust') {
      binaryName = 'tty-fwd';
    } else {
      binaryName = 'vibetunnel';
    }
    
    if (platform === 'win32') {
      binaryName += '.exe';
    }

    // In development, look in the bin directory
    if (process.env.NODE_ENV === 'development') {
      const devPath = path.join(__dirname, '../../../../bin', `${platform}-${arch}`, binaryName);
      if (fs.existsSync(devPath)) {
        return devPath;
      }
    }

    // In production, look in resources
    const resourcesPath = process.resourcesPath || app.getAppPath();
    return path.join(resourcesPath, 'bin', `${platform}-${arch}`, binaryName);
  }

  private getServerArgs(): string[] {
    const webPath = path.join(__dirname, '../../../web/public');
    
    if (this.serverMode === 'rust') {
      return [
        '--port', this.serverPort.toString(),
        '--static-path', webPath
      ];
    } else {
      // Go server arguments
      return [
        'start',
        '--port', this.serverPort.toString(),
        '--bind', `0.0.0.0:${this.serverPort}`,
        '--cleanup'
      ];
    }
  }

  private async waitForServer(maxAttempts = 30, interval = 1000): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`http://localhost:${this.serverPort}/health`);
        if (response.status === 200) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Server failed to start within timeout period');
  }

  private startPingCheck(): void {
    this.pingInterval = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:${this.serverPort}/api/sessions`);
        const sessions: Session[] = response.data.map((s: any) => ({
          ...s,
          created: new Date(s.created),
          lastActivity: s.lastActivity ? new Date(s.lastActivity) : undefined
        }));
        
        // Update sessions map
        this.sessions.clear();
        sessions.forEach(session => {
          this.sessions.set(session.id, session);
        });
        
        this.emit('sessions-changed', sessions);
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  private stopPingCheck(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // TypeScript event emitter overrides for type safety
  emit<K extends keyof ServerManagerEvents>(
    event: K,
    ...args: Parameters<ServerManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ServerManagerEvents>(
    event: K,
    listener: ServerManagerEvents[K]
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof ServerManagerEvents>(
    event: K,
    listener: ServerManagerEvents[K]
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof ServerManagerEvents>(
    event: K,
    listener: ServerManagerEvents[K]
  ): this {
    return super.off(event, listener);
  }
}

export default VibeTunnelServerManager;