#!/usr/bin/env npx tsx --no-deprecation
/**
 * VibeTunnel Forward (fwd.ts)
 *
 * A simple command-line tool that spawns a PTY session and forwards it
 * using the VibeTunnel PTY infrastructure.
 *
 * Usage:
 *   npx tsx src/fwd.ts <command> [args...]
 *   npx tsx src/fwd.ts claude --resume
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { PtyManager } from './pty/index.js';

function showUsage() {
  console.log('VibeTunnel Forward (fwd.ts)');
  console.log('');
  console.log('Usage:');
  console.log('  npx tsx src/fwd.ts <command> [args...]');
  console.log('  npx tsx src/fwd.ts --monitor-only <command> [args...]');
  console.log('');
  console.log('Options:');
  console.log('  --monitor-only   Just create session and monitor, no interactive I/O');
  console.log('');
  console.log('Examples:');
  console.log('  npx tsx src/fwd.ts claude --resume');
  console.log('  npx tsx src/fwd.ts bash -l');
  console.log('  npx tsx src/fwd.ts python3 -i');
  console.log('  npx tsx src/fwd.ts --monitor-only long-running-command');
  console.log('');
  console.log('The command will be spawned in the current working directory');
  console.log('and managed through the VibeTunnel PTY infrastructure.');
}

export async function startVibeTunnelForward(args: string[]) {
  // Parse command line arguments
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showUsage();
    process.exit(0);
  }

  const monitorOnly = args[0] === '--monitor-only';
  const command = monitorOnly ? args.slice(1) : args;

  if (command.length === 0) {
    console.error('Error: No command specified');
    showUsage();
    process.exit(1);
  }

  const cwd = process.cwd();

  console.log(`Starting command: ${command.join(' ')}`);
  console.log(`Working directory: ${cwd}`);

  // Initialize PTY manager
  const controlPath = path.join(os.homedir(), '.vibetunnel', 'control');
  const ptyManager = new PtyManager(controlPath);

  try {
    // Create the session
    const sessionName = `fwd_${command[0]}_${Date.now()}`;
    console.log(`Creating session: ${sessionName}`);

    const result = await ptyManager.createSession(command, {
      sessionName,
      workingDir: cwd,
      term: process.env.TERM || 'xterm-256color',
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    });

    console.log(`Session created with ID: ${result.sessionId}`);

    // Track all intervals and streams for cleanup
    const intervals: NodeJS.Timeout[] = [];
    const streams: (fs.ReadStream | NodeJS.ReadWriteStream)[] = [];

    // Get session info
    const session = ptyManager.getSession(result.sessionId);
    if (!session) {
      throw new Error('Session not found after creation');
    }

    // Get direct access to PTY process for faster input and exit detection
    interface PtyProcess {
      write: (data: string) => void;
      onExit: (callback: (info: { exitCode: number; signal?: number }) => void) => void;
    }
    let directPtyProcess: PtyProcess | null = null;
    try {
      // Access internal sessions map from the ptyManager instance
      const ptyManagerWithSessions = ptyManager as unknown as {
        sessions?: Map<string, { ptyProcess?: PtyProcess }>;
      };
      const internalSession = ptyManagerWithSessions.sessions?.get(result.sessionId);
      directPtyProcess = internalSession?.ptyProcess || null;
      if (directPtyProcess) {
        console.log('Got direct PTY process access for faster input and exit detection');

        // Listen for PTY process exit directly for immediate response
        directPtyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
          console.log(`\n\nPTY process exited with code ${exitCode}, signal ${signal}`);

          // Clean up all intervals and streams immediately
          intervals.forEach((interval) => clearInterval(interval));
          streams.forEach((stream) => {
            try {
              if ('destroy' in stream && typeof stream.destroy === 'function') {
                stream.destroy();
              }
            } catch (_e) {
              // Ignore cleanup errors
            }
          });

          // Restore terminal settings
          if (!monitorOnly && process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          if (!monitorOnly) {
            process.stdin.pause();
          }

          process.exit(exitCode || 0);
        });
      } else {
        throw new Error('Could not access PTY process - fwd.ts requires node-pty implementation');
      }
    } catch (error) {
      console.error('Failed to get direct PTY access:', error);
      process.exit(1);
    }

    console.log(`PID: ${session.pid}`);
    console.log(`Status: ${session.status}`);
    console.log(`Stream output: ${session['stream-out']}`);
    console.log(`Input pipe: ${session.stdin}`);

    // Set up control FIFO for external commands (resize, etc.)
    const controlPath = path.join(path.dirname(session.stdin), 'control');
    try {
      // Create control pipe (FIFO on Unix, regular file on Windows)
      const isWindows = process.platform === 'win32';
      let useFifo = false;

      if (!fs.existsSync(controlPath)) {
        if (!isWindows) {
          const { spawnSync } = require('child_process');
          const result = spawnSync('mkfifo', [controlPath], { stdio: 'ignore' });
          if (result.status === 0) {
            useFifo = true;
          }
        }

        if (!useFifo) {
          // Fallback to regular file (Windows or if mkfifo fails)
          fs.writeFileSync(controlPath, '');
        }
      } else {
        // Check if existing file is a FIFO
        try {
          const stats = fs.statSync(controlPath);
          useFifo = stats.isFIFO();
        } catch (_e) {
          useFifo = false;
        }
      }

      // Update session info to include control pipe
      const sessionInfoPath = path.join(path.dirname(session.stdin), 'session.json');
      if (fs.existsSync(sessionInfoPath)) {
        const sessionInfo = JSON.parse(fs.readFileSync(sessionInfoPath, 'utf8'));
        sessionInfo.control = controlPath;
        fs.writeFileSync(sessionInfoPath, JSON.stringify(sessionInfo, null, 2));
      }

      console.log(`Control ${useFifo ? 'FIFO' : 'file'}: ${controlPath}`);

      if (useFifo) {
        // Unix FIFO approach
        const controlFd = fs.openSync(controlPath, 'r+');
        const controlStream = fs.createReadStream('', { fd: controlFd, encoding: 'utf8' });
        streams.push(controlStream);

        controlStream.on('data', (chunk: string | Buffer) => {
          const data = chunk.toString('utf8');
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = JSON.parse(line);
                handleControlMessage(message);
              } catch (_e) {
                console.warn('Invalid control message:', line);
              }
            }
          }
        });

        controlStream.on('error', (error) => {
          console.warn('Control FIFO stream error:', error);
        });

        controlStream.on('end', () => {
          console.log('Control FIFO stream ended');
        });

        // Clean up control stream on exit
        process.on('exit', () => {
          try {
            controlStream.destroy();
            fs.closeSync(controlFd);
            if (fs.existsSync(controlPath)) {
              fs.unlinkSync(controlPath);
            }
          } catch (_e) {
            // Ignore cleanup errors
          }
        });
      } else {
        // Windows/fallback polling approach
        let lastControlPosition = 0;
        const pollControl = () => {
          try {
            if (fs.existsSync(controlPath)) {
              const stats = fs.statSync(controlPath);
              if (stats.size > lastControlPosition) {
                const fd = fs.openSync(controlPath, 'r');
                const buffer = Buffer.allocUnsafe(stats.size - lastControlPosition);
                fs.readSync(fd, buffer, 0, buffer.length, lastControlPosition);
                fs.closeSync(fd);
                const data = buffer.toString('utf8');

                const lines = data.split('\n');
                for (const line of lines) {
                  if (line.trim()) {
                    try {
                      const message = JSON.parse(line);
                      handleControlMessage(message);
                    } catch (_e) {
                      console.warn('Invalid control message:', line);
                    }
                  }
                }

                lastControlPosition = stats.size;
              }
            }
          } catch (_error) {
            // Control file might be temporarily unavailable
          }
        };

        // Poll every 100ms on Windows
        const controlInterval = setInterval(pollControl, 100);
        intervals.push(controlInterval);
      }

      // Handle control messages
      const handleControlMessage = (message: Record<string, unknown>) => {
        if (
          message.cmd === 'resize' &&
          typeof message.cols === 'number' &&
          typeof message.rows === 'number'
        ) {
          console.log(`Received resize command: ${message.cols}x${message.rows}`);
          // Get current session from PTY service and resize if possible
          try {
            ptyManager.resizeSession(result.sessionId, message.cols, message.rows);
          } catch (error) {
            console.warn('Failed to resize session:', error);
          }
        } else if (message.cmd === 'kill') {
          const signal =
            typeof message.signal === 'string' || typeof message.signal === 'number'
              ? message.signal
              : 'SIGTERM';
          console.log(`Received kill command: ${signal}`);
          // The session monitoring will detect the exit and handle cleanup
          try {
            ptyManager.killSession(result.sessionId, signal);
          } catch (error) {
            console.warn('Failed to kill session:', error);
          }
        }
      };
    } catch (error) {
      console.warn('Failed to set up control pipe:', error);
    }

    if (monitorOnly) {
      console.log(`Monitor-only mode enabled\n`);
    } else {
      console.log(`Starting interactive session...\n`);

      // Set up raw mode for terminal input
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      // Forward stdin to PTY using direct access for maximum speed
      process.stdin.on('data', (data: string) => {
        try {
          directPtyProcess.write(data);
        } catch (error) {
          console.error('Failed to send input:', error);
        }
      });
    }

    // Also monitor the stdin FIFO for input from web server
    const stdinPath = session.stdin;
    if (stdinPath && fs.existsSync(stdinPath)) {
      console.log(`Monitoring stdin pipe: ${stdinPath}`);

      try {
        // Open FIFO for both read and write (like tty-fwd) to keep it open
        const stdinFd = fs.openSync(stdinPath, 'r+'); // r+ = read/write
        const stdinStream = fs.createReadStream('', { fd: stdinFd, encoding: 'utf8' });
        streams.push(stdinStream);

        stdinStream.on('data', (chunk: string | Buffer) => {
          const data = chunk.toString('utf8');
          try {
            // Forward data from web server to PTY
            ptyManager.sendInput(result.sessionId, { text: data });
          } catch (error) {
            console.error('Failed to forward stdin data to PTY:', error);
          }
        });

        stdinStream.on('error', (error) => {
          console.warn('Stdin FIFO stream error:', error);
        });

        stdinStream.on('end', () => {
          console.log('Stdin FIFO stream ended');
        });

        // Clean up on exit
        process.on('exit', () => {
          try {
            stdinStream.destroy();
            fs.closeSync(stdinFd);
          } catch (_e) {
            // Ignore cleanup errors
          }
        });
      } catch (error) {
        console.warn('Failed to set up stdin FIFO monitoring:', error);
      }
    }

    // Stream PTY output to stdout
    const streamOutput = session['stream-out'];
    console.log(`Waiting for output stream file: ${streamOutput}`);

    // Wait for the stream file to be created
    const waitForStreamFile = async (maxWait = 5000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWait) {
        if (streamOutput && fs.existsSync(streamOutput)) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    };

    const streamExists = await waitForStreamFile();
    if (!streamExists) {
      console.log('Warning: Stream output file not found, proceeding without real-time output');
    } else {
      console.log('Stream file found, starting output monitoring...');

      let lastPosition = 0;

      const readNewData = () => {
        try {
          if (!streamOutput || !fs.existsSync(streamOutput)) return;

          const stats = fs.statSync(streamOutput);
          if (stats.size > lastPosition) {
            const fd = fs.openSync(streamOutput, 'r');
            const buffer = Buffer.allocUnsafe(stats.size - lastPosition);
            fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
            fs.closeSync(fd);
            const chunk = buffer.toString('utf8');

            // Parse asciinema format and extract text content
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.trim()) {
                try {
                  const record = JSON.parse(line);
                  if (Array.isArray(record) && record.length >= 3 && record[1] === 'o') {
                    // This is an output record: [timestamp, 'o', text]
                    process.stdout.write(record[2]);
                  }
                } catch (_e) {
                  // If JSON parse fails, might be partial line, skip it
                }
              }
            }

            lastPosition = stats.size;
          }
        } catch (_error) {
          // File might be locked or temporarily unavailable
        }
      };

      // Start monitoring
      const streamInterval = setInterval(readNewData, 50);
      intervals.push(streamInterval);
    }

    // Set up signal handlers for graceful shutdown
    let shuttingDown = false;

    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;

      // Restore terminal settings (only if we were in interactive mode)
      if (!monitorOnly && process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      if (!monitorOnly) {
        process.stdin.pause();
      }

      console.log(`\n\nReceived ${signal}, checking session status...`);

      try {
        const currentSession = ptyManager.getSession(result.sessionId);
        if (currentSession && currentSession.status === 'running') {
          console.log('Session is still running. Leaving it active.');
          console.log(`Session ID: ${result.sessionId}`);
          console.log('You can reconnect to it later via the web interface.');
        } else {
          console.log('Session has exited.');
        }
      } catch (error) {
        console.error('Error checking session status:', error);
      }

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // No fallback monitoring needed - we always have direct PTY access

    // Keep the process alive
    await new Promise<void>((resolve) => {
      // This will keep running until the session exits or we get a signal
      process.on('exit', () => resolve());
    });
  } catch (error) {
    console.error('Failed to create or manage session:', error);

    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }

    process.exit(1);
  }
}
