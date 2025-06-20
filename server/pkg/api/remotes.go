package api

import (
	"github.com/gin-gonic/gin"
)

// ListRemotes lists all registered remote servers (HQ mode only)
func (h *Handler) ListRemotes(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	remotes := h.remoteRegistry.GetRemotes()
	response := make([]map[string]interface{}, 0, len(remotes))

	for _, remote := range remotes {
		response = append(response, map[string]interface{}{
			"id":           remote.ID,
			"name":         remote.Name,
			"url":          remote.URL,
			"registeredAt": remote.RegisteredAt,
			"lastSeen":     remote.LastSeen,
			"sessionCount": len(remote.Sessions),
		})
	}

	c.JSON(200, response)
}

// RegisterRemote registers a new remote server (HQ mode only)
func (h *Handler) RegisterRemote(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	// Parse request body
	var req struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		BearerToken string `json:"bearerToken" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid request body"})
		return
	}

	// Register the remote
	remote, err := h.remoteRegistry.RegisterRemote(req.Name, req.URL, req.BearerToken)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{
		"id":   remote.ID,
		"name": remote.Name,
	})
}

// UnregisterRemote unregisters a remote server (HQ mode only)
func (h *Handler) UnregisterRemote(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	remoteID := c.Param("id")
	if remoteID == "" {
		c.JSON(400, gin.H{"error": "Remote ID is required"})
		return
	}

	if err := h.remoteRegistry.UnregisterRemote(remoteID); err != nil {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"success": true, "message": "Remote unregistered"})
}

// RefreshRemoteSessions refreshes session list for a remote (HQ mode only)
func (h *Handler) RefreshRemoteSessions(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	remoteName := c.Param("name")
	if remoteName == "" {
		c.JSON(400, gin.H{"error": "Remote name is required"})
		return
	}

	// Find remote by name
	var remoteID string
	for _, remote := range h.remoteRegistry.GetRemotes() {
		if remote.Name == remoteName {
			remoteID = remote.ID
			break
		}
	}

	if remoteID == "" {
		c.JSON(404, gin.H{"error": "Remote not found"})
		return
	}

	if err := h.remoteRegistry.RefreshRemoteSessions(remoteID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(200, gin.H{"success": true, "message": "Sessions refreshed"})
}