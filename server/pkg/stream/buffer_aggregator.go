package stream

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
	"github.com/vibetunnel/vibetunnel-server/pkg/terminal"
)

// BufferAggregator manages WebSocket connections for terminal buffer updates
type BufferAggregator struct {
	config          *config.Config
	terminalManager *terminal.Manager
	connections     map[*websocket.Conn]*connection
	mu              sync.RWMutex
}

// connection represents a WebSocket connection
type connection struct {
	conn          *websocket.Conn
	subscriptions map[string]func() // sessionID -> unsubscribe function
	mu            sync.Mutex
}

// Message types for WebSocket protocol
type Message struct {
	Type      string `json:"type"`
	SessionID string `json:"sessionId,omitempty"`
	Version   string `json:"version,omitempty"`
}

// NewBufferAggregator creates a new buffer aggregator
func NewBufferAggregator(cfg *config.Config, tm *terminal.Manager) *BufferAggregator {
	return &BufferAggregator{
		config:          cfg,
		terminalManager: tm,
		connections:     make(map[*websocket.Conn]*connection),
	}
}

// HandleConnection handles a new WebSocket connection
func (ba *BufferAggregator) HandleConnection(conn *websocket.Conn) {
	log.Printf("[DEBUG] WebSocket connection opened: %p", conn)
	// Create connection wrapper
	c := &connection{
		conn:          conn,
		subscriptions: make(map[string]func()),
	}

	// Register connection
	ba.mu.Lock()
	ba.connections[conn] = c
	ba.mu.Unlock()

	// Handle messages
	go ba.handleMessages(c)
}

