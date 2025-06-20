package stream

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// Client represents a connected SSE client
type Client struct {
	ID          string
	SessionID   string
	SendChannel chan string
	Done        chan bool
}

// Watcher watches stream files and sends events to clients
type Watcher struct {
	config   *config.Config
	clients  map[string][]*Client // sessionID -> clients
	watchers map[string]*sessionWatcher
	mu       sync.RWMutex
}

// sessionWatcher watches a single session's stream file
type sessionWatcher struct {
	sessionID  string
	streamPath string
	watcher    *fsnotify.Watcher
	file       *os.File
	offset     int64
	clients    []*Client
	done       chan bool
}

// NewWatcher creates a new stream watcher
func NewWatcher(cfg *config.Config) *Watcher {
	return &Watcher{
		config:   cfg,
		clients:  make(map[string][]*Client),
		watchers: make(map[string]*sessionWatcher),
	}
}

// AddClient adds a new SSE client for a session
func (w *Watcher) AddClient(sessionID string, client *Client) error {
	w.mu.Lock()
	defer w.mu.Unlock()

	// Add client to list
	w.clients[sessionID] = append(w.clients[sessionID], client)

	// Start watcher if not already running
	if _, exists := w.watchers[sessionID]; !exists {
		streamPath := filepath.Join(w.config.ControlDir, sessionID, "stream-out")
		if err := w.startSessionWatcher(sessionID, streamPath); err != nil {
			// Remove client on error
			w.removeClientLocked(sessionID, client.ID)
			return err
		}
	}

	// Send existing content to new client
	go w.sendExistingContent(sessionID, client)

	return nil
}

// RemoveClient removes an SSE client
func (w *Watcher) RemoveClient(sessionID, clientID string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.removeClientLocked(sessionID, clientID)
}

// removeClientLocked removes a client (must be called with lock held)
func (w *Watcher) removeClientLocked(sessionID, clientID string) {
	clients := w.clients[sessionID]
	for i, c := range clients {
		if c.ID == clientID {
			close(c.Done)
			w.clients[sessionID] = append(clients[:i], clients[i+1:]...)
			break
		}
	}

	// Stop watcher if no more clients
	if len(w.clients[sessionID]) == 0 {
		delete(w.clients, sessionID)
		if sw, exists := w.watchers[sessionID]; exists {
			close(sw.done)
			if sw.watcher != nil {
				sw.watcher.Close()
			}
			if sw.file != nil {
				sw.file.Close()
			}
			delete(w.watchers, sessionID)
		}
	}
}

// startSessionWatcher starts watching a session's stream file
func (w *Watcher) startSessionWatcher(sessionID, streamPath string) error {
	// Open stream file
	file, err := os.Open(streamPath)
	if err != nil {
		return fmt.Errorf("failed to open stream file: %v", err)
	}

	// Create file watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		file.Close()
		return fmt.Errorf("failed to create watcher: %v", err)
	}

	// Add stream file to watcher
	if err := watcher.Add(streamPath); err != nil {
		watcher.Close()
		file.Close()
		return fmt.Errorf("failed to watch stream file: %v", err)
	}

	sw := &sessionWatcher{
		sessionID:  sessionID,
		streamPath: streamPath,
		watcher:    watcher,
		file:       file,
		offset:     0,
		done:       make(chan bool),
	}

	w.watchers[sessionID] = sw

	// Start watcher goroutine
	go w.watchSession(sw)

	return nil
}

// watchSession watches a session's stream file for changes
func (w *Watcher) watchSession(sw *sessionWatcher) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case event, ok := <-sw.watcher.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Write == fsnotify.Write {
				w.readNewContent(sw)
			}

		case err, ok := <-sw.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Stream watcher error for session %s: %v", sw.sessionID, err)

		case <-ticker.C:
			// Send heartbeat to all clients
			w.sendToClients(sw.sessionID, ":heartbeat\n\n")

		case <-sw.done:
			return
		}
	}
}

