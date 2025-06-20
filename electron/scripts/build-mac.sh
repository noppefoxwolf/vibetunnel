#!/bin/bash

echo "🏗️  Building VibeTunnel for macOS (arm64)..."

# Type check the code
echo "📝 Type checking..."
npm run typecheck

# Check if type checking passed
if [ $? -ne 0 ]; then
    echo "❌ Type checking failed! Fix the type errors before building."
    exit 1
fi

echo "✅ Type checking passed!"

# Build TypeScript and copy static files
echo "📦 Building TypeScript..."
node scripts/build-ts.js

# Check if TypeScript build was successful
if [ $? -ne 0 ]; then
    echo "❌ TypeScript build failed"
    exit 1
fi

# Build native binaries if needed
if [ -f "./scripts/build-server.sh" ]; then
    echo "🔧 Building native binaries..."
    ./scripts/build-server.sh
fi

# Build Electron app for macOS arm64
echo "🍎 Building macOS app (arm64)..."
npx electron-builder --mac --arm64 --publish=never --config .electron-builder.config.js

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build completed successfully!"
    echo "📍 Output location: dist/"
else
    echo "❌ Build failed"
    exit 1
fi