const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const axios = require('axios');
const { app } = require('electron');

class ServerManager {
  constructor() {
    this.store = new Store();
    this.serverProcess = null;
    this.sessions = new Map();
    this.isServerRunning = false;
    this.serverPort = this.store.get('serverPort', 4020);
    this.serverMode = this.store.get('serverMode', 'rust');
  }

  async start() {
    if (this.isServerRunning) {
      throw new Error('Server is already running');
    }

    const serverPath = this.getServerExecutablePath();
    console.log('Looking for server at:', serverPath);
    
    if (!fs.existsSync(serverPath)) {
      // Try to find any tty-fwd binary
      const binDir = path.dirname(serverPath);
      console.error('Server not found at expected path:', serverPath);
      console.error('Bin directory contents:', fs.existsSync(binDir) ? fs.readdirSync(binDir) : 'Directory not found');
      throw new Error(`Server executable not found at: ${serverPath}`);
    }
    
    // Check if executable
    try {
      fs.accessSync(serverPath, fs.constants.X_OK);
    } catch (err) {
      throw new Error(`Server binary is not executable: ${serverPath}`);
    }

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        PORT: this.serverPort.toString(),
        NODE_ENV: 'production'
      };

      // Add access mode specific environment variables
      const accessMode = this.store.get('accessMode', 'localhost');
      if (accessMode === 'network') {
        env.NETWORK_ACCESS = 'true';
        const password = this.store.get('networkPassword', '');
        if (password) {
          env.ACCESS_PASSWORD = password;
        }
      }

      // Ensure control directory exists
      const controlDir = path.join(app.getPath('userData'), '.vibetunnel', 'control');
      fs.mkdirSync(controlDir, { recursive: true });
      
      // Add server arguments
      const args = [
        '--control-path', controlDir,
        '--serve', this.serverPort.toString()
      ];
      
      // Add static path for web UI if available
      const webPath = path.join(__dirname, '../../../web/public');
      if (fs.existsSync(webPath)) {
        args.push('--static-path', webPath);
      }
      
      // Add password if network access is enabled
      if (accessMode === 'network' && env.ACCESS_PASSWORD) {
        args.push('--password', env.ACCESS_PASSWORD);
      }
      
      console.log('Starting server with args:', args);
      this.serverProcess = spawn(serverPath, args, { env });

      let serverStarted = false;
      
      this.serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`Server: ${output}`);
        
        // Check various success messages from tty-fwd
        if (!serverStarted && (
          output.includes('Server listening') ||
          output.includes('Listening on') ||
          output.includes('Started on') ||
          output.includes('Starting server') ||
          output.includes('HTTP server') ||
          output.includes(`${this.serverPort}`) ||
          output.includes('server started')
        )) {
          serverStarted = true;
          this.isServerRunning = true;
          this.startSessionMonitoring();
          resolve();
        }
      });

      this.serverProcess.stderr.on('data', (data) => {
        console.error(`Server Error: ${data}`);
      });

      this.serverProcess.on('error', (err) => {
        this.isServerRunning = false;
        reject(new Error(`Failed to start server: ${err.message}`));
      });

      this.serverProcess.on('exit', (code) => {
        this.isServerRunning = false;
        this.serverProcess = null;
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Timeout if server doesn't start within 10 seconds
      const timeout = setTimeout(() => {
        if (!this.isServerRunning) {
          this.stop();
          reject(new Error('Server failed to start within timeout period'));
        }
      }, 10000);
      
      // Also try to check if server is responsive after a short delay
      setTimeout(async () => {
        if (!serverStarted) {
          try {
            // Try to ping the server
            await axios.get(`http://localhost:${this.serverPort}/health`, { timeout: 2000 });
            serverStarted = true;
            this.isServerRunning = true;
            clearTimeout(timeout);
            this.startSessionMonitoring();
            resolve();
          } catch (e) {
            // Server not ready yet, will wait for stdout message
          }
        }
      }, 2000);
    });
  }

  async stop() {
    if (!this.serverProcess) {
      return;
    }

    return new Promise((resolve) => {
      this.serverProcess.on('exit', () => {
        this.serverProcess = null;
        this.isServerRunning = false;
        this.sessions.clear();
        resolve();
      });

      // Try graceful shutdown first
      this.serverProcess.kill('SIGTERM');

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.serverProcess) {
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  getServerExecutablePath() {
    const platform = process.platform;
    const arch = process.arch;
    
    // In production, binaries are in resources/bin
    const basePath = app.isPackaged 
      ? path.join(process.resourcesPath, 'bin')
      : path.join(__dirname, '../../bin');

    let executable = 'tty-fwd';
    
    if (platform === 'win32') {
      executable += '.exe';
    }

    // Platform-specific subdirectories
    const platformDir = `${platform}-${arch}`;
    
    return path.join(basePath, platformDir, executable);
  }

  async startSessionMonitoring() {
    // Poll for active sessions every 2 seconds
    setInterval(async () => {
      if (!this.isServerRunning) return;

      try {
        const response = await axios.get(`http://localhost:${this.serverPort}/api/sessions`);
        const activeSessions = response.data.sessions || [];
        
        // Update sessions map
        this.sessions.clear();
        activeSessions.forEach(session => {
          this.sessions.set(session.id, session);
        });
      } catch (error) {
        console.error('Failed to fetch sessions:', error.message);
      }
    }, 2000);
  }

  getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  isRunning() {
    return this.isServerRunning;
  }

  async cleanup() {
    // Clean up any recorded sessions if configured
    const recordingsPath = path.join(app.getPath('userData'), 'recordings');
    
    if (this.store.get('autoCleanupOnQuit', true)) {
      try {
        if (fs.existsSync(recordingsPath)) {
          const files = fs.readdirSync(recordingsPath);
          files.forEach(file => {
            if (file.endsWith('.cast')) {
              fs.unlinkSync(path.join(recordingsPath, file));
            }
          });
        }
      } catch (error) {
        console.error('Failed to cleanup recordings:', error);
      }
    }

    // Stop server
    await this.stop();
  }

  async createSession(options = {}) {
    if (!this.isServerRunning) {
      throw new Error('Server is not running');
    }

    try {
      const response = await axios.post(`http://localhost:${this.serverPort}/api/sessions`, {
        shell: options.shell || this.getDefaultShell(),
        cwd: options.cwd || os.homedir(),
        env: options.env || {},
        size: options.size || { cols: 80, rows: 24 }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  async terminateSession(sessionId) {
    if (!this.isServerRunning) {
      throw new Error('Server is not running');
    }

    try {
      await axios.delete(`http://localhost:${this.serverPort}/api/sessions/${sessionId}`);
      this.sessions.delete(sessionId);
    } catch (error) {
      throw new Error(`Failed to terminate session: ${error.message}`);
    }
  }

  getDefaultShell() {
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Try PowerShell Core first, then Windows PowerShell, then cmd
      const shells = [
        'pwsh.exe',
        'powershell.exe',
        'cmd.exe'
      ];
      
      for (const shell of shells) {
        try {
          require('child_process').execSync(`where ${shell}`, { stdio: 'ignore' });
          return shell;
        } catch (e) {
          // Shell not found, try next
        }
      }
      
      return 'cmd.exe';
    } else {
      // Unix-like systems
      return process.env.SHELL || '/bin/bash';
    }
  }

  async setupNgrokTunnel() {
    const ngrokToken = this.store.get('ngrokAuthToken', '');
    if (!ngrokToken) {
      throw new Error('Ngrok auth token not configured');
    }

    // This would integrate with ngrok API or SDK
    // For now, return a placeholder
    return {
      url: 'https://example.ngrok.io',
      status: 'connected'
    };
  }

  async getServerLogs(lines = 100) {
    const logPath = path.join(app.getPath('userData'), 'server.log');
    
    if (!fs.existsSync(logPath)) {
      return [];
    }

    const logs = fs.readFileSync(logPath, 'utf-8');
    const logLines = logs.split('\n');
    
    return logLines.slice(-lines);
  }
}

module.exports = ServerManager;