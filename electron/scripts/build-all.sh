#!/bin/bash

# Build script for all platforms including dependencies
# This script builds everything needed for distribution

set -e

echo "🚀 Building VibeTunnel for all platforms..."

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

# Clean previous builds
echo -e "\n${BLUE}Cleaning previous builds...${NC}"
rm -rf dist/
rm -rf build/
rm -rf bin/

# Create bin directories for all platforms
echo -e "\n${BLUE}Creating binary directories...${NC}"
mkdir -p bin/darwin-arm64 bin/darwin-x64 bin/linux-x64 bin/win32-x64

# Install dependencies
echo -e "\n${BLUE}Installing dependencies...${NC}"
npm install

# Build TypeScript
echo -e "\n${BLUE}Building TypeScript...${NC}"
npm run build:ts

# Build web assets
echo -e "\n${BLUE}Building web assets...${NC}"
cd ../web
npm install
npm run build
cd ../electron

# Build server binaries for all platforms
echo -e "\n${BLUE}Building server binaries for all platforms...${NC}"

# Save electron directory path
ELECTRON_DIR=$(pwd)

# Build Rust tty-fwd binaries
echo -e "\n${YELLOW}Building Rust tty-fwd server for all platforms...${NC}"
cd ../tty-fwd

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}Error: Rust is not installed. Please install from https://rustup.rs/${NC}"
    exit 1
fi

# Install cross-compilation targets if needed
echo "Installing Rust cross-compilation targets..."
rustup target add aarch64-apple-darwin x86_64-apple-darwin x86_64-unknown-linux-gnu x86_64-pc-windows-gnu 2>/dev/null || true

# Build for all platforms
echo "Building Rust server for macOS ARM64..."
cargo build --release --target aarch64-apple-darwin
cp target/aarch64-apple-darwin/release/tty-fwd "$ELECTRON_DIR/bin/darwin-arm64/"

echo "Building Rust server for macOS x64..."
cargo build --release --target x86_64-apple-darwin
cp target/x86_64-apple-darwin/release/tty-fwd "$ELECTRON_DIR/bin/darwin-x64/"

echo "Building Rust server for Linux x64..."
cargo build --release --target x86_64-unknown-linux-gnu
cp target/x86_64-unknown-linux-gnu/release/tty-fwd "$ELECTRON_DIR/bin/linux-x64/"

# Windows build (requires additional setup for cross-compilation)
if command -v x86_64-pc-windows-gnu-gcc &> /dev/null; then
    echo "Building Rust server for Windows x64..."
    cargo build --release --target x86_64-pc-windows-gnu
    cp target/x86_64-pc-windows-gnu/release/tty-fwd.exe "$ELECTRON_DIR/bin/win32-x64/"
else
    echo -e "${YELLOW}Warning: Windows cross-compilation tools not found. Skipping Windows Rust build.${NC}"
fi

# Build Go vibetunnel binaries
echo -e "\n${YELLOW}Building Go vibetunnel server for all platforms...${NC}"
cd "$ELECTRON_DIR/../linux"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go is not installed. Please install from https://go.dev/${NC}"
    exit 1
fi

# Build for all platforms
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
chmod +x bin/darwin-*/tty-fwd bin/darwin-*/vibetunnel
chmod +x bin/linux-*/tty-fwd bin/linux-*/vibetunnel

# Build Electron apps for all platforms
echo -e "\n${BLUE}Building Electron apps for all platforms...${NC}"

# Build for all platforms
npm run dist

echo -e "\n${GREEN}✅ Build completed successfully!${NC}"
echo -e "\nBuilt packages can be found in:"
echo -e "  ${BLUE}dist/${NC}"
echo -e "\nBinaries can be found in:"
echo -e "  ${BLUE}bin/${NC}"