import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        'dist/',
        'public/',
        '*.config.ts',
        '*.config.js',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      include: [
        'src/**/*.ts',
        'src/**/*.js',
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 10000,
    // Separate test suites
    includeSource: ['src/**/*.{js,ts}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});