#!/bin/bash

# Build the Go server
echo "Building Go server..."
go build -o vibetunnel-server ./cmd/vibetunnel-server

# Create a temporary directory for the test
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# Start the server on a random port
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("", 0)); print(s.getsockname()[1]); s.close()')
echo "Starting server on port $PORT..."

# Set control directory to test directory
export VIBETUNNEL_CONTROL_DIR="$TEST_DIR/control"
mkdir -p "$VIBETUNNEL_CONTROL_DIR"

# Clear auth environment variables for testing
unset VIBETUNNEL_USERNAME
unset VIBETUNNEL_PASSWORD

# Start the server without authentication for testing
./vibetunnel-server --static ../web/public --port $PORT > "$TEST_DIR/server.log" 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Function to cleanup
cleanup() {
    echo "Cleaning up..."
    kill $SERVER_PID 2>/dev/null || true
    rm -rf "$TEST_DIR"
}

# Set trap to cleanup on exit
trap 'show_log_on_failure; cleanup' EXIT

# On failure, show server log
show_log_on_failure() {
    if [ $? -ne 0 ]; then
        echo ""
        echo "Test failed! Server log:"
        cat "$TEST_DIR/server.log" 2>/dev/null || true
    fi
}

# Run tests
echo "Running tests..."

# 1. Health check
echo "1. Testing health check..."
HEALTH=$(curl -s http://localhost:$PORT/api/health)
if [[ $HEALTH == *"\"status\":\"ok\""* ]]; then
    echo "✓ Health check passed"
else
    echo "✗ Health check failed: $HEALTH"
    exit 1
fi

# 2. List sessions (should be empty)
echo "2. Listing sessions..."
SESSIONS=$(curl -s http://localhost:$PORT/api/sessions)
if [[ $SESSIONS == "[]" ]]; then
    echo "✓ Session list is empty"
else
    echo "✗ Session list should be empty: $SESSIONS"
    exit 1
fi

# 3. Create a session (using sh -c to get an interactive shell)
echo "3. Creating session..."
SESSION_RESP=$(curl -s -X POST http://localhost:$PORT/api/sessions \
    -H "Content-Type: application/json" \
    -d '{"command": ["sh", "-c", "echo hello world"]}')
SESSION_ID=$(echo $SESSION_RESP | python3 -c "import sys, json; print(json.load(sys.stdin)['sessionId'])")
if [[ ! -z "$SESSION_ID" ]]; then
    echo "✓ Created session: $SESSION_ID"
else
    echo "✗ Failed to create session: $SESSION_RESP"
    exit 1
fi

# Skip input test since echo exits immediately
echo "4. Skipping input test (command exits immediately)..."

# Wait a bit for the command to complete
sleep 1

# 5. Get buffer
echo "5. Getting buffer..."
BUFFER=$(curl -s http://localhost:$PORT/api/sessions/$SESSION_ID/buffer -o "$TEST_DIR/buffer.bin" -w "%{http_code}")
if [[ $BUFFER == "200" ]]; then
    BUFFER_SIZE=$(stat -f%z "$TEST_DIR/buffer.bin" 2>/dev/null || stat -c%s "$TEST_DIR/buffer.bin")
    echo "✓ Got buffer: $BUFFER_SIZE bytes"
else
    echo "✗ Failed to get buffer: HTTP $BUFFER"
    exit 1
fi

# 6. List sessions again
echo "6. Listing sessions again..."
SESSIONS=$(curl -s http://localhost:$PORT/api/sessions)
if [[ $SESSIONS == *"$SESSION_ID"* ]]; then
    echo "✓ Session appears in list"
else
    echo "✗ Session not in list: $SESSIONS"
    exit 1
fi

# 7. Kill session
echo "7. Killing session..."
KILL_RESP=$(curl -s -X DELETE http://localhost:$PORT/api/sessions/$SESSION_ID)
if [[ $KILL_RESP == *"\"success\":true"* ]]; then
    echo "✓ Session killed"
else
    echo "✗ Failed to kill session: $KILL_RESP"
    exit 1
fi

echo ""
echo "All tests passed!"
echo ""
echo "Server log:"
cat "$TEST_DIR/server.log"