// handleMessages handles incoming WebSocket messages
func (ba *BufferAggregator) handleMessages(c *connection) {
	defer func() {
		ba.removeConnection(c.conn)
		c.conn.Close()
	}()

	for {
		var msg Message
		if err := c.conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		log.Printf("[DEBUG] BufferAggregator: received message type=%s, sessionId=%s", msg.Type, msg.SessionID)

		switch msg.Type {
		case "subscribe":
			ba.handleSubscribe(c, msg.SessionID)
		case "unsubscribe":
			ba.handleUnsubscribe(c, msg.SessionID)
		case "ping":
			ba.handlePing(c)
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

// handleSubscribe handles subscription requests
func (ba *BufferAggregator) handleSubscribe(c *connection, sessionID string) {
	log.Printf("[DEBUG] handleSubscribe: subscribing to session %s", sessionID)
	c.mu.Lock()
	defer c.mu.Unlock()

	log.Printf("[DEBUG] handleSubscribe: acquired lock for session %s", sessionID)

	// Check if already subscribed
	if _, exists := c.subscriptions[sessionID]; exists {
		log.Printf("[DEBUG] handleSubscribe: already subscribed to %s", sessionID)
		return
	}

	log.Printf("[DEBUG] handleSubscribe: not already subscribed, proceeding for session %s", sessionID)

	// Subscribe to terminal buffer changes
	log.Printf("[DEBUG] handleSubscribe: calling terminalManager.Subscribe for session %s", sessionID)
	unsubscribe := ba.terminalManager.Subscribe(sessionID, func(sid string) {
		log.Printf("[DEBUG] Subscribe callback: buffer update for session %s", sid)
		// Send buffer update - sendBinaryUpdate will handle its own locking
		buffer, err := ba.terminalManager.GetBufferSnapshot(sid)
		if err != nil {
			log.Printf("[DEBUG] Failed to get buffer snapshot: %v", err)
			return
		}
		if err := ba.sendBinaryUpdate(c.conn, sid, buffer); err != nil {
			log.Printf("[DEBUG] Failed to send buffer update: %v", err)
		}
	})

	log.Printf("[DEBUG] handleSubscribe: got unsubscribe function for session %s", sessionID)

	c.subscriptions[sessionID] = unsubscribe

	// Send initial buffer - sendBinaryUpdate will handle its own locking, so we need to unlock first
	log.Printf("[DEBUG] handleSubscribe: about to call GetBufferSnapshot for session %s", sessionID)
	buffer, err := ba.terminalManager.GetBufferSnapshot(sessionID)
	if err == nil {
		log.Printf("[DEBUG] handleSubscribe: sending initial buffer for session %s, len=%d", sessionID, len(buffer))
		// Temporarily unlock to avoid deadlock since sendBinaryUpdate will acquire the lock
		c.mu.Unlock()
		if err := ba.sendBinaryUpdate(c.conn, sessionID, buffer); err != nil {
			log.Printf("[DEBUG] handleSubscribe: failed to send initial buffer for session %s: %v", sessionID, err)
		} else {
			log.Printf("[DEBUG] handleSubscribe: successfully sent initial buffer for session %s", sessionID)
		}
		c.mu.Lock() // Re-acquire lock for defer unlock
	} else {
		log.Printf("[DEBUG] handleSubscribe: failed to get initial buffer for session %s: %v", sessionID, err)
	}
}

// handleUnsubscribe handles unsubscription requests
func (ba *BufferAggregator) handleUnsubscribe(c *connection, sessionID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if unsubscribe, exists := c.subscriptions[sessionID]; exists {
		unsubscribe()
		delete(c.subscriptions, sessionID)
	}
}

// handlePing handles ping messages
func (ba *BufferAggregator) handlePing(c *connection) {
	// sendJSON is also a write operation, so we need to protect it too
	pongMsg := Message{
		Type: "pong",
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	c.conn.WriteJSON(pongMsg)
}

// sendBinaryUpdate sends a binary buffer update
func (ba *BufferAggregator) sendBinaryUpdate(conn *websocket.Conn, sessionID string, buffer []byte) error {
	log.Printf("[DEBUG] sendBinaryUpdate: ENTERED for session %s, len=%d", sessionID, len(buffer))
	log.Printf("[DEBUG] sendBinaryUpdate: connection pointer: %p", conn)

	ba.mu.RLock()
	c, exists := ba.connections[conn]
	ba.mu.RUnlock()

	log.Printf("[DEBUG] sendBinaryUpdate: connection lookup result: exists=%v, connection=%p", exists, c)

	if !exists {
		log.Printf("[DEBUG] sendBinaryUpdate: connection not found for session %s", sessionID)
		return nil
	}

	// ALWAYS acquire the connection mutex to prevent concurrent writes
	c.mu.Lock()
	defer c.mu.Unlock()

	log.Printf("[DEBUG] sendBinaryUpdate: acquired connection mutex for session %s", sessionID)

	// Format: [Magic Byte 0xBF][Session ID Length (4 bytes)][Session ID][Buffer Data]
	var msg bytes.Buffer
	// Magic byte
	msg.WriteByte(0xBF)
	// Session ID length
	sessionIDBytes := []byte(sessionID)
	binary.Write(&msg, binary.LittleEndian, uint32(len(sessionIDBytes)))
	// Session ID
	msg.Write(sessionIDBytes)
	// Buffer data
	msg.Write(buffer)
	result := msg.Bytes()
	// Log first 16 bytes as hex
	hexLen := 16
	if len(result) < hexLen {
		hexLen = len(result)
	}
	log.Printf("[DEBUG] sendBinaryUpdate: first %d bytes: %s", hexLen, hex.EncodeToString(result[:hexLen]))
	log.Printf("[DEBUG] sendBinaryUpdate: about to write binary message for session %s, total size=%d", sessionID, len(result))
	err := c.conn.WriteMessage(websocket.BinaryMessage, result)
	if err != nil {
		log.Printf("[DEBUG] sendBinaryUpdate: WriteMessage failed for session %s: %v", sessionID, err)
	} else {
		log.Printf("[DEBUG] sendBinaryUpdate: WriteMessage succeeded for session %s", sessionID)
	}
	return err
}

// removeConnection removes a connection and cleans up subscriptions
func (ba *BufferAggregator) removeConnection(conn *websocket.Conn) {
	log.Printf("[DEBUG] WebSocket connection closed: %p", conn)
	ba.mu.Lock()
	c, exists := ba.connections[conn]
	if exists {
		delete(ba.connections, conn)
	}
	ba.mu.Unlock()

	if c != nil {
		c.mu.Lock()
		for _, unsubscribe := range c.subscriptions {
			unsubscribe()
		}
		c.mu.Unlock()
	}
}

// BroadcastBufferUpdate broadcasts a buffer update to all subscribed connections
func (ba *BufferAggregator) BroadcastBufferUpdate(sessionID string, buffer []byte) {
	ba.mu.RLock()
	connections := make([]*connection, 0, len(ba.connections))
	for _, c := range ba.connections {
		connections = append(connections, c)
	}
	ba.mu.RUnlock()

	for _, c := range connections {
		c.mu.Lock()
		subscribed := false
		if _, exists := c.subscriptions[sessionID]; exists {
			subscribed = true
		}
		c.mu.Unlock()

		if subscribed {
			// sendBinaryUpdate will handle its own locking
			if err := ba.sendBinaryUpdate(c.conn, sessionID, buffer); err != nil {
				log.Printf("Failed to send buffer update: %v", err)
			}
		}
	}
}

// GetConnectionCount returns the number of active connections
func (ba *BufferAggregator) GetConnectionCount() int {
	ba.mu.RLock()
	defer ba.mu.RUnlock()
	return len(ba.connections)
}
