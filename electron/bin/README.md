# Server Binaries

This directory should contain the platform-specific `tty-fwd` server binaries.

## Directory Structure

```
bin/
├── darwin-x64/      # macOS Intel
│   └── tty-fwd
├── darwin-arm64/    # macOS Apple Silicon
│   └── tty-fwd
├── win32-x64/       # Windows 64-bit
│   └── tty-fwd.exe
└── linux-x64/       # Linux 64-bit
    └── tty-fwd
```

## Building the Server

The `tty-fwd` server needs to be built from the Rust source code located in the main project.

### Prerequisites
- Rust toolchain (install from https://rustup.rs/)
- Target architectures installed

### Build Commands

```bash
# macOS Intel
cargo build --release --target x86_64-apple-darwin
cp target/x86_64-apple-darwin/release/tty-fwd electron/bin/darwin-x64/

# macOS ARM64
cargo build --release --target aarch64-apple-darwin
cp target/aarch64-apple-darwin/release/tty-fwd electron/bin/darwin-arm64/

# Windows
cargo build --release --target x86_64-pc-windows-msvc
cp target/x86_64-pc-windows-msvc/release/tty-fwd.exe electron/bin/win32-x64/

# Linux
cargo build --release --target x86_64-unknown-linux-gnu
cp target/x86_64-unknown-linux-gnu/release/tty-fwd electron/bin/linux-x64/
```

## Important Notes

- These binaries are NOT checked into version control
- They must be built before packaging the Electron app
- The Electron app will look for these binaries at runtime
- Make sure binaries have executable permissions on Unix systems