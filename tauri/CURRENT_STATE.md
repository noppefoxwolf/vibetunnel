# Tauri App Current State

## Overview

This folder contains the Tauri desktop application for VibeTunnel. The structure has been cleaned up to remove web-server-specific code that doesn't belong in a Tauri application.

## What's Been Cleaned Up

### Removed Files:
1. **Server-side Node.js code**:
   - `src/server.ts` - Express server
   - `src/terminal-manager.ts` - Server-side terminal management
   - `src/stream-watcher.ts` - Server event streaming
   - `src/fwd.ts` - CLI tool

2. **PTY management** (handled by Tauri's Rust backend):
   - Entire `src/pty/` directory

3. **Test files**:
   - Entire `src/test/` directory
   - `test-terminals-entry.ts`
   - Test HTML and cast files

4. **Web-specific components**:
   - `vibe-terminal-buffer.ts` - WebSocket-based terminal buffer
   - `buffer-subscription-service.ts` - WebSocket subscription service

## Current Structure

### Backend (src-tauri/)
- Complete Rust implementation using Tauri v2
- Terminal management via portable-pty
- HTTP server with Axum
- Settings management
- System tray integration
- ngrok support
- Auto-launch functionality

### Frontend (src/client/)
- Lit-based components
- Tailwind CSS styling
- **Note**: Currently uses direct HTTP/fetch calls instead of Tauri commands

## Important Note

The frontend code still needs significant refactoring to properly integrate with Tauri:
- Replace all `fetch()` calls with Tauri command invocations
- Use `TauriService` for all backend communication
- Remove direct API endpoint references
- Implement proper Tauri event handling

## Next Steps

To make this a fully functional Tauri app:

1. Update all components to use `@tauri-apps/api` invoke commands
2. Replace HTTP API calls with Tauri commands
3. Implement proper state management for desktop app
4. Add desktop-specific features (keyboard shortcuts, native menus, etc.)

## Building

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
```

The Tauri backend is feature-complete, but the frontend needs adaptation to properly communicate with it.