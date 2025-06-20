#!/bin/bash

# Run the TypeScript E2E test with the Go server

# Build the Go server
echo "Building Go server..."
go build -o vibetunnel-server ./cmd/vibetunnel-server || exit 1

# Export the Go server binary path
export VIBETUNNEL_GO_SERVER="$(pwd)/vibetunnel-server"

# Go to web directory and run E2E test
cd ../web

# Create a custom test that uses our Go server
cat > src/test/e2e/go-server-smoke.e2e.test.ts << 'EOF'
import { describe, test, expect } from 'vitest';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
// Helper to get random port
async function getRandomPort(): Promise<number> {
  const net = require('net');
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  server.close();
  return port;
}

describe('Go Server Smoke Test', () => {
  test('should perform basic operations', async () => {
    const port = await getRandomPort();
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vibetunnel-go-test-'));
    const controlDir = path.join(testDir, 'control');
    await fs.mkdir(controlDir, { recursive: true });

    // Use the Go server binary
    const goServerPath = process.env.VIBETUNNEL_GO_SERVER || 'vibetunnel-server';
    const staticPath = path.join(process.cwd(), 'public');
    
    // Start the Go server
    const server = spawn(goServerPath, [
      '--static', staticPath,
      '--port', port.toString()
    ], {
      env: {
        ...process.env,
        VIBETUNNEL_CONTROL_DIR: controlDir,
        VIBETUNNEL_USERNAME: '',
        VIBETUNNEL_PASSWORD: ''
      }
    });

    let serverOutput = '';
    server.stdout.on('data', (data) => {
      serverOutput += data.toString();
      console.log('[GO SERVER]', data.toString().trim());
    });
    server.stderr.on('data', (data) => {
      console.error('[GO SERVER ERROR]', data.toString().trim());
    });

    // Wait for server to start
    await new Promise<void>((resolve) => {
      const checkServer = async () => {
        try {
          const response = await fetch(`http://localhost:${port}/api/health`);
          if (response.ok) {
            resolve();
            return;
          }
        } catch (e) {
          // Server not ready yet
        }
        setTimeout(checkServer, 100);
      };
      checkServer();
    });

    console.log('Go server started on port', port);

    try {
      // Run the same tests as the TypeScript server
      console.log('1. Testing health check...');
      const healthResponse = await fetch(`http://localhost:${port}/api/health`);
      expect(healthResponse.ok).toBe(true);
      const health = await healthResponse.json();
      expect(health.status).toBe('ok');

      console.log('2. Listing sessions...');
      const sessionsResponse = await fetch(`http://localhost:${port}/api/sessions`);
      expect(sessionsResponse.ok).toBe(true);
      const sessions = await sessionsResponse.json();
      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions).toHaveLength(0);

      console.log('3. Creating session...');
      const createResponse = await fetch(`http://localhost:${port}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: ['echo', 'hello world'] })
      });
      expect(createResponse.ok).toBe(true);
      const { sessionId } = await createResponse.json();
      expect(sessionId).toBeTruthy();
      console.log('Created session:', sessionId);

      // Wait for echo to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('4. Getting buffer...');
      const bufferResponse = await fetch(`http://localhost:${port}/api/sessions/${sessionId}/buffer`);
      expect(bufferResponse.ok).toBe(true);
      const buffer = await bufferResponse.buffer();
      expect(buffer.length).toBeGreaterThan(0);
      console.log('Buffer size:', buffer.length, 'bytes');

      console.log('5. Listing sessions again...');
      const sessions2Response = await fetch(`http://localhost:${port}/api/sessions`);
      const sessions2 = await sessions2Response.json();
      expect(sessions2).toHaveLength(1);
      expect(sessions2[0].id).toBe(sessionId);

      console.log('6. Killing session...');
      const killResponse = await fetch(`http://localhost:${port}/api/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      expect(killResponse.ok).toBe(true);

      console.log('All tests passed!');
    } finally {
      // Clean up
      server.kill();
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });
});
EOF

# Run the test
npm run test:e2e -- go-server-smoke.e2e.test.ts