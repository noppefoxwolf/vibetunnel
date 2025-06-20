#!/bin/bash

# Quick test to debug issues

# Build server
go build -o vibetunnel-server ./cmd/vibetunnel-server || exit 1

# Create test dir
TEST_DIR=$(mktemp -d)
export VIBETUNNEL_CONTROL_DIR="$TEST_DIR/control"
mkdir -p "$VIBETUNNEL_CONTROL_DIR"

# Clear auth
unset VIBETUNNEL_USERNAME
unset VIBETUNNEL_PASSWORD

# Start server
./vibetunnel-server --static ../web/public --port 4022 > server-test.log 2>&1 &
SERVER_PID=$!

cleanup() {
    kill $SERVER_PID 2>/dev/null
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

sleep 2

# Create session
echo "Creating session..."
SESSION_RESP=$(curl -s -X POST http://localhost:4022/api/sessions \
    -H "Content-Type: application/json" \
    -d '{"command": ["echo", "hello world"]}')
echo "Response: $SESSION_RESP"

SESSION_ID=$(echo $SESSION_RESP | python3 -c "import sys, json; print(json.load(sys.stdin)['sessionId'])")
echo "Session ID: $SESSION_ID"

# Check session files
echo ""
echo "Session files:"
ls -la "$TEST_DIR/control/$SESSION_ID/"

# Try to send input
echo ""
echo "Sending input..."
INPUT_RESP=$(curl -s -X POST http://localhost:4022/api/sessions/$SESSION_ID/input \
    -H "Content-Type: application/json" \
    -d '{"text": "\n"}')
echo "Input response: $INPUT_RESP"

sleep 2

echo ""
echo "Server log:"
cat server-test.log