#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Building TypeScript files...');

try {
  // Compile main process TypeScript files
  console.log('Compiling main process...');
  execSync('npx tsc -p tsconfig.json', { stdio: 'inherit' });
  
  // Compile renderer process TypeScript files with ES modules
  console.log('Compiling renderer process...');
  execSync('npx tsc -p tsconfig.renderer.json', { stdio: 'inherit' });
  
  console.log('TypeScript compilation completed successfully');
  
  // Copy HTML and CSS files to dist
  console.log('Copying static files...');
  
  // Ensure dist/renderer directory exists
  const distRendererPath = path.join(__dirname, '..', 'dist', 'renderer');
  if (!fs.existsSync(distRendererPath)) {
    fs.mkdirSync(distRendererPath, { recursive: true });
  }
  
  // Copy HTML files
  const srcRendererPath = path.join(__dirname, '..', 'src', 'renderer');
  const htmlFiles = fs.readdirSync(srcRendererPath).filter(file => file.endsWith('.html'));
  htmlFiles.forEach(file => {
    fs.copyFileSync(
      path.join(srcRendererPath, file),
      path.join(distRendererPath, file)
    );
  });
  console.log(`Copied ${htmlFiles.length} HTML files`);
  
  // Copy styles directory
  const srcStylesPath = path.join(srcRendererPath, 'styles');
  const distStylesPath = path.join(distRendererPath, 'styles');
  if (fs.existsSync(srcStylesPath)) {
    if (!fs.existsSync(distStylesPath)) {
      fs.mkdirSync(distStylesPath, { recursive: true });
    }
    const cssFiles = fs.readdirSync(srcStylesPath).filter(file => file.endsWith('.css'));
    cssFiles.forEach(file => {
      fs.copyFileSync(
        path.join(srcStylesPath, file),
        path.join(distStylesPath, file)
      );
    });
    console.log(`Copied ${cssFiles.length} CSS files`);
  }
  
  console.log('Build completed successfully');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}