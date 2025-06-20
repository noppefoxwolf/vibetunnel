package terminal

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// Terminal represents a terminal state
type Terminal struct {
	SessionID    string
	Cols         int
	Rows         int
	Buffer       [][]Cell
	CursorX      int
	CursorY      int
	ScrollbackTop int
	LastUpdate   time.Time
	watcher      *fsnotify.Watcher
	streamFile   *os.File
	offset       int64
	mu           sync.RWMutex
	
	// ANSI state
	parser             *ANSIParser
	currentFgColor     int32
	currentBgColor     int32
	currentAttributes  uint8
	savedCursorX       int
	savedCursorY       int
}

// Cell represents a terminal cell
type Cell struct {
	Char       rune
	FgColor    int32 // -1 for default, 0-255 for palette, RGB encoded as 0x1RRGGBB
	BgColor    int32 // -1 for default, 0-255 for palette, RGB encoded as 0x1RRGGBB
	Attributes uint8 // Bit flags for bold, italic, etc.
}

// Attribute bit flags
const (
	AttrBold          uint8 = 1 << 0
	AttrItalic        uint8 = 1 << 1
	AttrUnderline     uint8 = 1 << 2
	AttrDim           uint8 = 1 << 3
	AttrInverse       uint8 = 1 << 4
	AttrInvisible     uint8 = 1 << 5
	AttrStrikethrough uint8 = 1 << 6
)

// Manager manages terminal states
type Manager struct {
	config      *config.Config
	terminals   map[string]*Terminal
	mu          sync.RWMutex
	subscribers map[string][]func(string) // sessionID -> callbacks
	subMu       sync.RWMutex
	debounceTimers map[string]*time.Timer
	debounceMu    sync.Mutex
}

// NewManager creates a new terminal manager
func NewManager(cfg *config.Config) *Manager {
	return &Manager{
		config:         cfg,
		terminals:      make(map[string]*Terminal),
		subscribers:    make(map[string][]func(string)),
		debounceTimers: make(map[string]*time.Timer),
	}
}

// GetOrCreateTerminal gets or creates a terminal for a session
func (m *Manager) GetOrCreateTerminal(sessionID string) (*Terminal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if term, exists := m.terminals[sessionID]; exists {
		return term, nil
	}

	// Create new terminal
	term := &Terminal{
		SessionID:      sessionID,
		Cols:           m.config.DefaultCols,
		Rows:           m.config.DefaultRows,
		Buffer:         make([][]Cell, m.config.ScrollbackBuffer),
		CursorX:        0,
		CursorY:        0,
		LastUpdate:     time.Now(),
		currentFgColor: -1,
		currentBgColor: -1,
	}

	// Initialize buffer with empty rows
	for i := range term.Buffer {
		term.Buffer[i] = make([]Cell, term.Cols)
	}
	
	// Create ANSI parser
	term.parser = NewANSIParser(term)

	// Start watching stream file
	streamPath := filepath.Join(m.config.ControlDir, sessionID, "stream-out")
	if err := m.startWatchingStream(term, streamPath); err != nil {
		return nil, err
	}

	m.terminals[sessionID] = term
	return term, nil
}

// GetBufferSnapshot returns a binary encoded snapshot of the terminal buffer
func (m *Manager) GetBufferSnapshot(sessionID string) ([]byte, error) {
	term, err := m.GetOrCreateTerminal(sessionID)
	if err != nil {
		return nil, err
	}

	term.mu.RLock()
	defer term.mu.RUnlock()

	return m.encodeSnapshot(term), nil
}

// startWatchingStream starts watching a stream file for changes
func (m *Manager) startWatchingStream(term *Terminal, streamPath string) error {
	// Open stream file
	file, err := os.Open(streamPath)
	if err != nil {
		if os.IsNotExist(err) {
			// File doesn't exist yet, that's ok
			return nil
		}
		return err
	}
	term.streamFile = file

	// Read existing content
	if err := m.readStreamFile(term); err != nil {
		file.Close()
		return err
	}

	// Create watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		file.Close()
		return err
	}
	term.watcher = watcher

	// Watch the stream file
	if err := watcher.Add(streamPath); err != nil {
		watcher.Close()
		file.Close()
		return err
	}

	// Start watcher goroutine
	go m.watchStream(term)

	return nil
}

// watchStream watches for stream file changes
func (m *Manager) watchStream(term *Terminal) {
	for {
		select {
		case event, ok := <-term.watcher.Events:
			if !ok {
				return
			}
			if event.Op&fsnotify.Write == fsnotify.Write {
				if err := m.readStreamFile(term); err != nil {
					log.Printf("Error reading stream file: %v", err)
				}
			}

		case err, ok := <-term.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Stream watcher error: %v", err)
		}
	}
}

