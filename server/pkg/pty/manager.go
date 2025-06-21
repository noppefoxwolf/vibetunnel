package pty

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/fsnotify/fsnotify"
	"github.com/google/uuid"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// SessionInfo holds information about a PTY session
type SessionInfo struct {
	ID          string    `json:"id"`
	Command     string    `json:"command"`    // Stored as cmdline in JSON
	CommandLine []string  `json:"cmdline"`    // TypeScript compatibility
	WorkingDir  string    `json:"workingDir"` // Stored as cwd in JSON
	CWD         string    `json:"cwd"`        // TypeScript compatibility
	Name        string    `json:"name"`
	Status      string    `json:"status"` // starting, running, exited
	ExitCode    int       `json:"exitCode,omitempty"`
	StartedAt   time.Time `json:"startedAt"`  // Stored as started_at in JSON
	StartedAtTS string    `json:"started_at"` // TypeScript compatibility
	PID         int       `json:"pid,omitempty"`
	Cols        int       `json:"cols"`
	Rows        int       `json:"rows"`
	Term        string    `json:"term"`
	SpawnType   string    `json:"spawn_type,omitempty"`  // "pty" or "external"
	IsSpawned   bool      `json:"-"`                     // Computed from SpawnType
	ControlPath string    `json:"controlPath,omitempty"` // path to control pipe for external sessions
}

// Manager manages PTY sessions
type Manager struct {
	config   *config.Config
	sessions map[string]*session
	mu       sync.RWMutex
	wg       sync.WaitGroup
}

// session represents an active PTY session
type session struct {
	info         *SessionInfo
	pty          *os.File
	cmd          *exec.Cmd
	streamFile   *os.File
	stdinWatcher *fsnotify.Watcher
	controlPipe  *os.File
	mu           sync.Mutex
	onExit       func(code int)
	onData       func(data []byte)
}

// NewManager creates a new PTY manager
func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		config:   cfg,
		sessions: make(map[string]*session),
	}
}

// CreateSession creates a new PTY session
func (m *Manager) CreateSession(command []string, opts CreateSessionOptions) (*SessionInfo, error) {
	if len(command) == 0 {
		return nil, fmt.Errorf("command cannot be empty")
	}

	sessionID := uuid.New().String()
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)

	// Create session directory
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create session directory: %v", err)
	}

	// Set defaults
	if opts.Cols == 0 {
		opts.Cols = m.config.DefaultCols
	}
	if opts.Rows == 0 {
		opts.Rows = m.config.DefaultRows
	}
	if opts.Term == "" {
		opts.Term = m.config.DefaultTerm
	}
	if opts.WorkingDir == "" {
		opts.WorkingDir, _ = os.Getwd()
	}
	if opts.Name == "" {
		// Use basename of command if no name provided (TypeScript compatibility)
		opts.Name = filepath.Base(command[0])
	}

	// Create session info
	info := &SessionInfo{
		ID:          sessionID,
		Command:     shellQuoteCommand(command),
		CommandLine: command, // Keep the original array
		WorkingDir:  opts.WorkingDir,
		CWD:         opts.WorkingDir, // TypeScript compatibility
		Name:        opts.Name,
		Status:      "starting",
		StartedAt:   time.Now(),
		StartedAtTS: time.Now().Format(time.RFC3339), // TypeScript compatibility
		Cols:        opts.Cols,
		Rows:        opts.Rows,
		Term:        opts.Term,
		SpawnType:   "pty",
		IsSpawned:   true,
	}

	// Create the command
	cmd := exec.Command(command[0], command[1:]...)
	cmd.Dir = opts.WorkingDir
	cmd.Env = append(os.Environ(), fmt.Sprintf("TERM=%s", opts.Term))

	// Create PTY
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: uint16(opts.Rows),
		Cols: uint16(opts.Cols),
	})
	if err != nil {
		os.RemoveAll(sessionDir)
		return nil, fmt.Errorf("failed to start pty: %v", err)
	}

	// Create stream file
	streamPath := filepath.Join(sessionDir, "stream-out")
	streamFile, err := os.Create(streamPath)
	if err != nil {
		ptmx.Close()
		cmd.Process.Kill()
		os.RemoveAll(sessionDir)
		return nil, fmt.Errorf("failed to create stream file: %v", err)
	}

	// Write asciinema header
	header := map[string]interface{}{
		"version":   2,
		"width":     opts.Cols,
		"height":    opts.Rows,
		"timestamp": info.StartedAt.Unix(),
		"env":       map[string]string{"TERM": opts.Term},
	}
	headerJSON, _ := json.Marshal(header)
	fmt.Fprintf(streamFile, "%s\n", headerJSON)

	// Create session
	sess := &session{
		info:       info,
		pty:        ptmx,
		cmd:        cmd,
		streamFile: streamFile,
		onExit:     opts.OnExit,
		onData:     opts.OnData,
	}

	// Update PID
	if cmd.Process != nil {
		info.PID = cmd.Process.Pid
		info.Status = "running"
	}

	// Save session info
	if err := m.saveSessionInfo(info); err != nil {
		ptmx.Close()
		cmd.Process.Kill()
		streamFile.Close()
		os.RemoveAll(sessionDir)
		return nil, fmt.Errorf("failed to save session info: %v", err)
	}

	// Create stdin pipe
	stdinPath := filepath.Join(sessionDir, "stdin")
	if err := m.createStdinPipe(stdinPath); err != nil {
		// Log error but continue
		fmt.Fprintf(os.Stderr, "Warning: failed to create stdin pipe: %v\n", err)
	}

	// Store session
	m.mu.Lock()
	m.sessions[sessionID] = sess
	m.mu.Unlock()

	// Start goroutine to copy PTY output
	m.wg.Add(1)
	go m.handlePTYOutput(sess)

	// Start goroutine to wait for process exit
	m.wg.Add(1)
	go m.handleProcessExit(sess)

	// Start stdin watcher
	if err := m.startStdinWatcher(sess, stdinPath); err != nil {
		// Log error but continue
		fmt.Fprintf(os.Stderr, "Warning: failed to start stdin watcher: %v\n", err)
	}

	return info, nil
}

