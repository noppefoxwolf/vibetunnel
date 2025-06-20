# Cross-Compilation Guide for VibeTunnel

This guide explains how to build VibeTunnel server binaries for different platforms.

## Go Binaries

Go cross-compilation works out of the box. Simply set `GOOS` and `GOARCH`:

```bash
# From macOS to Linux
GOOS=linux GOARCH=amd64 go build

# From macOS to Windows
GOOS=windows GOARCH=amd64 go build
```

## Rust Binaries

Rust cross-compilation requires additional setup due to native dependencies (OpenSSL).

### Option 1: Use cargo-cross (Recommended)

Install cargo-cross which uses Docker for cross-compilation:

```bash
cargo install cross
```

Then build:

```bash
# Build for Linux from macOS
cross build --release --target x86_64-unknown-linux-gnu

# Build for Windows from macOS
cross build --release --target x86_64-pc-windows-gnu
```

### Option 2: Use Docker Directly

```bash
# Build Linux binary from macOS
docker run --rm \
  -v "$PWD":/workspace \
  -w /workspace \
  rust:latest \
  cargo build --release

# The binary will be in target/release/tty-fwd
```

### Option 3: Native Cross-Compilation (Advanced)

For native cross-compilation without Docker, you need:

1. Install target toolchains:
```bash
rustup target add x86_64-unknown-linux-gnu
rustup target add x86_64-pc-windows-gnu
```

2. Install cross-compilation tools:
```bash
# On macOS with Homebrew
brew install FiloSottile/musl-cross/musl-cross
brew install mingw-w64
```

3. Configure cargo for cross-compilation:
Create `~/.cargo/config.toml`:
```toml
[target.x86_64-unknown-linux-gnu]
linker = "x86_64-linux-musl-gcc"

[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
```

## Quick Commands

Build all binaries for current platform:
```bash
npm run build:server
```

Build binaries for all platforms (with cross-compilation setup):
```bash
npm run build:binaries
```

Build everything including Electron packages:
```bash
npm run build:all
```

## CI/CD Recommendation

For production builds, use GitHub Actions or another CI/CD system that can build natively on each target platform. This avoids cross-compilation complexity and ensures optimal binaries.

Example GitHub Actions workflow:
```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
runs-on: ${{ matrix.os }}
```