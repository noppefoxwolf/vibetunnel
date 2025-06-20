package hq

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
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

// RemoteServer represents a registered remote server
type RemoteServer struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	URL          string            `json:"url"`
	BearerToken  string            `json:"bearerToken"`
	RegisteredAt time.Time         `json:"registeredAt"`
	LastSeen     time.Time         `json:"lastSeen"`
	Sessions     []SessionResponse `json:"sessions,omitempty"`
	SessionMap   map[string]bool   `json:"-"` // sessionID -> exists
}

// RemoteRegistry manages remote servers in HQ mode
type RemoteRegistry struct {
	config        *config.Config
	remotes       map[string]*RemoteServer // remoteID -> server
	sessionOwners map[string]string        // sessionID -> remoteID
	mu            sync.RWMutex
	stopChan      chan bool
	wg            sync.WaitGroup
}

// NewRemoteRegistry creates a new remote registry
func NewRemoteRegistry(cfg *config.Config) *RemoteRegistry {
	rr := &RemoteRegistry{
		config:        cfg,
		remotes:       make(map[string]*RemoteServer),
		sessionOwners: make(map[string]string),
		stopChan:      make(chan bool),
	}

	// Start health check goroutine
	rr.wg.Add(1)
	go rr.healthCheckLoop()

	return rr
}

// GetRemoteBySessionID returns the remote server that owns a session
func (r *RemoteRegistry) GetRemoteBySessionID(sessionID string) *RemoteServer {
	r.mu.RLock()
	defer r.mu.RUnlock()

	remoteID, exists := r.sessionOwners[sessionID]
	if !exists {
		return nil
	}

	return r.remotes[remoteID]
}

// GetAllSessions returns all sessions from all remotes
func (r *RemoteRegistry) GetAllSessions() []SessionResponse {
	r.mu.RLock()
	defer r.mu.RUnlock()

	sessions := []SessionResponse{}
	for _, remote := range r.remotes {
		for _, session := range remote.Sessions {
			// Add remote info to session
			session.Source = "remote"
			session.RemoteID = remote.ID
			session.RemoteName = remote.Name
			session.RemoteURL = remote.URL
			sessions = append(sessions, session)
		}
	}

	return sessions
}

// CleanupExitedSessions cleans up exited sessions on all remotes
func (r *RemoteRegistry) CleanupExitedSessions() []map[string]interface{} {
	r.mu.RLock()
	remotes := make([]*RemoteServer, 0, len(r.remotes))
	for _, remote := range r.remotes {
		remotes = append(remotes, remote)
	}
	r.mu.RUnlock()

	results := []map[string]interface{}{}
	for _, remote := range remotes {
		result := map[string]interface{}{
			"remoteId":   remote.ID,
			"remoteName": remote.Name,
		}

		// Call cleanup endpoint on remote
		req, err := http.NewRequest("POST", remote.URL+"/api/sessions/cleanup-exited", nil)
		if err != nil {
			result["error"] = err.Error()
			results = append(results, result)
			continue
		}

		req.Header.Set("Authorization", "Bearer "+remote.BearerToken)
		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			result["error"] = err.Error()
		} else {
			defer resp.Body.Close()
			var cleanupResp map[string]interface{}
			if err := json.NewDecoder(resp.Body).Decode(&cleanupResp); err == nil {
				if cleaned, ok := cleanupResp["localCleaned"].(float64); ok {
					result["cleaned"] = int(cleaned)
				}
			}
		}

		results = append(results, result)
	}

	return results
}

// Stop stops the remote registry
func (r *RemoteRegistry) Stop() {
	close(r.stopChan)
	r.wg.Wait()
}