// handlePTYOutput handles copying output from PTY to stream file
func (m *Manager) handlePTYOutput(sess *session) {
	defer m.wg.Done()

	buffer := make([]byte, 4096)
	startTime := sess.info.StartedAt

	for {
		n, err := sess.pty.Read(buffer)
		if n > 0 {
			data := buffer[:n]

			// Write to stream file
			sess.mu.Lock()
			if sess.streamFile != nil {
				elapsed := time.Since(startTime).Seconds()
				event := []interface{}{elapsed, "o", string(data)}
				eventJSON, _ := json.Marshal(event)
				fmt.Fprintf(sess.streamFile, "%s\n", eventJSON)
				sess.streamFile.Sync()
			}
			sess.mu.Unlock()

			// Call data callback
			if sess.onData != nil {
				sess.onData(data)
			}
		}
		if err != nil {
			if err != io.EOF {
				fmt.Fprintf(os.Stderr, "PTY read error: %v\n", err)
			}
			break
		}
	}
}

// handleProcessExit waits for the process to exit and updates session info
func (m *Manager) handleProcessExit(sess *session) {
	defer m.wg.Done()

	err := sess.cmd.Wait()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
				exitCode = status.ExitStatus()
			}
		}
	}

	// Update session info
	sess.info.Status = "exited"
	sess.info.ExitCode = exitCode
	m.saveSessionInfo(sess.info)

	// Write exit event to stream
	sess.mu.Lock()
	if sess.streamFile != nil {
		event := []interface{}{"exit", exitCode, sess.info.ID}
		eventJSON, _ := json.Marshal(event)
		fmt.Fprintf(sess.streamFile, "%s\n", eventJSON)
		sess.streamFile.Close()
		sess.streamFile = nil
	}
	sess.mu.Unlock()

	// Close PTY
	sess.pty.Close()

	// Call exit callback
	if sess.onExit != nil {
		sess.onExit(exitCode)
	}

	// Remove from active sessions
	m.mu.Lock()
	delete(m.sessions, sess.info.ID)
	m.mu.Unlock()
}

