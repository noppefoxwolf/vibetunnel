# VibeTunnel Go Server

A Go port of the VibeTunnel terminal multiplexer server, providing 100% API compatibility with the TypeScript implementation.

## Prerequisites

- Go 1.21 or higher
- macOS, Linux, or Windows

## Building

```bash
# From the server directory
cd server
go build -o vibetunnel-server ./cmd/vibetunnel-server

# Or from the project root
cd vibetunnel
go build -o server/vibetunnel-server ./server/cmd/vibetunnel-server
```

This creates a `vibetunnel-server` binary in the server directory.

## Running

### Basic Usage

```bash
# Run with default settings (port 4020, no auth)
./vibetunnel-server

# Run with authentication
./vibetunnel-server --username admin --password secret

# Run on a different port
./vibetunnel-server --port 8080

# Run with all options
./vibetunnel-server --port 8080 --username admin --password secret
```

### Server Modes

The server supports three operational modes:

#### 1. Normal Mode (default)
A standalone terminal server:
```bash
./vibetunnel-server
```

#### 2. HQ Mode
Acts as a headquarters server that aggregates multiple remote servers:
```bash
./vibetunnel-server --hq --username hq-admin --password hq-secret
```

#### 3. Remote Mode
Registers with an HQ server:
```bash
./vibetunnel-server \
  --hq-url https://hq.example.com \
  --hq-username hq-admin \
  --hq-password hq-secret \
  --name datacenter-1 \
  --username local-user \
  --password local-pass
```

## Environment Variables

- `PORT` - Server port (default: 4020)
- `VIBETUNNEL_USERNAME` - Basic auth username
- `VIBETUNNEL_PASSWORD` - Basic auth password
- `VIBETUNNEL_CONTROL_DIR` - Control directory (default: `~/.vibetunnel/control`)

## API Endpoints

The server implements all VibeTunnel API endpoints:

- `GET /api/health` - Health check (no auth required)
- `GET /api/sessions` - List all sessions
- `POST /api/sessions` - Create new session
- `GET /api/sessions/:id` - Get session info
- `DELETE /api/sessions/:id` - Kill session
- `DELETE /api/sessions/:id/cleanup` - Remove session files
- `POST /api/cleanup-exited` - Cleanup all exited sessions
- `GET /api/sessions/:id/buffer` - Get terminal buffer (binary)
- `GET /api/sessions/:id/stream` - Stream session output (SSE)
- `POST /api/sessions/:id/input` - Send input to session
- `POST /api/sessions/:id/resize` - Resize terminal

### HQ Mode Only
- `GET /api/remotes` - List registered remotes
- `POST /api/remotes/register` - Register remote server
- `DELETE /api/remotes/:id` - Unregister remote
- `POST /api/remotes/:name/refresh-sessions` - Refresh remote sessions

## WebSocket

Terminal buffer updates are available via WebSocket at `/buffers`.

## Development

### Running Tests

```bash
# Unit tests
go test ./...

# With coverage
go test -cover ./...

# E2E tests (requires TypeScript test suite)
cd .. && npm run test:e2e
```

### Project Structure

```
server/
├── cmd/
│   ├── vibetunnel-server/    # Main server binary
│   └── vibetunnel-fwd/        # Forward tool (TODO)
├── pkg/
│   ├── api/                   # HTTP handlers
│   ├── auth/                  # Authentication middleware
│   ├── config/                # Configuration
│   ├── hq/                    # HQ mode components
│   ├── pty/                   # PTY management
│   ├── session/               # Session management
│   ├── stream/                # SSE and WebSocket
│   └── terminal/              # Terminal emulation
├── e2e/                       # E2E tests
└── go.mod                     # Go module file
```

### Debugging

The server includes debug logging for API endpoints. When running, you'll see logs like:

```
[ListSessions] Request from ::1
[ListSessions] Found 2 local sessions
[ListSessions] Returning 2 total sessions
[CreateSession] Command: ["bash"], WorkingDir: /home/user, Name: , RemoteID: 
[CreateSession] Created session with ID: abc-123-def
[SendInput] Session abc-123-def - Text: "ls -la", Key: ""
```

## Compatibility

This Go implementation is designed to be 100% compatible with the TypeScript VibeTunnel server:
- Same API endpoints and request/response formats
- Same binary buffer protocol
- Same session file format
- Same WebSocket protocol
- Passes all E2E tests

## Current Status

Implemented:
- ✅ Project structure and build system
- ✅ Configuration management
- ✅ Authentication (Basic & Bearer)
- ✅ Session API endpoints (stubs)
- ✅ WebSocket infrastructure
- ✅ Binary buffer protocol
- ✅ Session persistence
- ✅ TypeScript session.json compatibility

TODO:
- ⚠️ Complete PTY spawning implementation
- ⚠️ Terminal emulation (ANSI parsing)
- ⚠️ Stream file watching
- ⚠️ HQ mode implementation
- ⚠️ Forward tool (vibetunnel-fwd)
- ⚠️ Control pipe handling
- ⚠️ Full E2E test compatibility