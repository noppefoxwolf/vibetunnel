# Build Notes for VibeTunnel Electron App

## Native Cross-Compilation Setup

Native cross-compilation has been set up for building server binaries from macOS to other platforms.

### What Works

✅ **Go binaries** - Cross-compilation works perfectly for all platforms:
- macOS (arm64, x64)
- Linux (x64)
- Windows (x64)

✅ **Rust binaries for macOS** - Native compilation works perfectly

✅ **Rust binaries for Linux** - Cross-compilation from macOS to Linux works using musl target:
- Uses `x86_64-unknown-linux-musl` target for static linking
- Avoids OpenSSL dependency issues
- Produces statically linked binaries

❌ **Rust binaries for Windows** - tty-fwd contains Unix-specific code (PTY, signals). Windows builds are skipped.

### Setup Requirements

1. **Cross-compilation tools installed**:
   ```bash
   brew install FiloSottile/musl-cross/musl-cross mingw-w64
   ```

2. **Rust targets installed**:
   ```bash
   rustup target add x86_64-unknown-linux-musl x86_64-pc-windows-gnu
   ```

3. **Cargo configuration** (`~/.cargo/config.toml`):
   - Configured to use musl-gcc for Linux targets
   - Windows builds are skipped (Unix-only code)

### Build Commands

**All platforms (where supported)**:
```bash
npm run build:binaries
```

**Current platform only**:
```bash
npm run build:server
```

**Full distribution build**:
```bash
npm run build:all
```

### Platform Support Summary

| Server | macOS | Linux | Windows |
|--------|-------|-------|---------|
| Go (vibetunnel) | ✅ | ✅ | ✅ |
| Rust (tty-fwd) | ✅ | ✅ | ❌ |

### Windows Users

Windows users should use the Go server implementation (`vibetunnel`) as the Rust server (`tty-fwd`) contains Unix-specific code for pseudo-terminals that doesn't exist on Windows.

### Troubleshooting

If cross-compilation fails:
1. Use Docker with cargo-cross: `./scripts/build-with-cross.sh`
2. Build on native platforms using CI/CD
3. Use pre-built binaries from releases