// SendInput sends input to a session
func (m *Manager) SendInput(sessionID string, input string) error {
	m.mu.RLock()
	sess, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if exists && sess.info.IsSpawned {
		// Direct write to PTY for spawned sessions
		_, err := sess.pty.Write([]byte(input))
		return err
	}

	// For external sessions, write to stdin file
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	stdinPath := filepath.Join(sessionDir, "stdin")

	// Check if session exists
	if _, err := os.Stat(filepath.Join(sessionDir, "session.json")); err != nil {
		return fmt.Errorf("session not found")
	}

	// Open FIFO in non-blocking mode to avoid hanging
	fd, err := syscall.Open(stdinPath, syscall.O_WRONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		// If it's a regular file (not FIFO), just write to it
		return os.WriteFile(stdinPath, []byte(input), 0644)
	}
	defer syscall.Close(fd)

	// Write input
	_, err = syscall.Write(fd, []byte(input))
	return err
}

// ResizeSession resizes a session's terminal
func (m *Manager) ResizeSession(sessionID string, cols, rows int) error {
	// Validate dimensions
	if cols < 1 || cols > 1000 || rows < 1 || rows > 1000 {
		return fmt.Errorf("invalid dimensions: %dx%d", cols, rows)
	}

	m.mu.RLock()
	sess, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if exists && sess.info.IsSpawned {
		// Direct resize for spawned sessions
		return pty.Setsize(sess.pty, &pty.Winsize{
			Cols: uint16(cols),
			Rows: uint16(rows),
		})
	}

	// For external sessions, send resize command via control pipe
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	controlPath := filepath.Join(sessionDir, "control")

	// Check if control pipe exists
	if _, err := os.Stat(controlPath); err != nil {
		// Try SIGWINCH as fallback
		info, err := m.loadSessionInfo(sessionID)
		if err != nil {
			return err
		}
		if info.PID > 0 {
			return syscall.Kill(info.PID, syscall.SIGWINCH)
		}
		return fmt.Errorf("no control pipe and no PID")
	}

	// Send resize command
	cmd := map[string]interface{}{
		"cmd":  "resize",
		"cols": cols,
		"rows": rows,
	}
	cmdJSON, _ := json.Marshal(cmd)

	return os.WriteFile(controlPath, cmdJSON, 0644)
}

// KillSession kills a session
func (m *Manager) KillSession(sessionID string) error {
	m.mu.RLock()
	sess, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if exists && sess.info.IsSpawned {
		// Try graceful termination first
		if err := sess.cmd.Process.Signal(syscall.SIGTERM); err != nil {
			return err
		}

		// Wait up to 3 seconds for graceful exit
		done := make(chan bool)
		go func() {
			for i := 0; i < 6; i++ {
				if !m.isProcessAlive(sess.info.PID) {
					done <- true
					return
				}
				time.Sleep(500 * time.Millisecond)
			}
			done <- false
		}()

		if !<-done {
			// Force kill
			sess.cmd.Process.Kill()
		}
		return nil
	}

	// For external sessions, use control pipe or signal
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	controlPath := filepath.Join(sessionDir, "control")

	// Try control pipe first
	if _, err := os.Stat(controlPath); err == nil {
		cmd := map[string]interface{}{
			"cmd":    "kill",
			"signal": "SIGTERM",
		}
		cmdJSON, _ := json.Marshal(cmd)
		if err := os.WriteFile(controlPath, cmdJSON, 0644); err == nil {
			// Give it time to process
			time.Sleep(100 * time.Millisecond)
		}
	}

	// Load session info for PID
	info, err := m.loadSessionInfo(sessionID)
	if err != nil {
		return err
	}

	if info.PID > 0 && m.isProcessAlive(info.PID) {
		// Try SIGTERM
		if err := syscall.Kill(info.PID, syscall.SIGTERM); err != nil {
			return err
		}

		// Wait for graceful exit
		for i := 0; i < 6; i++ {
			if !m.isProcessAlive(info.PID) {
				return nil
			}
			time.Sleep(500 * time.Millisecond)
		}

		// Force kill
		return syscall.Kill(info.PID, syscall.SIGKILL)
	}

	return nil
}

