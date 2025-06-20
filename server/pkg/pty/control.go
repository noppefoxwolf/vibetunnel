package pty

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"syscall"

	"github.com/creack/pty"
)

// ControlMessage represents a control pipe message
type ControlMessage struct {
	Cmd    string `json:"cmd"`
	Cols   int    `json:"cols,omitempty"`
	Rows   int    `json:"rows,omitempty"`
	Signal string `json:"signal,omitempty"`
}

// startControlPipeListener starts listening for control messages
func (m *Manager) startControlPipeListener(sess *session, controlPath string) error {
	// Create control pipe
	if err := syscall.Mkfifo(controlPath, 0600); err != nil {
		return fmt.Errorf("failed to create control pipe: %v", err)
	}

	sess.info.ControlPath = controlPath
	m.saveSessionInfo(sess.info)

	// Start listener goroutine
	m.wg.Add(1)
	go m.listenControlPipe(sess, controlPath)

	return nil
}

// listenControlPipe listens for control messages
func (m *Manager) listenControlPipe(sess *session, controlPath string) {
	defer m.wg.Done()

	for {
		// Open control pipe for reading (blocks until writer connects)
		file, err := os.OpenFile(controlPath, os.O_RDONLY, 0)
		if err != nil {
			if !os.IsNotExist(err) {
				fmt.Fprintf(os.Stderr, "Failed to open control pipe: %v\n", err)
			}
			return
		}

		// Read messages
		decoder := json.NewDecoder(file)
		for {
			var msg ControlMessage
			if err := decoder.Decode(&msg); err != nil {
				break // EOF or error, close and reopen
			}

			// Process control message
			m.processControlMessage(sess, msg)
		}

		file.Close()
	}
}

// processControlMessage processes a control message
func (m *Manager) processControlMessage(sess *session, msg ControlMessage) {
	switch msg.Cmd {
	case "resize":
		if msg.Cols > 0 && msg.Rows > 0 {
			m.handleControlResize(sess, msg.Cols, msg.Rows)
		}
	case "kill":
		m.handleControlKill(sess, msg.Signal)
	default:
		fmt.Fprintf(os.Stderr, "Unknown control command: %s\n", msg.Cmd)
	}
}

// handleControlResize handles resize control message
func (m *Manager) handleControlResize(sess *session, cols, rows int) {
	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.pty != nil {
		pty.Setsize(sess.pty, &pty.Winsize{
			Cols: uint16(cols),
			Rows: uint16(rows),
		})
		
		// Update session info
		sess.info.Cols = cols
		sess.info.Rows = rows
		m.saveSessionInfo(sess.info)
	}
}

// handleControlKill handles kill control message
func (m *Manager) handleControlKill(sess *session, signal string) {
	if sess.cmd == nil || sess.cmd.Process == nil {
		return
	}

	var sig syscall.Signal
	switch signal {
	case "SIGTERM", "15":
		sig = syscall.SIGTERM
	case "SIGKILL", "9":
		sig = syscall.SIGKILL
	case "SIGINT", "2":
		sig = syscall.SIGINT
	default:
		sig = syscall.SIGTERM
	}

	sess.cmd.Process.Signal(sig)
}

// MonitorExternalSession monitors an external session
func (m *Manager) MonitorExternalSession(sessionID string) error {
	// Load session info
	info, err := m.loadSessionInfo(sessionID)
	if err != nil {
		return err
	}

	// Create session structure for external session
	sess := &session{
		info:      info,
		mu:        sync.Mutex{},
	}

	// Check if control pipe exists
	if info.ControlPath != "" {
		if _, err := os.Stat(info.ControlPath); err == nil {
			// Start control pipe listener
			m.wg.Add(1)
			go m.listenControlPipe(sess, info.ControlPath)
		}
	}

	// Store in sessions map
	m.mu.Lock()
	m.sessions[sessionID] = sess
	m.mu.Unlock()

	return nil
}