#!/bin/bash

# Basic functionality test for Go server

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "=== VibeTunnel Go Server Basic Test ==="

# Clean up any existing server
pkill vibetunnel-server 2>/dev/null || true

# Build server
echo "Building server..."
go build -o vibetunnel-server ./cmd/vibetunnel-server || exit 1

# Build fwd tool
echo "Building fwd tool..."
go build -o vibetunnel-fwd ./cmd/vibetunnel-fwd || exit 1

# Set up test environment
unset VIBETUNNEL_USERNAME
unset VIBETUNNEL_PASSWORD
export VIBETUNNEL_CONTROL_DIR="/tmp/vibetunnel-test"
rm -rf "$VIBETUNNEL_CONTROL_DIR"
mkdir -p "$VIBETUNNEL_CONTROL_DIR"

# Start server
echo "Starting server..."
./vibetunnel-server --static ../web/public --port 4023 > server.log 2>&1 &
SERVER_PID=$!

cleanup() {
    echo -e "\nCleaning up..."
    kill $SERVER_PID 2>/dev/null || true
    rm -rf "$VIBETUNNEL_CONTROL_DIR"
}
trap cleanup EXIT

sleep 2

# Test 1: Health check
echo -e "\n${GREEN}Test 1: Health check${NC}"
HEALTH=$(curl -s http://localhost:4023/api/health | jq -r .status)
if [ "$HEALTH" = "ok" ]; then
    echo "✓ Health check passed"
else
    echo -e "${RED}✗ Health check failed${NC}"
    exit 1
fi

# Test 2: Create session via API
echo -e "\n${GREEN}Test 2: Create session via API${NC}"
SESSION_RESP=$(curl -s -X POST http://localhost:4023/api/sessions \
    -H "Content-Type: application/json" \
    -d '{"command": ["echo", "Hello from Go server!"]}')
SESSION_ID=$(echo $SESSION_RESP | jq -r .sessionId)
if [ "$SESSION_ID" != "null" ] && [ -n "$SESSION_ID" ]; then
    echo "✓ Session created: $SESSION_ID"
else
    echo -e "${RED}✗ Failed to create session${NC}"
    echo "Response: $SESSION_RESP"
    exit 1
fi

sleep 1

# Test 3: Get session info
echo -e "\n${GREEN}Test 3: Get session info${NC}"
SESSION_INFO=$(curl -s http://localhost:4023/api/sessions/$SESSION_ID)
STATUS=$(echo $SESSION_INFO | jq -r .status)
echo "Session status: $STATUS"
if [ "$STATUS" = "running" ] || [ "$STATUS" = "exited" ]; then
    echo "✓ Session info retrieved"
else
    echo -e "${RED}✗ Failed to get session info${NC}"
    echo "Response: $SESSION_INFO"
    exit 1
fi

# Test 4: List sessions
echo -e "\n${GREEN}Test 4: List sessions${NC}"
SESSIONS=$(curl -s http://localhost:4023/api/sessions)
SESSION_COUNT=$(echo $SESSIONS | jq '. | length')
if [ "$SESSION_COUNT" -ge 1 ]; then
    echo "✓ Found $SESSION_COUNT session(s)"
else
    echo -e "${RED}✗ Failed to list sessions${NC}"
    echo "Response: $SESSIONS"
    exit 1
fi

# Test 5: Get buffer
echo -e "\n${GREEN}Test 5: Get buffer${NC}"
BUFFER_STATUS=$(curl -s -w "\n%{http_code}" -o /tmp/test-buffer.bin http://localhost:4023/api/sessions/$SESSION_ID/buffer | tail -1)
if [ "$BUFFER_STATUS" = "200" ]; then
    BUFFER_SIZE=$(stat -f%z /tmp/test-buffer.bin 2>/dev/null || stat -c%s /tmp/test-buffer.bin)
    echo "✓ Buffer retrieved (size: $BUFFER_SIZE bytes)"
    # Check magic bytes
    if [ "$BUFFER_SIZE" -ge 2 ]; then
        MAGIC=$(xxd -l 2 -p /tmp/test-buffer.bin)
        if [ "$MAGIC" = "5654" ]; then
            echo "✓ Buffer has correct magic bytes (VT)"
        else
            echo -e "${RED}✗ Invalid magic bytes: $MAGIC${NC}"
        fi
    fi
else
    echo -e "${RED}✗ Failed to get buffer (HTTP $BUFFER_STATUS)${NC}"
fi

# Test 6: Create session with fwd tool
echo -e "\n${GREEN}Test 6: Create session with fwd tool${NC}"
./vibetunnel-fwd --monitor-only -- echo "Hello from fwd!" > fwd.log 2>&1 &
FWD_PID=$!
sleep 2
kill $FWD_PID 2>/dev/null || true

if grep -q "Session created with ID:" fwd.log && grep -q "Hello from fwd!" fwd.log; then
    echo "✓ fwd tool created session successfully"
    FWD_SESSION_ID=$(grep "Session created with ID:" fwd.log | awk '{print $5}')
    echo "  Session ID: $FWD_SESSION_ID"
else
    echo -e "${RED}✗ fwd tool failed${NC}"
    cat fwd.log
fi

# Test 7: WebSocket connection
echo -e "\n${GREEN}Test 7: WebSocket test (basic check)${NC}"
# Just check if the endpoint exists
WS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4023/buffers)
if [ "$WS_STATUS" = "400" ] || [ "$WS_STATUS" = "426" ]; then
    echo "✓ WebSocket endpoint exists (returns $WS_STATUS for non-ws request)"
else
    echo -e "${RED}✗ WebSocket endpoint not found (HTTP $WS_STATUS)${NC}"
fi

# Test 8: SSE endpoint
echo -e "\n${GREEN}Test 8: SSE endpoint${NC}"
SSE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 1 http://localhost:4023/api/sessions/$SESSION_ID/stream || true)
if [ "$SSE_STATUS" = "200" ]; then
    echo "✓ SSE endpoint exists"
else
    echo "⚠ SSE endpoint returned $SSE_STATUS (might be expected)"
fi

echo -e "\n${GREEN}=== All basic tests completed ===${NC}"
echo "Server log:"
echo "----------"
tail -20 server.log