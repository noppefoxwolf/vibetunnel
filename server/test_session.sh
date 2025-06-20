#!/bin/bash

# Start server in background (no static path needed for testing)
cd server
./vibetunnel-server --port 4021 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Create a session with auth
echo "Creating session..."
AUTH=$(echo -n "$VIBETUNNEL_USERNAME:$VIBETUNNEL_PASSWORD" | base64)
RESPONSE=$(curl -s -X POST http://localhost:4021/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $AUTH" \
  -d '{"command": ["bash", "-l"]}')

echo "Response: $RESPONSE"

# Extract session ID
SESSION_ID=$(echo $RESPONSE | grep -o '"sessionId":"[^"]*' | cut -d'"' -f4)
echo "Session ID: $SESSION_ID"

# List sessions
echo "Listing sessions..."
curl -s -H "Authorization: Basic $AUTH" http://localhost:4021/api/sessions | jq

# Clean up
kill $SERVER_PID

# Check if session was created in control dir
echo "Checking control directory..."
ls -la ~/.vibetunnel/control/$SESSION_ID/