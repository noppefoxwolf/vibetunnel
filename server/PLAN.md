# VibeTunnel Go Server Port Plan

This plan outlines the approach for porting the VibeTunnel Node.js/TypeScript server to Go while maintaining 100% API compatibility and passing all E2E tests.

## Allowed Divergence

1. **Static file serving path configuration**: The Go server accepts a `--static` flag to specify the static files directory (default: `./public`), while the TypeScript version hardcodes `path.join(process.cwd(), 'public')`. This allows more flexibility in deployment.

## Overview

The port will create a fully compatible Go implementation of:
1. The VibeTunnel server (all three modes: normal, HQ, remote)
2. The forward tool (fwd.ts equivalent)
3. All API endpoints and protocols
4. Binary buffer encoding/decoding
5. WebSocket and SSE streaming
6. Distributed architecture support

## Phase 1: Project Setup & Core Infrastructure

### [ ] 1.1 Project Structure
- [ ] Create `go.mod` with module name `github.com/user/vibetunnel`
- [ ] Set up directory structure:
  ```
  server/
  ├── cmd/
  │   ├── vibetunnel-server/    # Main server binary
  │   └── vibetunnel-fwd/        # Forward tool binary
  ├── pkg/
  │   ├── auth/                  # Authentication middleware
  │   ├── config/                # Configuration management
  │   ├── api/                   # HTTP handlers and routes
  │   ├── pty/                   # PTY management
  │   ├── session/               # Session management
  │   ├── terminal/              # Terminal emulation and encoding
  │   ├── stream/                # SSE and WebSocket streaming
  │   ├── hq/                    # HQ mode components
  │   └── protocol/              # Binary protocols
  ├── internal/
  │   └── testutil/              # Test utilities
  └── e2e/                       # E2E tests
  ```

### [ ] 1.2 Core Dependencies
- [ ] Add essential dependencies:
  ```
  github.com/gin-gonic/gin         # Web framework
  github.com/creack/pty            # PTY support
  github.com/gorilla/websocket     # WebSocket
  github.com/fsnotify/fsnotify     # File watching
  github.com/google/uuid           # UUID generation
  github.com/spf13/cobra           # CLI framework
  github.com/spf13/viper           # Configuration
  ```

### [ ] 1.3 Configuration Management
- [ ] Implement config structure matching TypeScript:
  - CLI argument parsing
  - Environment variable support
  - Default values
  - Validation

## Phase 2: Authentication & Middleware

### [ ] 2.1 Authentication Middleware
- [ ] Implement Basic Auth validation
- [ ] Implement Bearer token validation
- [ ] Health endpoint bypass
- [ ] Proper WWW-Authenticate headers
- [ ] HQ mode vs Remote mode logic

### [ ] 2.2 Request Logging & Error Handling
- [ ] Request/response logging middleware
- [ ] Consistent error response format
- [ ] Panic recovery middleware

## Phase 3: PTY and Session Management

### [ ] 3.1 PTY Manager
- [ ] PTY process spawning with creack/pty
- [ ] Session state tracking
- [ ] Input/output handling
- [ ] Resize operations
- [ ] Process termination (SIGTERM→SIGKILL)
- [ ] Control pipe support

### [ ] 3.2 Session Manager
- [ ] File system persistence in ~/.vibetunnel/control/
- [ ] Session metadata (session.json)
- [ ] Session listing and filtering
- [ ] Zombie process detection
- [ ] External session discovery

### [ ] 3.3 Control Directory Watcher
- [ ] Monitor control directory for changes
- [ ] Handle external session creation
- [ ] Process control messages

## Phase 4: Terminal Emulation & Binary Protocol

### [x] 4.1 Terminal Manager
- [x] Terminal state management (using vt10x)
- [x] ANSI escape sequence processing (via vt10x)
- [x] Buffer management and scrollback
- [x] Cursor tracking

### [x] 4.2 Binary Buffer Protocol
- [x] Implement encoder matching TypeScript format:
  - 32-byte header
  - Row encoding (0xFE empty, 0xFD content)
  - Cell encoding with type bytes
  - Color and attribute support
- [x] Implement decoder for testing
- [x] Optimize for performance

### [x] 4.3 Buffer Change Notifications
- [x] Debounced notification system
- [x] Efficient change detection

## Phase 5: API Endpoints

### [x] 5.1 Session Endpoints
- [x] GET /api/sessions - List sessions
- [x] POST /api/sessions - Create session
- [x] GET /api/sessions/:id - Get session info
- [x] DELETE /api/sessions/:id - Kill session
- [x] DELETE /api/sessions/:id/cleanup - Cleanup files
- [x] POST /api/cleanup-exited - Cleanup all exited

