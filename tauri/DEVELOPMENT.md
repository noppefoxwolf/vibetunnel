# VibeTunnel Tauri App Development

This is the cross-platform desktop version of VibeTunnel built with Tauri v2.

## Prerequisites

- Node.js 18+ and npm
- Rust 1.70+
- Platform-specific requirements:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`
  - **Windows**: Microsoft C++ Build Tools

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the frontend assets:
```bash
npm run bundle
```

## Development

Run the app in development mode:
```bash
npm run dev
```

This will:
- Build the frontend assets
- Watch for changes
- Start the Tauri development server

## Building

Build for production:
```bash
npm run build
```

This creates platform-specific binaries in `src-tauri/target/release/bundle/`.

## Features

The Tauri app includes:
- System tray integration
- Terminal session management
- Server management (start/stop/restart)
- ngrok tunnel support
- Auto-launch at login
- Settings management
- CLI tool installation (`vt` command)
- Cross-platform support (macOS, Linux, Windows)

## Architecture

- **Frontend**: Web-based UI using Lit, Tailwind CSS
- **Backend**: Rust with Tauri v2
- **Server**: Embedded HTTP server with WebSocket support
- **Terminal**: PTY-based terminal sessions

## Key Differences from Web Version

- Runs as a native desktop application
- System tray integration
- Local server management
- Native file system access
- Platform-specific features (auto-launch, CLI tools)

## Debugging

1. Check the developer console in the app window
2. Enable debug mode in settings for additional logging
3. Check Rust logs in the terminal when running `npm run dev`

## Release Process

1. Update version in `package.json` and `src-tauri/Cargo.toml`
2. Build release binaries: `npm run build`
3. Test on target platforms
4. Create GitHub release with binaries