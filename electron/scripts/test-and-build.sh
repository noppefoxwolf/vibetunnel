#!/bin/bash

echo "🧪 Running tests before build..."

# Run TypeScript type checking
echo "📝 Type checking..."
npm run typecheck

if [ $? -ne 0 ]; then
    echo "❌ Type checking failed!"
    exit 1
fi

# Run tests
echo "🧪 Running unit tests..."
npm test

if [ $? -ne 0 ]; then
    echo "❌ Tests failed!"
    exit 1
fi

echo "✅ All tests passed!"

# Build TypeScript
echo "📦 Building application..."
node scripts/build-ts.js

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build completed successfully!"
echo "💡 You can now run 'npm run dev' to test the app"