// readStreamFile reads new content from the stream file
func (m *Manager) readStreamFile(term *Terminal) error {
	if term.streamFile == nil {
		return nil
	}

	// Seek to last read position
	term.streamFile.Seek(term.offset, 0)

	reader := bufio.NewReader(term.streamFile)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err != io.EOF {
				return err
			}
			break
		}

		// Update offset
		term.offset += int64(len(line))

		// Parse line
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// First line is header
		if term.offset == int64(len(line)) {
			var header map[string]interface{}
			if err := json.Unmarshal([]byte(line), &header); err == nil {
				// Update terminal dimensions from header
				if width, ok := header["width"].(float64); ok {
					term.Cols = int(width)
				}
				if height, ok := header["height"].(float64); ok {
					term.Rows = int(height)
				}
			}
			continue
		}

		// Parse event array [timestamp, type, data]
		var event []interface{}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}

		if len(event) < 3 {
			continue
		}

		eventType, ok := event[1].(string)
		if !ok {
			continue
		}

		switch eventType {
		case "o": // output
			if data, ok := event[2].(string); ok {
				m.processOutput(term, data)
			}
		case "r": // resize
			if data, ok := event[2].(string); ok {
				m.processResize(term, data)
			}
		}
	}

	// Schedule buffer change notification
	m.scheduleBufferChangeNotification(term.SessionID)

	return nil
}

// processOutput processes terminal output
func (m *Manager) processOutput(term *Terminal, data string) {
	// Use ANSI parser to process the output
	term.parser.Parse([]byte(data))
	term.LastUpdate = time.Now()
}

// processResize processes terminal resize
func (m *Manager) processResize(term *Terminal, data string) {
	parts := strings.Split(data, "x")
	if len(parts) != 2 {
		return
	}

	cols, err1 := strconv.Atoi(parts[0])
	rows, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return
	}

	term.mu.Lock()
	defer term.mu.Unlock()

	term.Cols = cols
	term.Rows = rows

	// Resize buffer rows
	for i := range term.Buffer {
		if len(term.Buffer[i]) < cols {
			// Extend row
			term.Buffer[i] = append(term.Buffer[i], make([]Cell, cols-len(term.Buffer[i]))...)
		} else if len(term.Buffer[i]) > cols {
			// Truncate row
			term.Buffer[i] = term.Buffer[i][:cols]
		}
	}
}

// encodeSnapshot encodes the terminal buffer into binary format
func (m *Manager) encodeSnapshot(term *Terminal) []byte {
	var buf bytes.Buffer

	// Write header (32 bytes)
	buf.Write([]byte{0x56, 0x54}) // Magic "VT"
	buf.WriteByte(0x01)            // Version
	buf.WriteByte(0x00)            // Flags

	// Dimensions
	binary.Write(&buf, binary.LittleEndian, uint32(term.Cols))
	binary.Write(&buf, binary.LittleEndian, uint32(term.Rows))

	// Viewport and cursor
	viewportY := term.CursorY - term.Rows + 1
	if viewportY < 0 {
		viewportY = 0
	}
	binary.Write(&buf, binary.LittleEndian, int32(viewportY))
	binary.Write(&buf, binary.LittleEndian, int32(term.CursorX))
	binary.Write(&buf, binary.LittleEndian, int32(term.CursorY))

	// Reserved
	buf.Write(make([]byte, 8))

	// Encode visible rows
	startRow := viewportY
	endRow := viewportY + term.Rows
	if endRow > len(term.Buffer) {
		endRow = len(term.Buffer)
	}

	emptyCount := 0
	for i := startRow; i < endRow; i++ {
		row := term.Buffer[i]
		isEmpty := true
		
		// Check if row is empty
		for _, cell := range row {
			if cell.Char != 0 && cell.Char != ' ' {
				isEmpty = false
				break
			}
		}

		if isEmpty {
			emptyCount++
			continue
		}

		// Write any accumulated empty rows
		if emptyCount > 0 {
			m.writeEmptyRows(&buf, emptyCount)
			emptyCount = 0
		}

		// Write content row
		m.writeContentRow(&buf, row)
	}

	// Write any remaining empty rows
	if emptyCount > 0 {
		m.writeEmptyRows(&buf, emptyCount)
	}

	return buf.Bytes()
}

// writeEmptyRows writes empty row markers
func (m *Manager) writeEmptyRows(buf *bytes.Buffer, count int) {
	for count > 0 {
		n := count
		if n > 255 {
			n = 255
		}
		buf.WriteByte(0xFE)        // Empty row marker
		buf.WriteByte(byte(n))     // Count
		count -= n
	}
}

// writeContentRow writes a content row
func (m *Manager) writeContentRow(buf *bytes.Buffer, row []Cell) {
	// Find last non-space cell
	lastIdx := len(row) - 1
	for ; lastIdx >= 0; lastIdx-- {
		if row[lastIdx].Char != 0 && row[lastIdx].Char != ' ' {
			break
		}
	}

	if lastIdx < 0 {
		// Empty row
		buf.WriteByte(0xFE)
		buf.WriteByte(1)
		return
	}

	// Write content marker and cell count
	buf.WriteByte(0xFD) // Content row marker
	binary.Write(buf, binary.LittleEndian, uint16(lastIdx+1))

	// Write cells
	for i := 0; i <= lastIdx; i++ {
		m.writeCell(buf, &row[i])
	}
}

