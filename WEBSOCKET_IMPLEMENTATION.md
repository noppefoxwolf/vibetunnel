# WebSocket Implementation for VibeTunnel

## Problem
The HTTP server was experiencing thread exhaustion due to each Server-Sent Events (SSE) connection holding a thread while waiting for terminal output data. The issue was occurring in the Swift server which was still serving SSE endpoints even after adding WebSocket support to the TypeScript server.

## Solution
1. Converted from SSE to WebSocket for terminal data streaming, which uses event-driven I/O instead of blocking threads
2. Updated the web UI to use the TypeScript server (port 3000) for all API calls and WebSocket connections
3. Disabled the SSE endpoint in the Swift server to prevent thread exhaustion

## Changes Made

### TypeScript Server (`web/src/server.ts`)

1. **Added WebSocket support**:
   - Added WebSocket connection handler for terminal sessions
   - Each session can have multiple WebSocket clients
   - WebSocket messages are multiplexed by session ID

2. **WebSocket Message Protocol**:
   ```typescript
   // Client to Server
   { type: 'input', text: string }
   
   // Server to Client
   { type: 'header', data: {...} }      // Terminal header info
   { type: 'output', data: [...] }       // Terminal output
   { type: 'error', message: string }    // Error messages
   { type: 'session_ended' }             // Session terminated
   ```

3. **Session streaming**:
   - Tail process monitors `stream-out` file for each session
   - New content is broadcast to all connected WebSocket clients
   - Process monitoring detects when sessions end

### TypeScript Client

1. **Added configuration** (`web/src/client/config.ts`):
   - Centralized API and WebSocket URLs to use TypeScript server (port 3000)
   - All components now use this configuration for consistency

2. **Updated all components to use TypeScript server**:
   - `session-view.ts`: WebSocket connections and session status checks
   - `session-list.ts`: Session management API calls
   - `session-create-form.ts`: Session creation
   - `file-browser.ts`: File system browsing
   - `app.ts`: Session listing

3. **WebSocket integration** in `session-view.ts`:
   - Connects via WebSocket when viewing running sessions
   - Falls back to snapshot API for ended sessions
   - Sends input commands via WebSocket instead of HTTP POST
   - Custom driver feeds WebSocket data to AsciinemaPlayer

### Swift Server (`VibeTunnel/Core/Services/TunnelServer.swift`)

1. **Disabled SSE endpoint**:
   - Commented out `/api/sessions/:sessionId/stream` route
   - This prevents the Swift server from creating threads for SSE connections

## Testing

1. Start the TypeScript server:
   ```bash
   cd web
   npm run dev
   ```

2. Create a test session:
   ```bash
   curl -X POST http://localhost:3000/api/sessions \
     -H "Content-Type: application/json" \
     -d '{"command": ["bash"], "workingDir": "~"}'
   ```

3. Open the test page: http://localhost:3000/test-websocket.html

4. Or use the main UI which now uses WebSocket automatically

## Benefits

- **No thread blocking**: WebSocket uses event-driven I/O
- **Better scalability**: Can handle many more concurrent sessions
- **Real-time updates**: Lower latency than SSE
- **Bidirectional communication**: Input and output on same connection
- **Resource efficiency**: Single connection per client instead of separate connections for input/output

## Architecture

```
┌─────────────────┐                    ┌──────────────────┐
│  Swift App      │  serves web UI     │  Web Browser     │
│  Server (:4020) │ ────────────────→  │                  │
└─────────────────┘                    └──────────────────┘
                                               │
                                               │ WebSocket + API calls
                                               ↓
                                        ┌──────────────────┐
                                        │  TypeScript      │
                                        │  Server (:3000)  │
                                        └──────────────────┘
                                               │
                                               │ spawn/monitor
                                               ↓
                                        ┌──────────────────┐
                                        │   tty-fwd        │
                                        │  (terminal       │
                                        │   sessions)      │
                                        └──────────────────┘
```

**Key Changes:**
- Swift server (port 4020) only serves static web UI files
- Web UI connects directly to TypeScript server (port 3000) for all dynamic content
- TypeScript server handles both WebSocket connections and REST API calls
- No more SSE connections that block threads

## Next Steps

1. Remove old SSE endpoints after confirming WebSocket stability
2. Add WebSocket connection pooling if needed
3. Implement reconnection logic for dropped connections
4. Add compression for large terminal outputs