// readNewContent reads new content from the stream file
func (w *Watcher) readNewContent(sw *sessionWatcher) {
	sw.file.Seek(sw.offset, 0)
	reader := bufio.NewReader(sw.file)

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err != io.EOF {
				log.Printf("Error reading stream file: %v", err)
			}
			break
		}

		sw.offset += int64(len(line))
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse and send event
		w.processStreamLine(sw.sessionID, line)
	}
}

// processStreamLine processes a line from the stream file
func (w *Watcher) processStreamLine(sessionID, line string) {
	// Try to parse as header (first line)
	var header map[string]interface{}
	if err := json.Unmarshal([]byte(line), &header); err == nil {
		if _, ok := header["version"]; ok {
			// It's a header, send it
			w.sendToClients(sessionID, fmt.Sprintf("data: %s\n\n", line))
			return
		}
	}

	// Try to parse as event array
	var event []interface{}
	if err := json.Unmarshal([]byte(line), &event); err != nil {
		return
	}

	if len(event) < 3 {
		return
	}

	// Format as data event
	eventData := map[string]interface{}{
		"type": event[1],
	}

	switch event[1] {
	case "o": // output
		eventData["text"] = event[2]
		eventData["timestamp"] = event[0]
	case "e": // exit
		eventData["code"] = event[2]
		eventData["timestamp"] = event[0]
	}

	data, _ := json.Marshal(eventData)
	w.sendToClients(sessionID, fmt.Sprintf("data: %s\n\n", data))
}

// sendToClients sends data to all clients watching a session
func (w *Watcher) sendToClients(sessionID, data string) {
	w.mu.RLock()
	clients := w.clients[sessionID]
	w.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.SendChannel <- data:
		case <-client.Done:
			// Client disconnected
		default:
			// Channel full, skip
		}
	}
}

// sendExistingContent sends existing stream content to a new client
func (w *Watcher) sendExistingContent(sessionID string, client *Client) {
	w.mu.RLock()
	sw, exists := w.watchers[sessionID]
	w.mu.RUnlock()

	if !exists {
		return
	}

	// Read entire file from beginning
	file, err := os.Open(sw.streamPath)
	if err != nil {
		return
	}
	defer file.Close()

	reader := bufio.NewReader(file)
	clientStartTime := time.Now()
	var sessionStartTime time.Time
	headerSent := false

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err != io.EOF {
				log.Printf("Error reading existing content: %v", err)
			}
			break
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// First line should be header
		if !headerSent {
			var header map[string]interface{}
			if err := json.Unmarshal([]byte(line), &header); err == nil {
				if ts, ok := header["timestamp"].(float64); ok {
					sessionStartTime = time.Unix(int64(ts), 0)
				}
				// Send header
				select {
				case client.SendChannel <- fmt.Sprintf("data: %s\n\n", line):
				case <-client.Done:
					return
				}
				headerSent = true
				continue
			}
		}

		// Parse event and adjust timestamp
		var event []interface{}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		if len(event) < 3 {
			continue
		}

		// Calculate relative timestamp for this client
		if ts, ok := event[0].(float64); ok {
			eventTime := sessionStartTime.Add(time.Duration(ts * float64(time.Second)))
			relativeTime := eventTime.Sub(clientStartTime).Seconds()
			if relativeTime < 0 {
				relativeTime = 0
			}
			event[0] = relativeTime
		}

		// Format and send event
		eventData := map[string]interface{}{
			"type":      event[1],
			"timestamp": event[0],
		}

		switch event[1] {
		case "o":
			eventData["text"] = event[2]
		case "e":
			eventData["code"] = event[2]
		}

		data, _ := json.Marshal(eventData)
		select {
		case client.SendChannel <- fmt.Sprintf("data: %s\n\n", data):
		case <-client.Done:
			return
		}
	}
}