// Cleanup cleans up session files
func (m *Manager) Cleanup(sessionID string) error {
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	return os.RemoveAll(sessionDir)
}

// GetSession returns session info
func (m *Manager) GetSession(sessionID string) (*SessionInfo, error) {
	// Check active sessions first
	m.mu.RLock()
	if sess, exists := m.sessions[sessionID]; exists {
		m.mu.RUnlock()
		return sess.info, nil
	}
	m.mu.RUnlock()

	// Load from disk
	return m.loadSessionInfo(sessionID)
}

// Helper functions

func (m *Manager) saveSessionInfo(info *SessionInfo) error {
	sessionDir := filepath.Join(m.config.ControlDir, info.ID)
	infoPath := filepath.Join(sessionDir, "session.json")
	tempPath := infoPath + ".tmp"

	// Convert to TypeScript format for saving
	// Create a map that matches TypeScript's session.json format
	tsFormat := map[string]interface{}{
		"cmdline":    info.CommandLine, // Use the original array
		"name":       info.Name,
		"cwd":        info.WorkingDir,
		"status":     info.Status,
		"started_at": info.StartedAt.Format(time.RFC3339),
		"term":       info.Term,
		"spawn_type": "pty",
		"pid":        info.PID,
	}

	// Only add exit_code if session has exited
	if info.Status == "exited" {
		tsFormat["exit_code"] = info.ExitCode
	}

	// Add control path if it exists
	if info.ControlPath != "" {
		tsFormat["control_path"] = info.ControlPath
	}

	data, err := json.MarshalIndent(tsFormat, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		return err
	}

	return os.Rename(tempPath, infoPath)
}

func (m *Manager) loadSessionInfo(sessionID string) (*SessionInfo, error) {
	sessionDir := filepath.Join(m.config.ControlDir, sessionID)
	infoPath := filepath.Join(sessionDir, "session.json")

	data, err := os.ReadFile(infoPath)
	if err != nil {
		return nil, err
	}

	var info SessionInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}

	// Set the ID from the directory name (TypeScript doesn't store it in JSON)
	info.ID = sessionID

	// Copy TypeScript fields to Go fields
	if len(info.CommandLine) > 0 {
		info.Command = shellQuoteCommand(info.CommandLine)
	}
	if info.CWD != "" {
		info.WorkingDir = info.CWD
	}
	if info.StartedAtTS != "" {
		// Parse TypeScript ISO timestamp
		if t, err := time.Parse(time.RFC3339, info.StartedAtTS); err == nil {
			info.StartedAt = t
		}
	}

	// Set IsSpawned based on SpawnType
	info.IsSpawned = (info.SpawnType == "pty")

	return &info, nil
}

func (m *Manager) createStdinPipe(path string) error {
	// On Unix, create a FIFO
	return syscall.Mkfifo(path, 0600)
}

func (m *Manager) startStdinWatcher(sess *session, stdinPath string) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	sess.stdinWatcher = watcher

	// Watch the stdin file
	if err := watcher.Add(stdinPath); err != nil {
		watcher.Close()
		return err
	}

	// Start goroutine to handle stdin changes
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		defer watcher.Close()

		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write {
					// Read stdin file
					data, err := os.ReadFile(stdinPath)
					if err == nil && len(data) > 0 {
						// Write to PTY
						sess.pty.Write(data)
						// Clear stdin file
						os.Truncate(stdinPath, 0)
					}
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				fmt.Fprintf(os.Stderr, "Stdin watcher error: %v\n", err)
			}
		}
	}()

	return nil
}

func (m *Manager) isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	// Send signal 0 to check if process exists
	err := syscall.Kill(pid, 0)
	return err == nil
}

func shellQuoteCommand(command []string) string {
	if len(command) == 0 {
		return ""
	}
	// Join command array into a single string
	// In the future, might want to add proper shell escaping
	return strings.Join(command, " ")
}

// CreateSessionOptions holds options for creating a session
type CreateSessionOptions struct {
	Name       string
	WorkingDir string
	Cols       int
	Rows       int
	Term       string
	OnExit     func(code int)
	OnData     func(data []byte)
}