### [x] 5.2 Session Interaction Endpoints
- [x] GET /api/sessions/:id/buffer - Binary buffer
- [x] GET /api/sessions/:id/stream - SSE stream
- [x] POST /api/sessions/:id/input - Send input
- [x] POST /api/sessions/:id/resize - Resize terminal

### [x] 5.3 Remote Endpoints (HQ Mode)
- [x] GET /api/remotes - List remotes
- [x] POST /api/remotes/register - Register remote
- [x] DELETE /api/remotes/:id - Unregister
- [x] POST /api/remotes/:name/refresh-sessions - Refresh

### [x] 5.4 Health Endpoint
- [x] GET /api/health - Server health check

## Phase 6: Real-time Communication

### [x] 6.1 WebSocket Server
- [x] WebSocket upgrade handler at /buffers
- [x] Connection management
- [x] Subscription protocol (subscribe/unsubscribe)
- [x] Binary message format (0xBF prefix)
- [x] Ping/pong keepalive
- [x] Client cleanup on disconnect

### [x] 6.2 SSE Streaming
- [x] Asciinema v2 format support
- [x] Stream file watching
- [x] Client connection management
- [x] Heartbeat mechanism
- [x] Proper SSE headers

### [x] 6.3 Stream Watcher
- [x] Monitor asciinema stream files
- [x] Incremental reading
- [x] Parse events and timestamps

## Phase 7: HQ Mode & Distributed Architecture

### [x] 7.1 Remote Registry (HQ Mode)
- [x] Remote server tracking
- [x] Health checking (15s interval)
- [x] Session ownership mapping
- [x] Automatic cleanup on failure

### [x] 7.2 HQ Client (Remote Mode)
- [x] Registration with HQ server
- [x] Bearer token generation
- [x] Graceful unregistration
- [ ] Reconnection logic (not implemented - relies on restart)

### [ ] 7.3 Request Proxying
- [ ] Session request forwarding
- [ ] WebSocket connection proxying
- [ ] SSE stream proxying
- [ ] Authentication header injection

## Phase 8: Forward Tool

### [ ] 8.1 CLI Structure
- [ ] Command parsing
- [ ] --monitor-only flag
- [ ] Help text

### [ ] 8.2 Interactive Mode
- [ ] Terminal raw mode setup
- [ ] Stdin forwarding
- [ ] Terminal restoration

### [ ] 8.3 Monitoring Features
- [ ] Stream output reading
- [ ] Control pipe monitoring
- [ ] Signal handling

## Phase 9: Testing & Validation

### [ ] 9.1 Unit Tests
- [ ] Test each package thoroughly
- [ ] Mock external dependencies
- [ ] Achieve 80%+ coverage

### [ ] 9.2 Integration Tests
- [ ] Test component interactions
- [ ] Test file system operations
- [ ] Test process management

### [ ] 9.3 E2E Tests
- [ ] Port server-smoke.e2e.test.ts
- [ ] Port hq-mode.e2e.test.ts
- [ ] Ensure all tests pass
- [ ] Test against TypeScript client

### [ ] 9.4 Compatibility Testing
- [ ] Test with existing web UI
- [ ] Verify binary protocol compatibility
- [ ] Test all three server modes
- [ ] Cross-platform testing (Linux, macOS, Windows)

## Phase 10: Performance & Optimization

### [ ] 10.1 Profiling
- [ ] CPU profiling
- [ ] Memory profiling
- [ ] Goroutine leak detection

### [ ] 10.2 Optimizations
- [ ] Connection pooling for HQ mode
- [ ] Buffer reuse
- [ ] Efficient file watching

### [ ] 10.3 Benchmarking
- [ ] Compare with TypeScript implementation
- [ ] Load testing
- [ ] Concurrent session handling

## Implementation Order

1. **Week 1**: Project setup, configuration, authentication (Phases 1-2)
2. **Week 2**: PTY and session management (Phase 3)
3. **Week 3**: Terminal emulation and binary protocol (Phase 4)
4. **Week 4**: API endpoints implementation (Phase 5)
5. **Week 5**: Real-time communication (Phase 6)
6. **Week 6**: HQ mode and distributed features (Phase 7)
7. **Week 7**: Forward tool and testing (Phases 8-9)
8. **Week 8**: Performance optimization and final validation (Phase 10)

## Success Criteria

1. All E2E tests pass without modification
2. 100% API compatibility with TypeScript server
3. Binary protocol produces identical output
4. Web UI works without changes
5. Performance equal or better than TypeScript version
6. Cross-platform support (Linux, macOS, Windows)

## Notes

- Focus on exact compatibility first, optimize later
- Use existing Go code from the vibetunnel directory as reference
- Test frequently against the TypeScript implementation
- Keep the same directory structure for session data
- Maintain the same CLI interface