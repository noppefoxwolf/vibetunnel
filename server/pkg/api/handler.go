package api

import (
	"github.com/gin-gonic/gin"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
	"github.com/vibetunnel/vibetunnel-server/pkg/hq"
	"github.com/vibetunnel/vibetunnel-server/pkg/session"
	"github.com/vibetunnel/vibetunnel-server/pkg/stream"
	"github.com/vibetunnel/vibetunnel-server/pkg/terminal"
)

// Handler handles API requests
type Handler struct {
	config           *config.Config
	sessionManager   *session.Manager
	terminalManager  *terminal.Manager
	streamWatcher    *stream.Watcher
	bufferAggregator *stream.BufferAggregator
	remoteRegistry   *hq.RemoteRegistry // nil if not in HQ mode
}

// NewHandler creates a new API handler
func NewHandler(
	cfg *config.Config,
	sm *session.Manager,
	tm *terminal.Manager,
	sw *stream.Watcher,
	ba *stream.BufferAggregator,
	rr *hq.RemoteRegistry,
) *Handler {
	return &Handler{
		config:           cfg,
		sessionManager:   sm,
		terminalManager:  tm,
		streamWatcher:    sw,
		bufferAggregator: ba,
		remoteRegistry:   rr,
	}
}

// RegisterRoutes registers all API routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	// Global cleanup endpoint (matches other server implementations)
	router.POST("/cleanup-exited", h.CleanupExitedSessions)

	// Session routes
	sessions := router.Group("/sessions")
	{
		sessions.GET("", h.ListSessions)
		sessions.POST("", h.CreateSession)
		sessions.GET("/:id", h.GetSession)
		sessions.DELETE("/:id", h.KillSession)
		sessions.DELETE("/:id/cleanup", h.CleanupSession)
		sessions.POST("/cleanup-exited", h.CleanupExitedSessions)

		// Session interaction
		sessions.GET("/:id/buffer", h.GetSessionBuffer)
		sessions.GET("/:id/stream", h.StreamSession)
		sessions.POST("/:id/input", h.SendInput)
		sessions.POST("/:id/resize", h.ResizeSession)
	}

	// Remote routes (HQ mode only)
	if h.config.IsHQMode {
		remotes := router.Group("/remotes")
		{
			remotes.GET("", h.ListRemotes)
			remotes.POST("/register", h.RegisterRemote)
			remotes.DELETE("/:id", h.UnregisterRemote)
			remotes.POST("/:name/refresh-sessions", h.RefreshRemoteSessions)
		}
	}
}
