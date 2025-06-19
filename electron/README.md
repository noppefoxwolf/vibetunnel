# VibeTunnel Electron App

Cross-platform desktop application for VibeTunnel - Turn any browser into a terminal.

## Features

- **Cross-platform**: Works on Windows, macOS, and Linux
- **System tray integration**: Runs in the background with quick access
- **Web-based terminal**: Access terminals through any web browser
- **Session recording**: All sessions recorded in asciinema format
- **Secure access options**: Localhost, network with password, or remote via ngrok
- **Auto-updates**: Built-in automatic update system

## Development

### Prerequisites

- Node.js 20.0 or higher
- npm or yarn
- Platform-specific build tools:
  - **Windows**: Windows Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: build-essential

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Start the app
npm start
```

### Building

```bash
# Build for all platforms
npm run build

# Build for specific platforms
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## Architecture

- **Main Process** (`src/main/`): Handles system integration, server management, and window lifecycle
- **Renderer Process** (`src/renderer/`): UI components for settings, welcome flow, and dashboard
- **Preload Scripts** (`src/preload/`): Secure bridge between main and renderer processes
- **Server Integration**: Manages the Rust-based `tty-fwd` server for terminal forwarding

## Platform-Specific Features

### Windows
- Windows Terminal, PowerShell, and Command Prompt support
- NSIS installer with start menu shortcuts
- Portable version available

### macOS  
- Menu bar integration with optional dock icon
- Automation permissions for terminal control
- DMG installer with drag-to-Applications

### Linux
- System tray support for major desktop environments
- AppImage, DEB, and RPM packages
- Auto-detection of installed terminal emulators

## Configuration

Settings are stored using `electron-store` in platform-specific locations:
- **Windows**: `%APPDATA%/VibeTunnel`
- **macOS**: `~/Library/Application Support/VibeTunnel`
- **Linux**: `~/.config/VibeTunnel`

## License

MIT