package api

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibetunnel/vibetunnel-server/pkg/pty"
	"github.com/vibetunnel/vibetunnel-server/pkg/stream"
)

// SessionResponse represents a session in API responses
type SessionResponse struct {
	ID           string    `json:"id"`
	Command      string    `json:"command"`
	WorkingDir   string    `json:"workingDir"`
	Name         string    `json:"name,omitempty"`
	Status       string    `json:"status"`
	ExitCode     int       `json:"exitCode,omitempty"`
	StartedAt    time.Time `json:"startedAt"`
	LastModified time.Time `json:"lastModified,omitempty"`
	PID          int       `json:"pid,omitempty"`
	Source       string    `json:"source,omitempty"` // "local" or "remote"
	RemoteID     string    `json:"remoteId,omitempty"`
	RemoteName   string    `json:"remoteName,omitempty"`
	RemoteURL    string    `json:"remoteUrl,omitempty"`
	Waiting      bool      `json:"waiting,omitempty"`
}

// CreateSessionRequest represents a request to create a session
type CreateSessionRequest struct {
	Command    []string `json:"command" binding:"required"`
	WorkingDir string   `json:"workingDir"`
	Name       string   `json:"name"`
	RemoteID   string   `json:"remoteId"` // For HQ mode
}

// ListSessions lists all sessions
func (h *Handler) ListSessions(c *gin.Context) {
	log.Printf("[ListSessions] Request from %s", c.ClientIP())

	// Get local sessions
	localSessions, err := h.sessionManager.ListSessions()
	if err != nil {
		log.Printf("[ListSessions] Error listing sessions: %v", err)
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to list sessions: %v", err)})
		return
	}

	log.Printf("[ListSessions] Found %d local sessions", len(localSessions))

	// Convert to response format
	sessions := make([]SessionResponse, 0)
	for _, s := range localSessions {
		sessions = append(sessions, SessionResponse{
			ID:           s.ID,
			Command:      s.Command,
			WorkingDir:   s.WorkingDir,
			Name:         s.Name,
			Status:       s.Status,
			ExitCode:     s.ExitCode,
			StartedAt:    s.StartedAt,
			LastModified: s.LastModified,
			PID:          s.PID,
			Source:       "local",
			Waiting:      s.Waiting,
		})
	}

	// If HQ mode, aggregate remote sessions
	if h.config.IsHQMode && h.remoteRegistry != nil {
		remoteSessions := h.remoteRegistry.GetAllSessions()
		for _, rs := range remoteSessions {
			sessions = append(sessions, SessionResponse{
				ID:           rs.ID,
				Command:      rs.Command,
				WorkingDir:   rs.WorkingDir,
				Name:         rs.Name,
				Status:       rs.Status,
				ExitCode:     rs.ExitCode,
				StartedAt:    rs.StartedAt,
				LastModified: rs.LastModified,
				PID:          rs.PID,
				Source:       rs.Source,
				RemoteID:     rs.RemoteID,
				RemoteName:   rs.RemoteName,
				RemoteURL:    rs.RemoteURL,
				Waiting:      rs.Waiting,
			})
		}
	}

	log.Printf("[ListSessions] Returning %d total sessions", len(sessions))
	c.JSON(200, sessions)
}

// CreateSession creates a new session
func (h *Handler) CreateSession(c *gin.Context) {
	log.Printf("[CreateSession] Request from %s", c.ClientIP())

	var req CreateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[CreateSession] Invalid request body: %v", err)
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}

	log.Printf("[CreateSession] Command: %v, WorkingDir: %s, Name: %s, RemoteID: %s",
		req.Command, req.WorkingDir, req.Name, req.RemoteID)

	// Expand ~ in workingDir to the user's home directory
	if strings.HasPrefix(req.WorkingDir, "~") {
		home, err := os.UserHomeDir()
		if err == nil {
			if req.WorkingDir == "~" {
				req.WorkingDir = home
			} else if strings.HasPrefix(req.WorkingDir, "~/") {
				req.WorkingDir = filepath.Join(home, req.WorkingDir[2:])
			}
		}
	}

	// If HQ mode and remoteId specified, forward to remote
	if h.config.IsHQMode && req.RemoteID != "" {
		h.createRemoteSession(c, req)
		return
	}

	// Create local session
	sessionInfo, err := h.sessionManager.CreateSession(req.Command, pty.CreateSessionOptions{
		Name:       req.Name,
		WorkingDir: req.WorkingDir,
		Cols:       h.config.DefaultCols,
		Rows:       h.config.DefaultRows,
		Term:       h.config.DefaultTerm,
	})

	if err != nil {
		log.Printf("[CreateSession] Failed to create session: %v", err)
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to create session: %v", err)})
		return
	}

	log.Printf("[CreateSession] Created session with ID: %s", sessionInfo.ID)
	c.JSON(200, gin.H{"sessionId": sessionInfo.ID})
}

