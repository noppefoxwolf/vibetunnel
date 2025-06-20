package session

import (
	"fmt"
	"log"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// ControlDirWatcher watches the control directory for external session changes
type ControlDirWatcher struct {
	config  *config.Config
	manager *Manager
	watcher *fsnotify.Watcher
	done    chan bool
}

// NewControlDirWatcher creates a new control directory watcher
func NewControlDirWatcher(cfg *config.Config, mgr *Manager) *ControlDirWatcher {
	return &ControlDirWatcher{
		config:  cfg,
		manager: mgr,
		done:    make(chan bool),
	}
}

// Start starts watching the control directory
func (w *ControlDirWatcher) Start() error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("failed to create watcher: %v", err)
	}
	w.watcher = watcher

	// Add control directory to watcher
	if err := watcher.Add(w.config.ControlDir); err != nil {
		watcher.Close()
		return fmt.Errorf("failed to watch control directory: %v", err)
	}

	// Start event handler
	go w.handleEvents()

	log.Printf("Started control directory watcher on %s", w.config.ControlDir)
	return nil
}

// Stop stops the watcher
func (w *ControlDirWatcher) Stop() {
	if w.watcher != nil {
		close(w.done)
		w.watcher.Close()
		log.Println("Stopped control directory watcher")
	}
}

// handleEvents processes file system events
func (w *ControlDirWatcher) handleEvents() {
	for {
		select {
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			w.processEvent(event)

		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Control directory watcher error: %v", err)

		case <-w.done:
			return
		}
	}
}

// processEvent processes a single file system event
func (w *ControlDirWatcher) processEvent(event fsnotify.Event) {
	// We're interested in new directories being created
	if event.Op&fsnotify.Create == fsnotify.Create {
		// Check if it's a directory (session ID)
		base := filepath.Base(event.Name)
		
		// Skip if it's not a UUID-like directory
		if !isUUIDLike(base) {
			return
		}

		// Check if it's a new session directory
		sessionPath := filepath.Join(w.config.ControlDir, base, "session.json")
		if _, err := filepath.EvalSymlinks(sessionPath); err == nil {
			// New external session detected
			log.Printf("Detected new external session: %s", base)
			
			// Register the session
			if err := w.manager.RegisterExternalSession(base); err != nil {
				log.Printf("Failed to register external session %s: %v", base, err)
			}
		}
	}
}

// isUUIDLike checks if a string looks like a UUID
func isUUIDLike(s string) bool {
	// Simple check: UUID v4 format is 36 chars with hyphens at specific positions
	if len(s) != 36 {
		return false
	}
	
	// Check hyphen positions
	if s[8] != '-' || s[13] != '-' || s[18] != '-' || s[23] != '-' {
		return false
	}
	
	// Check that other characters are hex
	hex := "0123456789abcdefABCDEF"
	for i, c := range s {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			continue // skip hyphens
		}
		if !strings.ContainsRune(hex, c) {
			return false
		}
	}
	
	return true
}