// RegisterRemote registers a new remote server
func (r *RemoteRegistry) RegisterRemote(name, url, bearerToken string) (*RemoteServer, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Check if name already exists
	for _, remote := range r.remotes {
		if remote.Name == name {
			return nil, fmt.Errorf("remote with name %s already exists", name)
		}
	}

	// Create new remote
	remote := &RemoteServer{
		ID:           uuid.New().String(),
		Name:         name,
		URL:          url,
		BearerToken:  bearerToken,
		RegisteredAt: time.Now(),
		LastSeen:     time.Now(),
		Sessions:     []SessionResponse{},
		SessionMap:   make(map[string]bool),
	}

	r.remotes[remote.ID] = remote

	// Fetch initial sessions
	go r.refreshRemoteSessions(remote)

	log.Printf("Registered remote server: %s (%s) at %s", name, remote.ID, url)
	return remote, nil
}

// UnregisterRemote unregisters a remote server
func (r *RemoteRegistry) UnregisterRemote(remoteID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	remote, exists := r.remotes[remoteID]
	if !exists {
		return fmt.Errorf("remote %s not found", remoteID)
	}

	// Remove session ownership mappings
	for sessionID := range remote.SessionMap {
		delete(r.sessionOwners, sessionID)
	}

	delete(r.remotes, remoteID)
	log.Printf("Unregistered remote server: %s (%s)", remote.Name, remoteID)
	return nil
}

// GetRemotes returns all registered remotes
func (r *RemoteRegistry) GetRemotes() []*RemoteServer {
	r.mu.RLock()
	defer r.mu.RUnlock()

	remotes := make([]*RemoteServer, 0, len(r.remotes))
	for _, remote := range r.remotes {
		remotes = append(remotes, remote)
	}
	return remotes
}

// RefreshRemoteSessions refreshes sessions for a specific remote
func (r *RemoteRegistry) RefreshRemoteSessions(remoteID string) error {
	r.mu.RLock()
	remote, exists := r.remotes[remoteID]
	r.mu.RUnlock()

	if !exists {
		return fmt.Errorf("remote %s not found", remoteID)
	}

	return r.refreshRemoteSessions(remote)
}

// refreshRemoteSessions fetches sessions from a remote server
func (r *RemoteRegistry) refreshRemoteSessions(remote *RemoteServer) error {
	// Call sessions endpoint on remote
	req, err := http.NewRequest("GET", remote.URL+"/api/sessions", nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+remote.BearerToken)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("remote returned status %d", resp.StatusCode)
	}

	var sessions []SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&sessions); err != nil {
		return err
	}

	// Update registry
	r.mu.Lock()
	defer r.mu.Unlock()

	// Clear old session mappings
	for sessionID := range remote.SessionMap {
		delete(r.sessionOwners, sessionID)
	}
	remote.SessionMap = make(map[string]bool)

	// Add new sessions
	remote.Sessions = sessions
	remote.LastSeen = time.Now()
	for _, session := range sessions {
		remote.SessionMap[session.ID] = true
		r.sessionOwners[session.ID] = remote.ID
	}

	return nil
}

// healthCheckLoop periodically checks health of remote servers
func (r *RemoteRegistry) healthCheckLoop() {
	defer r.wg.Done()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			r.checkRemoteHealth()
		case <-r.stopChan:
			return
		}
	}
}

// checkRemoteHealth checks health of all remote servers
func (r *RemoteRegistry) checkRemoteHealth() {
	r.mu.RLock()
	remotes := make([]*RemoteServer, 0, len(r.remotes))
	for _, remote := range r.remotes {
		remotes = append(remotes, remote)
	}
	r.mu.RUnlock()

	for _, remote := range remotes {
		// Call health endpoint
		req, err := http.NewRequest("GET", remote.URL+"/api/health", nil)
		if err != nil {
			log.Printf("Failed to create health check request for %s: %v", remote.Name, err)
			continue
		}

		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Health check failed for remote %s: %v", remote.Name, err)
			// Could mark as unhealthy or remove after multiple failures
			continue
		}
		resp.Body.Close()

		if resp.StatusCode == 200 {
			// Update last seen
			r.mu.Lock()
			if r, exists := r.remotes[remote.ID]; exists {
				r.LastSeen = time.Now()
			}
			r.mu.Unlock()

			// Refresh sessions
			r.refreshRemoteSessions(remote)
		}
	}
}