#!/bin/bash

echo "🔧 Compiling TypeScript files..."

# Compile TypeScript
npx tsc

# Check if compilation was successful
if [ $? -eq 0 ]; then
    echo "✅ TypeScript compilation successful"
    
    # Clean up old JS files that now have TS versions
    echo "🧹 Cleaning up old JavaScript files..."
    
    # Remove old JS files only if corresponding TS file exists
    for ts_file in src/renderer/scripts/*.ts; do
        if [ -f "$ts_file" ]; then
            js_file="${ts_file%.ts}.js"
            base_name=$(basename "$ts_file" .ts)
            
            # Skip test files
            if [[ ! "$base_name" =~ \.test$ ]] && [[ ! "$base_name" =~ \.spec$ ]]; then
                # Remove old versions if they exist
                rm -f "src/renderer/scripts/${base_name}-working.js"
                rm -f "src/renderer/scripts/${base_name}-fixed.js"
                rm -f "src/renderer/scripts/${base_name}-final.js"
                echo "  Cleaned up old versions of ${base_name}"
            fi
        fi
    done
    
    echo "✅ Cleanup complete"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi