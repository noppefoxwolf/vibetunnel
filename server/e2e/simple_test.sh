#!/bin/bash

# Simple test to check basic functionality

go build -o vibetunnel-server ./cmd/vibetunnel-server || exit 1

unset VIBETUNNEL_USERNAME
unset VIBETUNNEL_PASSWORD
export VIBETUNNEL_CONTROL_DIR="/tmp/vibetunnel-test"
rm -rf "$VIBETUNNEL_CONTROL_DIR"
mkdir -p "$VIBETUNNEL_CONTROL_DIR"

# Start server
./vibetunnel-server --static ../web/public --port 4023 &
SERVER_PID=$!

cleanup() {
    kill $SERVER_PID 2>/dev/null
}
trap cleanup EXIT

sleep 2

# Create a simple session with ls command which exits immediately
echo "Creating session with 'ls' command..."
RESP=$(curl -s -X POST http://localhost:4023/api/sessions \
    -H "Content-Type: application/json" \
    -d '{"command": ["ls", "-la"]}')
echo "Response: $RESP"

SESSION_ID=$(echo $RESP | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('sessionId', 'ERROR'))")
echo "Session ID: $SESSION_ID"

sleep 1

# Check session status
echo ""
echo "Getting session info..."
SESSION_INFO=$(curl -s http://localhost:4023/api/sessions/$SESSION_ID)
echo "Session info: $SESSION_INFO"

# Try to get buffer
echo ""
echo "Getting buffer..."
BUFFER_STATUS=$(curl -s -w "%{http_code}" -o /tmp/buffer.bin http://localhost:4023/api/sessions/$SESSION_ID/buffer)
echo "Buffer status: $BUFFER_STATUS"
echo "Buffer size: $(stat -f%z /tmp/buffer.bin 2>/dev/null || stat -c%s /tmp/buffer.bin)"

# List sessions
echo ""
echo "Listing sessions..."
SESSIONS=$(curl -s http://localhost:4023/api/sessions)
echo "Sessions: $SESSIONS"