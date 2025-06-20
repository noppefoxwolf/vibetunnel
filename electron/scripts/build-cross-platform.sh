#!/bin/bash

# Cross-platform binary build script (binaries only, no Electron packaging)
# For building server binaries for all platforms without packaging

set -e

echo "🔨 Building server binaries for all platforms..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the electron directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: This script must be run from the electron directory${NC}"
    exit 1
fi

# Create bin directories for all platforms
echo -e "\n${BLUE}Creating binary directories...${NC}"
mkdir -p bin/darwin-arm64 bin/darwin-x64 bin/linux-x64 bin/win32-x64

# Save electron directory path
ELECTRON_DIR=$(pwd)

# Build Rust tty-fwd binaries (Unix platforms only)
echo -e "\n${YELLOW}Building Rust tty-fwd server for Unix platforms...${NC}"
cd ../tty-fwd

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed. Please install from https://rustup.rs/${NC}"
    exit 1
fi

# Install cross-compilation targets if needed
echo "Installing Rust cross-compilation targets..."
rustup target add aarch64-apple-darwin x86_64-apple-darwin x86_64-unknown-linux-musl 2>/dev/null || true

# Build for macOS platforms
echo "Building Rust server for macOS ARM64..."
cargo build --release --target aarch64-apple-darwin
cp target/aarch64-apple-darwin/release/tty-fwd "$ELECTRON_DIR/bin/darwin-arm64/"
echo -e "${GREEN}✓ Built Rust server for macOS ARM64${NC}"

echo "Building Rust server for macOS x64..."
cargo build --release --target x86_64-apple-darwin
cp target/x86_64-apple-darwin/release/tty-fwd "$ELECTRON_DIR/bin/darwin-x64/"
echo -e "${GREEN}✓ Built Rust server for macOS x64${NC}"

# Linux build using musl for static linking
echo "Building Rust server for Linux x64 (musl)..."
if cargo build --release --target x86_64-unknown-linux-musl 2>/dev/null; then
    cp target/x86_64-unknown-linux-musl/release/tty-fwd "$ELECTRON_DIR/bin/linux-x64/"
    echo -e "${GREEN}✓ Built Rust server for Linux x64${NC}"
else
    echo -e "${YELLOW}Warning: Linux cross-compilation failed.${NC}"
    echo -e "${YELLOW}To enable Linux builds from macOS, use Docker or build on Linux.${NC}"
fi

# Windows - tty-fwd doesn't support Windows
echo -e "${YELLOW}Skipping Windows: Rust tty-fwd is Unix-only${NC}"

# Build Go vibetunnel binaries
echo -e "\n${YELLOW}Building Go vibetunnel server for all platforms...${NC}"
cd "$ELECTRON_DIR/../linux"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go is not installed. Please install from https://go.dev/${NC}"
    exit 1
fi

# Go cross-compilation is much easier - just set GOOS and GOARCH
echo "Building Go server for macOS ARM64..."
GOOS=darwin GOARCH=arm64 go build -o "$ELECTRON_DIR/bin/darwin-arm64/vibetunnel" ./cmd/vibetunnel

echo "Building Go server for macOS x64..."
GOOS=darwin GOARCH=amd64 go build -o "$ELECTRON_DIR/bin/darwin-x64/vibetunnel" ./cmd/vibetunnel

echo "Building Go server for Linux x64..."
GOOS=linux GOARCH=amd64 go build -o "$ELECTRON_DIR/bin/linux-x64/vibetunnel" ./cmd/vibetunnel

echo "Building Go server for Windows x64..."
GOOS=windows GOARCH=amd64 go build -o "$ELECTRON_DIR/bin/win32-x64/vibetunnel.exe" ./cmd/vibetunnel

# Return to electron directory
cd "$ELECTRON_DIR"

# Make binaries executable
echo -e "\n${BLUE}Setting executable permissions...${NC}"
chmod +x bin/darwin-*/tty-fwd bin/darwin-*/vibetunnel 2>/dev/null || true
chmod +x bin/linux-*/tty-fwd bin/linux-*/vibetunnel 2>/dev/null || true

echo -e "\n${GREEN}✅ Server binaries built successfully!${NC}"
echo -e "\nBinaries location: ${BLUE}bin/${NC}"
ls -la bin/*/