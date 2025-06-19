#!/bin/bash

# Build script for tty-fwd server binaries
# This script should be run from the electron directory

set -e

echo "Building tty-fwd server binaries..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the electron directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: This script must be run from the electron directory${NC}"
    exit 1
fi

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed. Please install from https://rustup.rs/${NC}"
    exit 1
fi

# Get the current platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo "Detected platform: $PLATFORM $ARCH"

# Navigate to the parent directory where Rust project should be
cd ..

# Check if Cargo.toml exists
if [ ! -f "Cargo.toml" ]; then
    echo -e "${YELLOW}Warning: Cargo.toml not found in parent directory${NC}"
    echo "Looking for tty-fwd project..."
    
    # Try to find tty-fwd directory
    if [ -d "tty-fwd" ] && [ -f "tty-fwd/Cargo.toml" ]; then
        cd tty-fwd
    else
        echo -e "${RED}Error: Cannot find tty-fwd Rust project${NC}"
        exit 1
    fi
fi

# Build for the current platform
case "$PLATFORM" in
    Darwin)
        if [ "$ARCH" = "arm64" ]; then
            echo "Building for macOS ARM64..."
            cargo build --release --target aarch64-apple-darwin
            cp target/aarch64-apple-darwin/release/tty-fwd electron/bin/darwin-arm64/
            echo -e "${GREEN}✓ Built for macOS ARM64${NC}"
        else
            echo "Building for macOS x64..."
            cargo build --release --target x86_64-apple-darwin
            cp target/x86_64-apple-darwin/release/tty-fwd electron/bin/darwin-x64/
            echo -e "${GREEN}✓ Built for macOS x64${NC}"
        fi
        ;;
    Linux)
        echo "Building for Linux x64..."
        cargo build --release --target x86_64-unknown-linux-gnu
        cp target/x86_64-unknown-linux-gnu/release/tty-fwd electron/bin/linux-x64/
        echo -e "${GREEN}✓ Built for Linux x64${NC}"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        echo "Building for Windows x64..."
        cargo build --release --target x86_64-pc-windows-msvc
        cp target/x86_64-pc-windows-msvc/release/tty-fwd.exe electron/bin/win32-x64/
        echo -e "${GREEN}✓ Built for Windows x64${NC}"
        ;;
    *)
        echo -e "${RED}Error: Unsupported platform $PLATFORM${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}Build completed successfully!${NC}"

# Return to electron directory
cd electron

# Make sure the binary is executable (on Unix systems)
if [ "$PLATFORM" != "MINGW" ] && [ "$PLATFORM" != "MSYS" ] && [ "$PLATFORM" != "CYGWIN" ]; then
    chmod +x bin/*/*
fi

echo "You can now run: npm start"