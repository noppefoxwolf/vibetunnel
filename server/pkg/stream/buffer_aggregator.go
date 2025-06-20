package stream

import (
	"bytes"
	"encoding/binary"
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
	conn         *websocket.Conn
	subscriptions map[string]func() // sessionID -> unsubscribe function
	mu           sync.Mutex
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
	// Create connection wrapper
	c := &connection{
		conn:          conn,
		subscriptions: make(map[string]func()),
	}

	// Register connection
	ba.mu.Lock()
	ba.connections[conn] = c
	ba.mu.Unlock()

	// Send welcome message
	welcomeMsg := Message{
		Type:    "connected",
		Version: "1.0",
	}
	if err := conn.WriteJSON(welcomeMsg); err != nil {
		log.Printf("Failed to send welcome message: %v", err)
		ba.removeConnection(conn)
		return
	}

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
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if already subscribed
	if _, exists := c.subscriptions[sessionID]; exists {
		return
	}

	// Subscribe to terminal buffer changes
	unsubscribe := ba.terminalManager.Subscribe(sessionID, func(sid string) {
		// Send buffer update
		buffer, err := ba.terminalManager.GetBufferSnapshot(sid)
		if err != nil {
			log.Printf("Failed to get buffer snapshot: %v", err)
			return
		}

		// Send binary message
		if err := ba.sendBinaryUpdate(c.conn, sid, buffer); err != nil {
			log.Printf("Failed to send buffer update: %v", err)
		}
	})

	c.subscriptions[sessionID] = unsubscribe

	// Send confirmation
	confirmMsg := Message{
		Type:      "subscribed",
		SessionID: sessionID,
	}
	if err := c.conn.WriteJSON(confirmMsg); err != nil {
		log.Printf("Failed to send subscription confirmation: %v", err)
	}

	// Send initial buffer
	buffer, err := ba.terminalManager.GetBufferSnapshot(sessionID)
	if err == nil {
		ba.sendBinaryUpdate(c.conn, sessionID, buffer)
	}
}

// handleUnsubscribe handles unsubscription requests
func (ba *BufferAggregator) handleUnsubscribe(c *connection, sessionID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if unsubscribe, exists := c.subscriptions[sessionID]; exists {
		unsubscribe()
		delete(c.subscriptions, sessionID)

		// Send confirmation
		confirmMsg := Message{
			Type:      "unsubscribed",
			SessionID: sessionID,
		}
		c.conn.WriteJSON(confirmMsg)
	}
}

// handlePing handles ping messages
func (ba *BufferAggregator) handlePing(c *connection) {
	pongMsg := Message{
		Type: "pong",
	}
	c.conn.WriteJSON(pongMsg)
}

// sendBinaryUpdate sends a binary buffer update
func (ba *BufferAggregator) sendBinaryUpdate(conn *websocket.Conn, sessionID string, buffer []byte) error {
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

	return conn.WriteMessage(websocket.BinaryMessage, msg.Bytes())
}

// removeConnection removes a connection and cleans up subscriptions
func (ba *BufferAggregator) removeConnection(conn *websocket.Conn) {
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
		if _, subscribed := c.subscriptions[sessionID]; subscribed {
			if err := ba.sendBinaryUpdate(c.conn, sessionID, buffer); err != nil {
				log.Printf("Failed to send buffer update: %v", err)
			}
		}
		c.mu.Unlock()
	}
}

// GetConnectionCount returns the number of active connections
func (ba *BufferAggregator) GetConnectionCount() int {
	ba.mu.RLock()
	defer ba.mu.RUnlock()
	return len(ba.connections)
}