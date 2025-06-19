#!/bin/bash

# Build script for server binaries (both Rust tty-fwd and Go vibetunnel)
# This script should be run from the electron directory

set -e

echo "Building server binaries..."

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

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go is not installed. Please install from https://go.dev/${NC}"
    exit 1
fi

# Get the current platform
PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo "Detected platform: $PLATFORM $ARCH"

# Save electron directory path
ELECTRON_DIR=$(pwd)

# Build Rust tty-fwd binary
echo -e "\n${YELLOW}Building Rust tty-fwd server...${NC}"
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

# Build Go vibetunnel binary
echo -e "\n${YELLOW}Building Go vibetunnel server...${NC}"
cd "$ELECTRON_DIR"/../linux

if [ ! -f "go.mod" ]; then
    echo -e "${RED}Error: Cannot find Go project in linux directory${NC}"
    exit 1
fi

# Build for the current platform
case "$PLATFORM" in
    Darwin)
        if [ "$ARCH" = "arm64" ]; then
            echo "Building Go server for macOS ARM64..."
            GOOS=darwin GOARCH=arm64 go build -o "$ELECTRON_DIR/bin/darwin-arm64/vibetunnel" ./cmd/vibetunnel
            echo -e "${GREEN}✓ Built Go server for macOS ARM64${NC}"
        else
            echo "Building Go server for macOS x64..."
            GOOS=darwin GOARCH=amd64 go build -o "$ELECTRON_DIR/bin/darwin-x64/vibetunnel" ./cmd/vibetunnel
            echo -e "${GREEN}✓ Built Go server for macOS x64${NC}"
        fi
        ;;
    Linux)
        echo "Building Go server for Linux x64..."
        GOOS=linux GOARCH=amd64 go build -o "$ELECTRON_DIR/bin/linux-x64/vibetunnel" ./cmd/vibetunnel
        echo -e "${GREEN}✓ Built Go server for Linux x64${NC}"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        echo "Building Go server for Windows x64..."
        GOOS=windows GOARCH=amd64 go build -o "$ELECTRON_DIR/bin/win32-x64/vibetunnel.exe" ./cmd/vibetunnel
        echo -e "${GREEN}✓ Built Go server for Windows x64${NC}"
        ;;
    *)
        echo -e "${RED}Error: Unsupported platform $PLATFORM${NC}"
        exit 1
        ;;
esac

echo -e "\n${GREEN}All server binaries built successfully!${NC}"

# Return to electron directory
cd "$ELECTRON_DIR"

# Make sure the binaries are executable (on Unix systems)
if [ "$PLATFORM" != "MINGW" ] && [ "$PLATFORM" != "MSYS" ] && [ "$PLATFORM" != "CYGWIN" ]; then
    chmod +x bin/*/*
fi

echo "You can now run: npm start"