#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building TypeScript files...');

try {
  // Compile TypeScript files
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('TypeScript compilation completed successfully');
} catch (error) {
  console.error('TypeScript compilation failed:', error.message);
  process.exit(1);
}

// For now, we'll use the .js files directly since we're in development
// In production, you'd want to use the compiled .js files from dist/