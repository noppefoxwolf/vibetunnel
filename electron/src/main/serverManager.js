"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VibeTunnelServerManager = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
const axios_1 = __importDefault(require("axios"));
const events_1 = require("events");
class VibeTunnelServerManager extends events_1.EventEmitter {
    constructor(port = 4020, mode = 'rust') {
        super();
        this.serverProcess = null;
        this.sessions = new Map();
        this.pingInterval = null;
        this.isRunning = false;
        this.startTime = null;
        this.serverPort = port;
        this.serverMode = mode;
    }
    async start() {
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
            const args = ['--port', this.serverPort.toString()];
            this.serverProcess = (0, child_process_1.spawn)(serverPath, args, {
                cwd: electron_1.app.getPath('userData'),
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
        }
        catch (error) {
            console.error('Failed to start server:', error);
            throw error;
        }
    }
    async stop() {
        if (!this.isRunning || !this.serverProcess) {
            console.log('Server is not running');
            return;
        }
        console.log('Stopping server...');
        this.stopPingCheck();
        // Try graceful shutdown first
        this.serverProcess.kill('SIGTERM');
        // Give it 5 seconds to shut down gracefully
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                if (this.serverProcess) {
                    console.log('Force killing server process...');
                    this.serverProcess.kill('SIGKILL');
                }
                resolve();
            }, 5000);
            this.serverProcess.once('exit', () => {
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
    async cleanup() {
        await this.stop();
        // Additional cleanup if needed
    }
    getStatus() {
        return {
            running: this.isRunning,
            port: this.serverPort,
            pid: this.serverProcess?.pid,
            startTime: this.startTime || undefined,
            sessions: this.sessions.size
        };
    }
    getSessions() {
        return Array.from(this.sessions.values());
    }
    async createSession(options) {
        if (!this.isRunning) {
            throw new Error('Server is not running');
        }
        try {
            const response = await axios_1.default.post(`http://localhost:${this.serverPort}/api/sessions`, options);
            const session = {
                ...response.data,
                created: new Date(response.data.created)
            };
            this.sessions.set(session.id, session);
            this.emit('sessions-changed', this.getSessions());
            return session;
        }
        catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    }
    async terminateSession(sessionId) {
        if (!this.isRunning) {
            throw new Error('Server is not running');
        }
        try {
            await axios_1.default.delete(`http://localhost:${this.serverPort}/api/sessions/${sessionId}`);
            this.sessions.delete(sessionId);
            this.emit('sessions-changed', this.getSessions());
        }
        catch (error) {
            console.error('Failed to terminate session:', error);
            throw error;
        }
    }
    getServerPath() {
        const platform = process.platform;
        const arch = process.arch;
        let binaryName = 'vibetunnel-server';
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
        const resourcesPath = process.resourcesPath || electron_1.app.getAppPath();
        return path.join(resourcesPath, 'bin', `${platform}-${arch}`, binaryName);
    }
    async waitForServer(maxAttempts = 30, interval = 1000) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await axios_1.default.get(`http://localhost:${this.serverPort}/health`);
                if (response.status === 200) {
                    return;
                }
            }
            catch (error) {
                // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, interval));
        }
        throw new Error('Server failed to start within timeout period');
    }
    startPingCheck() {
        this.pingInterval = setInterval(async () => {
            try {
                const response = await axios_1.default.get(`http://localhost:${this.serverPort}/api/sessions`);
                const sessions = response.data.map((s) => ({
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
            }
            catch (error) {
                console.error('Failed to fetch sessions:', error);
            }
        }, 5000); // Check every 5 seconds
    }
    stopPingCheck() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    // TypeScript event emitter overrides for type safety
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
}
exports.VibeTunnelServerManager = VibeTunnelServerManager;
exports.default = VibeTunnelServerManager;
//# sourceMappingURL=serverManager.js.map