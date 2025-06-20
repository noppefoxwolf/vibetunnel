package session

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/vibetunnel/vibetunnel-server/pkg/config"
	"github.com/vibetunnel/vibetunnel-server/pkg/pty"
)

// Manager manages sessions and their persistence
type Manager struct {
	config     *config.Config
	ptyManager *pty.Manager
	mu         sync.RWMutex
}

// Session represents a session with additional metadata
type Session struct {
	*pty.SessionInfo
	LastModified time.Time `json:"lastModified"`
	Waiting      bool      `json:"waiting"` // For cast files
}

// NewManager creates a new session manager
func NewManager(cfg *config.Config, ptyMgr *pty.Manager) *Manager {
	return &Manager{
		config:     cfg,
		ptyManager: ptyMgr,
	}
}

// CreateSession creates a new session
func (m *Manager) CreateSession(command []string, opts pty.CreateSessionOptions) (*pty.SessionInfo, error) {
	return m.ptyManager.CreateSession(command, opts)
}

// GetSession retrieves a session by ID
func (m *Manager) GetSession(sessionID string) (*Session, error) {
	info, err := m.ptyManager.GetSession(sessionID)
	if err != nil {
		return nil, err
	}

	// Get last modified time
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	streamPath := filepath.Join(sessionDir, "stream-out")
	
	lastModified := info.StartedAt
	if stat, err := os.Stat(streamPath); err == nil {
		lastModified = stat.ModTime()
	}

	return &Session{
		SessionInfo:  info,
		LastModified: lastModified,
		Waiting:      false,
	}, nil
}

// ListSessions lists all sessions
func (m *Manager) ListSessions() ([]*Session, error) {
	// Read control directory
	entries, err := ioutil.ReadDir(m.config.ControlDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*Session{}, nil
		}
		return nil, fmt.Errorf("failed to read control directory: %v", err)
	}

	var sessions []*Session
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Process entries in parallel
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		wg.Add(1)
		go func(sessionID string) {
			defer wg.Done()

			// Check if session.json exists
			sessionPath := filepath.Join(m.config.ControlDir, sessionID, "session.json")
			if _, err := os.Stat(sessionPath); err != nil {
				return
			}

			// Load session
			session, err := m.GetSession(sessionID)
			if err != nil {
				return
			}

			// Update zombie status
			if session.Status == "running" && !m.isProcessAlive(session.PID) {
				session.Status = "exited"
				// Save updated status
				m.updateSessionStatus(sessionID, "exited")
			}

			mu.Lock()
			sessions = append(sessions, session)
			mu.Unlock()
		}(entry.Name())
	}

	wg.Wait()

	// Sort by start time (newest first)
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].StartedAt.After(sessions[j].StartedAt)
	})

	return sessions, nil
}

// SendInput sends input to a session
func (m *Manager) SendInput(sessionID string, input string) error {
	return m.ptyManager.SendInput(sessionID, input)
}

// SendKey sends a special key to a session
func (m *Manager) SendKey(sessionID string, key string) error {
	// Map key names to sequences
	keyMap := map[string]string{
		"enter":      "\r",
		"tab":        "\t",
		"backspace":  "\x7f",
		"escape":     "\x1b",
		"up":         "\x1b[A",
		"down":       "\x1b[B",
		"right":      "\x1b[C",
		"left":       "\x1b[D",
		"home":       "\x1b[H",
		"end":        "\x1b[F",
		"pageup":     "\x1b[5~",
		"pagedown":   "\x1b[6~",
		"delete":     "\x1b[3~",
		"insert":     "\x1b[2~",
		"f1":         "\x1bOP",
		"f2":         "\x1bOQ",
		"f3":         "\x1bOR",
		"f4":         "\x1bOS",
		"f5":         "\x1b[15~",
		"f6":         "\x1b[17~",
		"f7":         "\x1b[18~",
		"f8":         "\x1b[19~",
		"f9":         "\x1b[20~",
		"f10":        "\x1b[21~",
		"f11":        "\x1b[23~",
		"f12":        "\x1b[24~",
	}

	// Handle ctrl+key combinations
	if strings.HasPrefix(key, "ctrl+") {
		char := key[5:]
		if len(char) == 1 {
			// Convert to control character
			charCode := int(char[0])
			if charCode >= 97 && charCode <= 122 { // a-z
				return m.SendInput(sessionID, string(rune(charCode-96)))
			}
		}
	}

	// Handle alt+key combinations
	if strings.HasPrefix(key, "alt+") {
		char := key[4:]
		if len(char) == 1 {
			return m.SendInput(sessionID, "\x1b"+char)
		}
	}

	// Look up key in map
	if seq, ok := keyMap[key]; ok {
		return m.SendInput(sessionID, seq)
	}

	return fmt.Errorf("unknown key: %s", key)
}

// ResizeSession resizes a session
func (m *Manager) ResizeSession(sessionID string, cols, rows int) error {
	return m.ptyManager.ResizeSession(sessionID, cols, rows)
}

// KillSession kills a session
func (m *Manager) KillSession(sessionID string) error {
	return m.ptyManager.KillSession(sessionID)
}

// CleanupSession removes session files
func (m *Manager) CleanupSession(sessionID string) error {
	return m.ptyManager.Cleanup(sessionID)
}

// CleanupExitedSessions removes all exited sessions
func (m *Manager) CleanupExitedSessions() (int, error) {
	sessions, err := m.ListSessions()
	if err != nil {
		return 0, err
	}

	count := 0
	for _, session := range sessions {
		if session.Status == "exited" {
			if err := m.CleanupSession(session.ID); err == nil {
				count++
			}
		}
	}

	return count, nil
}

// FindExternalSession finds a session by control path
func (m *Manager) FindExternalSession(controlPath string) (*Session, error) {
	sessions, err := m.ListSessions()
	if err != nil {
		return nil, err
	}

	for _, session := range sessions {
		if session.ControlPath == controlPath {
			return session, nil
		}
	}

	return nil, fmt.Errorf("session not found")
}

// RegisterExternalSession registers a session created externally
func (m *Manager) RegisterExternalSession(sessionID string) error {
	// The session should already exist in the control directory
	// Just validate it exists
	_, err := m.GetSession(sessionID)
	return err
}

// Helper functions

func (m *Manager) isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	
	// Check if process exists
	procPath := fmt.Sprintf("/proc/%d", pid)
	if _, err := os.Stat(procPath); err == nil {
		return true
	}
	
	// Fallback: try to send signal 0
	if _, err := os.FindProcess(pid); err == nil {
		return true
	}
	
	return false
}

func (m *Manager) updateSessionStatus(sessionID string, status string) error {
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	infoPath := filepath.Join(sessionDir, "session.json")

	// Load existing info
	data, err := ioutil.ReadFile(infoPath)
	if err != nil {
		return err
	}

	var info pty.SessionInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return err
	}

	// Update status
	info.Status = status

	// Save back
	tempPath := infoPath + ".tmp"
	newData, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return err
	}

	if err := ioutil.WriteFile(tempPath, newData, 0644); err != nil {
		return err
	}

	return os.Rename(tempPath, infoPath)
}