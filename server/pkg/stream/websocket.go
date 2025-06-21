package stream

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// WebSocketServer handles WebSocket connections
type WebSocketServer struct {
	config     *config.Config
	aggregator *BufferAggregator
	upgrader   websocket.Upgrader
}

// NewWebSocketServer creates a new WebSocket server
func NewWebSocketServer(cfg *config.Config, aggregator *BufferAggregator) *WebSocketServer {
	return &WebSocketServer{
		config:     cfg,
		aggregator: aggregator,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// Allow all origins in development
				// TODO: Implement proper origin checking for production
				return true
			},
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
		},
	}
}

// HandleWebSocket handles WebSocket upgrade requests
func (ws *WebSocketServer) HandleWebSocket(c *gin.Context) {
	log.Printf("[DEBUG] WebSocket: connection attempt from %s", c.ClientIP())

	// Upgrade connection
	conn, err := ws.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket: %v", err)
		return
	}

	log.Printf("[DEBUG] WebSocket: connection established from %s", c.ClientIP())

	// Configure connection
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Start ping ticker
	go ws.pingLoop(conn)

	// Handle connection
	ws.aggregator.HandleConnection(conn)
}

// pingLoop sends periodic ping messages
func (ws *WebSocketServer) pingLoop(conn *websocket.Conn) {
	ticker := time.NewTicker(ws.config.WebSocketPingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
