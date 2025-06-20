# Tauri Build Guide

## What is Tauri?

Tauri is a framework for building native desktop applications with web technologies. It combines a Rust backend with a web frontend (HTML, CSS, JavaScript/TypeScript) to create lightweight, secure, and performant desktop apps. Unlike Electron, which bundles Chromium, Tauri uses the system's native webview, resulting in much smaller app sizes (typically 10-150MB vs 50-150MB for Electron).

### Key Architecture Components

1. **Frontend**: Your web application (HTML/CSS/JS) - in this project, it's built with Lit components and TypeScript
2. **Backend**: Rust code that handles system operations, file access, and native functionality
3. **IPC Bridge**: Secure communication channel between frontend and backend using Tauri's command system
4. **WebView**: Native system webview (WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux)

## Prerequisites

### All Platforms
- **Node.js** (v18 or later) and npm
- **Rust** (latest stable version)
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  ```

### Platform-Specific Requirements

#### macOS
- Xcode Command Line Tools
  ```bash
  xcode-select --install
  ```
- macOS 10.15 (Catalina) or later

#### Windows
- Microsoft Visual Studio C++ Build Tools or Visual Studio 2022
- WebView2 (usually pre-installed on Windows 10/11)
- Windows 10 version 1803 or later

#### Linux
- Development libraries:
  ```bash
  # Ubuntu/Debian
  sudo apt update
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev

  # Fedora
  sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file gcc libappindicator-gtk3-devel librsvg2-devel

  # Arch
  sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg
  ```

## Building the Application

### Development Build

1. **Clone and setup the project**
   ```bash
   git clone <repository>
   cd vibetunnel3/web
   npm install
   ```

2. **Run in development mode**
   ```bash
   npm run tauri:dev
   ```
   This will:
   - Build the frontend assets (via `npm run bundle`)
   - Start the Rust backend in development mode
   - Open the app window with hot-reload enabled

### Production Builds

#### macOS

1. **Build the app**
   ```bash
   cd web
   npm run tauri:build
   ```

2. **Output locations**
   - `.dmg` installer: `src-tauri/target/release/bundle/dmg/`
   - `.app` bundle: `src-tauri/target/release/bundle/macos/`

3. **Code signing (optional)**
   - Set up your Apple Developer account
   - Configure signing in `tauri.conf.json`:
     ```json
     "macOS": {
       "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
       "providerShortName": "TEAM_ID"
     }
     ```

#### Windows

1. **Build the app**
   ```bash
   cd web
   npm run tauri:build
   ```

2. **Output locations**
   - `.msi` installer: `src-tauri/target/release/bundle/msi/`
   - `.exe` executable: `src-tauri/target/release/`

3. **Code signing (optional)**
   - Obtain a code signing certificate
   - Configure in `tauri.conf.json`:
     ```json
     "windows": {
       "certificateThumbprint": "YOUR_CERT_THUMBPRINT"
     }
     ```

#### Linux

1. **Build the app**
   ```bash
   cd web
   npm run tauri:build
   ```

2. **Output locations**
   - `.deb` package: `src-tauri/target/release/bundle/deb/`
   - `.AppImage`: `src-tauri/target/release/bundle/appimage/`
   - Binary executable: `src-tauri/target/release/`

### Cross-Platform Building

While Tauri supports cross-compilation in theory, it's recommended to build on each target platform natively for best results. For CI/CD:

- **GitHub Actions**: Use platform-specific runners
- **Local cross-compilation**: Possible but complex due to native dependencies

## Build Configuration

### Key Files

1. **`tauri.conf.json`** - Main Tauri configuration
   - App metadata (name, version, identifier)
   - Window settings
   - Build commands
   - Platform-specific settings

2. **`Cargo.toml`** - Rust dependencies and metadata
   - Tauri version and features
   - Platform-specific dependencies
   - Build optimizations

3. **`package.json`** - Frontend build configuration
   - Build scripts
   - Tauri CLI commands

### Customizing Builds

#### App Icons
Place icons in `src-tauri/icons/`:
- `icon.icns` - macOS
- `icon.ico` - Windows
- `32x32.png`, `128x128.png`, etc. - Linux

#### Bundle Settings
Configure in `tauri.conf.json`:
```json
"bundle": {
  "active": true,
  "targets": "all",  // or ["deb", "appimage", "msi", "app", "dmg"]
  "identifier": "com.yourcompany.app",
  "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
}
```

## Troubleshooting

### Common Issues

1. **"Rust not found"**
   - Ensure Rust is in your PATH: `source $HOME/.cargo/env`

2. **Build fails on Linux**
   - Install all required system libraries (see Linux prerequisites)

3. **WebView2 issues on Windows**
   - Download and install WebView2 Runtime manually

4. **Code signing errors on macOS**
   - Check your Developer ID and entitlements
   - Ensure `entitlements.plist` exists and is properly configured

### Debug Builds

For debugging with more verbose output:
```bash
RUST_BACKTRACE=1 npm run tauri:build -- --debug
```

## Performance Optimization

The release build is already optimized with:
- Link-time optimization (LTO)
- Single codegen unit
- Strip symbols
- Size optimization

See `Cargo.toml` [profile.release] section for details.

## Distribution

### Auto-Updates
Tauri supports auto-updates via the `tauri-plugin-updater`. Configure update endpoints in your app.

### App Stores
- **Mac App Store**: Requires additional entitlements and sandboxing
- **Microsoft Store**: Package as MSIX
- **Linux**: Distribute via Flatpak, Snap, or traditional packages

## Additional Resources

- [Tauri Documentation](https://tauri.app/docs/)
- [Tauri GitHub](https://github.com/tauri-apps/tauri)
- [Rust Documentation](https://doc.rust-lang.org/)