// writeCell writes a single cell
func (m *Manager) writeCell(buf *bytes.Buffer, cell *Cell) {
	if cell.Char == 0 || cell.Char == ' ' {
		// Simple space
		buf.WriteByte(0x00)
		return
	}

	// Determine cell type
	var typeByte uint8 = 0
	hasExtended := false

	// Check if we need extended data
	if cell.FgColor != -1 || cell.BgColor != -1 || cell.Attributes != 0 {
		typeByte |= 0x80 // Has extended data
		hasExtended = true
	}

	// Character type
	if cell.Char < 128 {
		typeByte |= 0x01 // ASCII
	} else {
		typeByte |= 0x02 // Unicode
		typeByte |= 0x40 // Is Unicode flag
	}

	// Color flags
	if cell.FgColor != -1 {
		typeByte |= 0x20 // Has foreground
		if cell.FgColor > 255 {
			typeByte |= 0x08 // Is RGB
		}
	}
	if cell.BgColor != -1 {
		typeByte |= 0x10 // Has background
		if cell.BgColor > 255 {
			typeByte |= 0x04 // Is RGB
		}
	}

	buf.WriteByte(typeByte)

	// Write character
	if cell.Char < 128 {
		buf.WriteByte(byte(cell.Char))
	} else {
		// Write Unicode as UTF-8
		utf8Bytes := []byte(string(cell.Char))
		buf.WriteByte(byte(len(utf8Bytes)))
		buf.Write(utf8Bytes)
	}

	// Write extended data if needed
	if hasExtended {
		// Attributes
		buf.WriteByte(cell.Attributes)

		// Foreground color
		if cell.FgColor != -1 {
			if cell.FgColor <= 255 {
				buf.WriteByte(byte(cell.FgColor))
			} else {
				// RGB color
				buf.WriteByte(byte((cell.FgColor >> 16) & 0xFF)) // R
				buf.WriteByte(byte((cell.FgColor >> 8) & 0xFF))  // G
				buf.WriteByte(byte(cell.FgColor & 0xFF))         // B
			}
		}

		// Background color
		if cell.BgColor != -1 {
			if cell.BgColor <= 255 {
				buf.WriteByte(byte(cell.BgColor))
			} else {
				// RGB color
				buf.WriteByte(byte((cell.BgColor >> 16) & 0xFF)) // R
				buf.WriteByte(byte((cell.BgColor >> 8) & 0xFF))  // G
				buf.WriteByte(byte(cell.BgColor & 0xFF))         // B
			}
		}
	}
}

// Subscribe adds a callback for buffer changes
func (m *Manager) Subscribe(sessionID string, callback func(string)) func() {
	m.subMu.Lock()
	m.subscribers[sessionID] = append(m.subscribers[sessionID], callback)
	m.subMu.Unlock()

	// Return unsubscribe function
	return func() {
		m.subMu.Lock()
		defer m.subMu.Unlock()

		callbacks := m.subscribers[sessionID]
		for i, cb := range callbacks {
			if fmt.Sprintf("%p", cb) == fmt.Sprintf("%p", callback) {
				m.subscribers[sessionID] = append(callbacks[:i], callbacks[i+1:]...)
				break
			}
		}

		// Clean up if no more subscribers
		if len(m.subscribers[sessionID]) == 0 {
			delete(m.subscribers, sessionID)
			
			// Also clean up terminal
			m.mu.Lock()
			if term, exists := m.terminals[sessionID]; exists {
				if term.watcher != nil {
					term.watcher.Close()
				}
				if term.streamFile != nil {
					term.streamFile.Close()
				}
				delete(m.terminals, sessionID)
			}
			m.mu.Unlock()
		}
	}
}

// scheduleBufferChangeNotification schedules a debounced notification
func (m *Manager) scheduleBufferChangeNotification(sessionID string) {
	m.debounceMu.Lock()
	defer m.debounceMu.Unlock()

	// Cancel existing timer
	if timer, exists := m.debounceTimers[sessionID]; exists {
		timer.Stop()
	}

	// Schedule new notification in 50ms
	m.debounceTimers[sessionID] = time.AfterFunc(50*time.Millisecond, func() {
		m.notifyBufferChange(sessionID)
		
		m.debounceMu.Lock()
		delete(m.debounceTimers, sessionID)
		m.debounceMu.Unlock()
	})
}

// notifyBufferChange notifies subscribers of a buffer change
func (m *Manager) notifyBufferChange(sessionID string) {
	m.subMu.RLock()
	callbacks := m.subscribers[sessionID]
	m.subMu.RUnlock()

	for _, callback := range callbacks {
		callback(sessionID)
	}
}

// CleanupIdleSessions removes idle terminal sessions
func (m *Manager) CleanupIdleSessions() {
	m.mu.Lock()
	defer m.mu.Unlock()

	cutoff := time.Now().Add(-m.config.SessionIdleTimeout)

	for sessionID, term := range m.terminals {
		if term.LastUpdate.Before(cutoff) {
			// Clean up terminal
			if term.watcher != nil {
				term.watcher.Close()
			}
			if term.streamFile != nil {
				term.streamFile.Close()
			}
			delete(m.terminals, sessionID)
			log.Printf("Cleaned up idle terminal session: %s", sessionID)
		}
	}
}