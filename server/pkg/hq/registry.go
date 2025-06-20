package hq

import (
	"time"

	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// SessionResponse represents a session in API responses (duplicated to avoid import cycle)
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
	Source       string    `json:"source,omitempty"`
	RemoteID     string    `json:"remoteId,omitempty"`
	RemoteName   string    `json:"remoteName,omitempty"`
	RemoteURL    string    `json:"remoteUrl,omitempty"`
	Waiting      bool      `json:"waiting,omitempty"`
}

// RemoteRegistry manages remote servers in HQ mode
type RemoteRegistry struct {
	config *config.Config
}

// NewRemoteRegistry creates a new remote registry
func NewRemoteRegistry(cfg *config.Config) *RemoteRegistry {
	return &RemoteRegistry{
		config: cfg,
	}
}

// GetRemoteBySessionID returns the remote server that owns a session
func (r *RemoteRegistry) GetRemoteBySessionID(sessionID string) interface{} {
	// TODO: Implement
	return nil
}

// GetAllSessions returns all sessions from all remotes
func (r *RemoteRegistry) GetAllSessions() []SessionResponse {
	// TODO: Implement
	return []SessionResponse{}
}

// CleanupExitedSessions cleans up exited sessions on all remotes
func (r *RemoteRegistry) CleanupExitedSessions() []map[string]interface{} {
	// TODO: Implement
	return []map[string]interface{}{}
}

// Stop stops the remote registry
func (r *RemoteRegistry) Stop() {
	// TODO: Implement
}