// GetSession gets a single session
func (h *Handler) GetSession(c *gin.Context) {
	sessionID := c.Param("id")

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.getRemoteSession(c, sessionID, remote)
			return
		}
	}

	// Get local session
	session, err := h.sessionManager.GetSession(sessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Session not found"})
		return
	}

	c.JSON(200, SessionResponse{
		ID:           session.ID,
		Command:      session.Command,
		WorkingDir:   session.WorkingDir,
		Name:         session.Name,
		Status:       session.Status,
		ExitCode:     session.ExitCode,
		StartedAt:    session.StartedAt,
		LastModified: session.LastModified,
		PID:          session.PID,
		Waiting:      session.Waiting,
	})
}

// KillSession kills a session
func (h *Handler) KillSession(c *gin.Context) {
	sessionID := c.Param("id")
	log.Printf("[KillSession] Request for session: %q from %s", sessionID, c.ClientIP())

	// Check for empty session ID
	if sessionID == "" {
		log.Printf("[KillSession] Empty session ID")
		c.JSON(400, gin.H{"error": "Session ID is required"})
		return
	}

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.killRemoteSession(c, sessionID, remote)
			return
		}
	}

	// Kill local session
	if err := h.sessionManager.KillSession(sessionID); err != nil {
		log.Printf("[KillSession] Failed to kill session %s: %v", sessionID, err)
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to kill session: %v", err)})
		return
	}

	log.Printf("[KillSession] Successfully killed session %s", sessionID)
	c.JSON(200, gin.H{"success": true, "message": "Session killed"})
}

// CleanupSession cleans up session files
func (h *Handler) CleanupSession(c *gin.Context) {
	sessionID := c.Param("id")

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.cleanupRemoteSession(c, sessionID, remote)
			return
		}
	}

	// Cleanup local session
	if err := h.sessionManager.CleanupSession(sessionID); err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to cleanup session: %v", err)})
		return
	}

	c.JSON(200, gin.H{"success": true, "message": "Session cleaned up"})
}

// CleanupExitedSessions cleans up all exited sessions
func (h *Handler) CleanupExitedSessions(c *gin.Context) {
	// Cleanup local sessions
	localCleaned, err := h.sessionManager.CleanupExitedSessions()
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to cleanup local sessions: %v", err)})
		return
	}

	response := gin.H{
		"success":      true,
		"localCleaned": localCleaned,
	}

	// If HQ mode, cleanup remote sessions too
	if h.config.IsHQMode && h.remoteRegistry != nil {
		remoteResults := h.remoteRegistry.CleanupExitedSessions()
		response["remoteResults"] = remoteResults

		totalCleaned := localCleaned
		for _, result := range remoteResults {
			if cleaned, ok := result["cleaned"].(int); ok {
				totalCleaned += cleaned
			}
		}
		response["message"] = fmt.Sprintf("%d exited sessions cleaned up across all servers", totalCleaned)
	} else {
		response["message"] = fmt.Sprintf("%d exited sessions cleaned up", localCleaned)
	}

	c.JSON(200, response)
}

// GetSessionBuffer gets the terminal buffer snapshot
func (h *Handler) GetSessionBuffer(c *gin.Context) {
	sessionID := c.Param("id")

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.getRemoteSessionBuffer(c, sessionID, remote)
			return
		}
	}

	// Get local session buffer
	buffer, err := h.terminalManager.GetBufferSnapshot(sessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Session not found"})
		return
	}

	c.Data(200, "application/octet-stream", buffer)
}

