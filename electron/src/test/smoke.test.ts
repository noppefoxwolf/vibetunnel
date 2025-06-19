import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Smoke Tests - TypeScript Compilation', () => {
  const distDir = path.join(__dirname, '../../dist');
  
  it('should have compiled main process files', () => {
    // Check that key main process files were compiled
    expect(fs.existsSync(path.join(distDir, 'main/main.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'main/serverManager.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'main/store.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'main/windows.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'main/terminalDetector.js'))).toBe(true);
  });

  it('should have compiled preload script', () => {
    expect(fs.existsSync(path.join(distDir, 'preload/preload.js'))).toBe(true);
  });

  it('should have compiled renderer scripts', () => {
    expect(fs.existsSync(path.join(distDir, 'renderer/scripts/welcome.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'renderer/scripts/settings.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'renderer/scripts/console.js'))).toBe(true);
  });

  it('should have generated source maps', () => {
    // Check that source maps were generated
    expect(fs.existsSync(path.join(distDir, 'main/main.js.map'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'preload/preload.js.map'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'renderer/scripts/settings.js.map'))).toBe(true);
  });

  it('should have valid package.json pointing to compiled files', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8')
    );
    expect(packageJson.main).toBe('dist/main/main.js');
  });

  it('should compile without syntax errors', () => {
    // Try to load the compiled main file (without running it)
    const mainContent = fs.readFileSync(path.join(distDir, 'main/main.js'), 'utf-8');
    expect(() => new Function(mainContent)).not.toThrow();
  });

  it('should have proper TypeScript declarations', () => {
    // Check that type definition files exist
    const typesDir = path.join(__dirname, '../types');
    expect(fs.existsSync(path.join(typesDir, 'electron.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(typesDir, 'server.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(typesDir, 'terminal.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(typesDir, 'store.d.ts'))).toBe(true);
  });

  it('should have TypeScript config file', () => {
    const tsconfigPath = path.join(__dirname, '../../tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);
    
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.target).toBe('ES2020');
    expect(tsconfig.compilerOptions.module).toBe('commonjs');
  });
});

describe('Basic Module Loading', () => {
  it('should export expected functions from windows module', () => {
    // We can't actually run these due to electron dependencies,
    // but we can check the exports exist
    const windowsModule = require('../../dist/main/windows');
    expect(windowsModule.createSettingsWindow).toBeDefined();
    expect(windowsModule.createWelcomeWindow).toBeDefined();
    expect(windowsModule.createConsoleWindow).toBeDefined();
    expect(windowsModule.getWindows).toBeDefined();
    expect(windowsModule.closeAllWindows).toBeDefined();
  });

  it('should export expected functions from terminalDetector module', () => {
    const terminalModule = require('../../dist/main/terminalDetector');
    expect(terminalModule.getAvailableTerminals).toBeDefined();
    expect(terminalModule.openTerminal).toBeDefined();
  });

  it('should have proper class export from serverManager', () => {
    const serverModule = require('../../dist/main/serverManager');
    expect(serverModule.VibeTunnelServerManager).toBeDefined();
    expect(typeof serverModule.VibeTunnelServerManager).toBe('function');
  });
});

describe('TypeScript Type Checking', () => {
  it('should have no TypeScript errors when type checking', async () => {
    // This test verifies that tsc --noEmit runs without errors
    // The actual type checking is done by the build process
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      await execAsync('npx tsc --noEmit', {
        cwd: path.join(__dirname, '../..'),
      });
      // If we get here, there are no TypeScript errors
      expect(true).toBe(true);
    } catch (error) {
      // If there are TypeScript errors, the command will fail
      expect(error).toBeUndefined();
    }
  });
});