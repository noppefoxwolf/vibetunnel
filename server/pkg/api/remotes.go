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

	// TODO: Implement
	c.JSON(200, []interface{}{})
}

// RegisterRemote registers a new remote server (HQ mode only)
func (h *Handler) RegisterRemote(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	// TODO: Implement
	c.JSON(501, gin.H{"error": "Not implemented"})
}

// UnregisterRemote unregisters a remote server (HQ mode only)
func (h *Handler) UnregisterRemote(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	// TODO: Implement
	c.JSON(501, gin.H{"error": "Not implemented"})
}

// RefreshRemoteSessions refreshes session list for a remote (HQ mode only)
func (h *Handler) RefreshRemoteSessions(c *gin.Context) {
	if !h.config.IsHQMode || h.remoteRegistry == nil {
		c.JSON(404, gin.H{"error": "Not in HQ mode"})
		return
	}

	// TODO: Implement
	c.JSON(501, gin.H{"error": "Not implemented"})
}