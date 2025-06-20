#!/bin/bash

# Build script using cargo-cross for proper cross-compilation
# This handles all the complexity of cross-compiling Rust with native dependencies

set -e

echo "🚀 Building with cargo-cross for proper cross-compilation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if cargo-cross is installed
if ! command -v cross &> /dev/null; then
    echo -e "${YELLOW}cargo-cross not found. Installing...${NC}"
    cargo install cross
fi

# Check if Docker is running (required for cross)
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker is not running. cargo-cross requires Docker.${NC}"
    echo -e "${YELLOW}Please start Docker and try again.${NC}"
    exit 1
fi

ELECTRON_DIR=$(pwd)

# Build Rust binaries with cross
echo -e "\n${BLUE}Building Rust tty-fwd with cross...${NC}"
cd ../tty-fwd

echo "Building for Linux x64..."
cross build --release --target x86_64-unknown-linux-gnu
cp target/x86_64-unknown-linux-gnu/release/tty-fwd "$ELECTRON_DIR/bin/linux-x64/"

echo "Building for Windows x64..."
cross build --release --target x86_64-pc-windows-gnu
cp target/x86_64-pc-windows-gnu/release/tty-fwd.exe "$ELECTRON_DIR/bin/win32-x64/"

# Native builds for macOS
echo "Building for macOS (native)..."
cargo build --release --target aarch64-apple-darwin
cp target/aarch64-apple-darwin/release/tty-fwd "$ELECTRON_DIR/bin/darwin-arm64/"

cargo build --release --target x86_64-apple-darwin
cp target/x86_64-apple-darwin/release/tty-fwd "$ELECTRON_DIR/bin/darwin-x64/"

cd "$ELECTRON_DIR"

echo -e "\n${GREEN}✅ Cross-compilation completed successfully!${NC}"