// StreamSession streams session output via SSE
func (h *Handler) StreamSession(c *gin.Context) {
	sessionID := c.Param("id")

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.streamRemoteSession(c, sessionID, remote)
			return
		}
	}

	// Set SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	// Create client
	client := &stream.Client{
		ID:          uuid.New().String(),
		SessionID:   sessionID,
		SendChannel: make(chan string, 100),
		Done:        make(chan bool),
	}

	// Add client to watcher
	if err := h.streamWatcher.AddClient(sessionID, client); err != nil {
		c.String(200, "data: {\"error\":\"Failed to start streaming\"}\n\n")
		return
	}
	defer h.streamWatcher.RemoveClient(sessionID, client.ID)

	// Send initial OK
	c.String(200, ":ok\n\n")
	c.Writer.Flush()

	// Stream events
	for {
		select {
		case data := <-client.SendChannel:
			c.String(200, data)
			c.Writer.Flush()

		case <-c.Request.Context().Done():
			return

		case <-client.Done:
			return
		}
	}
}

// SendInput sends input to a session
func (h *Handler) SendInput(c *gin.Context) {
	sessionID := c.Param("id")
	log.Printf("[SendInput] Request for session %s from %s", sessionID, c.ClientIP())

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.sendInputToRemote(c, sessionID, remote)
			return
		}
	}

	// Parse request body
	var req struct {
		Text string `json:"text"`
		Key  string `json:"key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[SendInput] Invalid request body: %v", err)
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}

	log.Printf("[SendInput] Session %s - Text: %q, Key: %q", sessionID, req.Text, req.Key)

	// Validate: must have either text or key, not both
	if (req.Text == "" && req.Key == "") || (req.Text != "" && req.Key != "") {
		c.JSON(400, gin.H{"error": "Must provide either 'text' or 'key', not both"})
		return
	}

	// Send input
	var err error
	if req.Text != "" {
		err = h.sessionManager.SendInput(sessionID, req.Text)
	} else {
		err = h.sessionManager.SendKey(sessionID, req.Key)
	}

	if err != nil {
		log.Printf("[SendInput] Failed to send input: %v", err)
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to send input: %v", err)})
		return
	}

	log.Printf("[SendInput] Successfully sent input to session %s", sessionID)
	c.JSON(200, gin.H{"success": true})
}

// ResizeSession resizes a session
func (h *Handler) ResizeSession(c *gin.Context) {
	sessionID := c.Param("id")

	// Check if it's a remote session in HQ mode
	if h.config.IsHQMode && h.remoteRegistry != nil {
		if remote := h.remoteRegistry.GetRemoteBySessionID(sessionID); remote != nil {
			h.resizeRemoteSession(c, sessionID, remote)
			return
		}
	}

	// Parse request body
	var req struct {
		Cols int `json:"cols" binding:"required"`
		Rows int `json:"rows" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}

	// Validate dimensions
	if req.Cols < 1 || req.Cols > 1000 || req.Rows < 1 || req.Rows > 1000 {
		c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid dimensions: %dx%d", req.Cols, req.Rows)})
		return
	}

	// Resize session
	if err := h.sessionManager.ResizeSession(sessionID, req.Cols, req.Rows); err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to resize session: %v", err)})
		return
	}

	c.JSON(200, gin.H{"success": true, "cols": req.Cols, "rows": req.Rows})
}

// Helper functions for remote session operations would go here...
// For now, we'll implement basic stubs

func (h *Handler) createRemoteSession(c *gin.Context, req CreateSessionRequest) {
	// TODO: Implement remote session creation
	c.JSON(501, gin.H{"error": "Remote session creation not yet implemented"})
}

func (h *Handler) getRemoteSession(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote session retrieval
	c.JSON(501, gin.H{"error": "Remote session retrieval not yet implemented"})
}

func (h *Handler) killRemoteSession(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote session kill
	c.JSON(501, gin.H{"error": "Remote session kill not yet implemented"})
}

func (h *Handler) cleanupRemoteSession(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote session cleanup
	c.JSON(501, gin.H{"error": "Remote session cleanup not yet implemented"})
}

func (h *Handler) getRemoteSessionBuffer(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote session buffer retrieval
	c.JSON(501, gin.H{"error": "Remote session buffer retrieval not yet implemented"})
}

func (h *Handler) streamRemoteSession(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote session streaming
	c.String(200, "data: {\"error\":\"Remote session streaming not yet implemented\"}\n\n")
}

func (h *Handler) sendInputToRemote(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote input sending
	c.JSON(501, gin.H{"error": "Remote input sending not yet implemented"})
}

func (h *Handler) resizeRemoteSession(c *gin.Context, sessionID string, remote interface{}) {
	// TODO: Implement remote session resize
	c.JSON(501, gin.H{"error": "Remote session resize not yet implemented"})
}
