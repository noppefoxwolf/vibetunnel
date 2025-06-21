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
	"github.com/hinshun/vt10x"
	"github.com/vibetunnel/vibetunnel-server/pkg/config"
)

// Terminal represents a terminal state with vt10x
type Terminal struct {
	SessionID  string
	vt         vt10x.Terminal
	LastUpdate time.Time
	watcher    *fsnotify.Watcher
	streamFile *os.File
	offset     int64
	mu         sync.RWMutex
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
	config         *config.Config
	terminals      map[string]*Terminal
	mu             sync.RWMutex
	subscribers    map[string][]func(string) // sessionID -> callbacks
	subMu          sync.RWMutex
	debounceTimers map[string]*time.Timer
	debounceMu     sync.Mutex
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

// GetOrCreateTerminal returns or creates a terminal for the given session
func (m *Manager) GetOrCreateTerminal(sessionID string) (*Terminal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if term, exists := m.terminals[sessionID]; exists {
		return term, nil
	}

	log.Printf("[DEBUG] Creating new terminal for session %s with size %dx%d", sessionID, m.config.DefaultCols, m.config.DefaultRows)

	// Create new terminal with vt10x
	vt := vt10x.New(
		vt10x.WithSize(m.config.DefaultCols, m.config.DefaultRows),
		vt10x.WithWriter(os.Stdout), // We don't actually write to stdout, just need a writer
	)

	// Verify the terminal was created with correct size
	cols, rows := vt.Size()
	log.Printf("[DEBUG] Terminal created with actual size %dx%d", cols, rows)

	term := &Terminal{
		SessionID:  sessionID,
		vt:         vt,
		LastUpdate: time.Now(),
	}

	m.terminals[sessionID] = term

	// Start watching the stream file if it exists
	streamPath := filepath.Join(m.config.ControlDir, sessionID, "stream-out")
	if _, err := os.Stat(streamPath); err == nil {
		if err := m.startWatchingStream(term, streamPath); err != nil {
			log.Printf("Failed to start watching stream for session %s: %v", sessionID, err)
		}
	}

	log.Printf("Created terminal for session: %s", sessionID)
	return term, nil
}

// GetBufferSnapshot returns a binary encoded snapshot of the terminal buffer
func (m *Manager) GetBufferSnapshot(sessionID string) ([]byte, error) {
	log.Printf("[DEBUG] GetBufferSnapshot: called for session %s", sessionID)

	term, err := m.GetOrCreateTerminal(sessionID)
	if err != nil {
		log.Printf("[DEBUG] GetBufferSnapshot: failed to get/create terminal for session %s: %v", sessionID, err)
		return nil, err
	}

	log.Printf("[DEBUG] GetBufferSnapshot: got terminal for session %s", sessionID)

	term.mu.RLock()
	defer term.mu.RUnlock()

	buffer := m.encodeSnapshot(term)
	log.Printf("[DEBUG] GetBufferSnapshot: encoded buffer for session %s, len=%d", sessionID, len(buffer))

	return buffer, nil
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
		if term.offset == int64(len(line)+1) {
			var header map[string]interface{}
			if err := json.Unmarshal([]byte(line), &header); err == nil {
				// Update terminal dimensions from header
				if width, ok := header["width"].(float64); ok {
					cols := int(width)
					if height, ok := header["height"].(float64); ok {
						rows := int(height)
						term.mu.Lock()
						term.vt.Resize(cols, rows)
						term.mu.Unlock()
					}
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
	term.mu.Lock()
	defer term.mu.Unlock()

	// Feed data to vt10x terminal
	term.vt.Write([]byte(data))
	term.LastUpdate = time.Now()
}

// processResize processes terminal resize
func (m *Manager) processResize(term *Terminal, data string) {
	log.Printf("[DEBUG] processResize called with data: %s", data)

	parts := strings.Split(data, "x")
	if len(parts) != 2 {
		log.Printf("[DEBUG] processResize: invalid resize data format: %s", data)
		return
	}

	cols, err1 := strconv.Atoi(parts[0])
	rows, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		log.Printf("[DEBUG] processResize: failed to parse dimensions from %s: err1=%v, err2=%v", data, err1, err2)
		return
	}

	oldCols, oldRows := term.vt.Size()
	log.Printf("[DEBUG] processResize: resizing terminal from %dx%d to %dx%d", oldCols, oldRows, cols, rows)

	term.mu.Lock()
	defer term.mu.Unlock()

	term.vt.Resize(cols, rows)

	// Verify the resize worked
	actualCols, actualRows := term.vt.Size()
	log.Printf("[DEBUG] processResize: terminal now has size %dx%d", actualCols, actualRows)
}

// encodeSnapshot encodes the terminal buffer into binary format (Node.js compatible)
func (m *Manager) encodeSnapshot(term *Terminal) []byte {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[DEBUG] encodeSnapshot: recovered from panic: %v", r)
		}
	}()

	cols, rows := term.vt.Size()
	cursor := term.vt.Cursor()
	cursorX, cursorY := cursor.X, cursor.Y

	log.Printf("[DEBUG] encodeSnapshot: terminal size %dx%d, cursor at (%d,%d)", cols, rows, cursorX, cursorY)

	if cols <= 0 || rows <= 0 {
		cols = m.config.DefaultCols
		rows = m.config.DefaultRows
		log.Printf("[DEBUG] encodeSnapshot: using default size %dx%d", cols, rows)
	}

	// Use correct dimensions - no swapping needed
	// For an 80x24 terminal: cols=80, rows=24
	actualCols := cols
	actualRows := rows

	// Extract cells from current terminal state
	cells := make([][]Cell, actualRows)
	for row := 0; row < actualRows; row++ {
		rowCells := make([]Cell, 0)

		// Get cells for this row
		for col := 0; col < actualCols; col++ {
			glyph := safeCell(term.vt, col, row)

			// Skip zero-width cells (part of wide characters) - like Node.js
			if glyph.Char == 0 {
				continue
			}

			cell := Cell{
				Char:    glyph.Char,
				FgColor: convertColor(glyph.FG),
				BgColor: convertColor(glyph.BG),
			}

			// Only include non-default values (like Node.js)
			// Keep -1 as the undefined value, don't convert to 0

			rowCells = append(rowCells, cell)
		}

		// Trim blank cells from the end of the line (like Node.js)
		lastNonBlankCell := len(rowCells) - 1
		for ; lastNonBlankCell >= 0; lastNonBlankCell-- {
			cell := rowCells[lastNonBlankCell]
			// Node.js trims cells that are spaces with no fg, no bg, and no attributes
			if cell.Char != ' ' || cell.FgColor != -1 || cell.BgColor != -1 || cell.Attributes != 0 {
				break
			}
		}

		// Trim the array, but keep at least one cell (like Node.js)
		if lastNonBlankCell < len(rowCells)-1 {
			rowCells = rowCells[:max(1, lastNonBlankCell+1)]
		}

		cells[row] = rowCells
	}

	// Trim blank lines from the bottom (like Node.js)
	lastNonBlankRow := len(cells) - 1
	for ; lastNonBlankRow >= 0; lastNonBlankRow-- {
		row := cells[lastNonBlankRow]
		hasContent := false
		for _, cell := range row {
			if cell.Char != ' ' || cell.FgColor != -1 || cell.BgColor != -1 || cell.Attributes != 0 {
				hasContent = true
				break
			}
		}
		if hasContent {
			break
		}
	}

	// Keep at least one row (like Node.js)
	trimmedCells := cells[:max(1, lastNonBlankRow+1)]

	log.Printf("[DEBUG] encodeSnapshot: trimmed from %d rows to %d rows", len(cells), len(trimmedCells))

	// Log row details
	for i, row := range trimmedCells {
		if i < 3 { // Only log first 3 rows to avoid spam
			log.Printf("[DEBUG] encodeSnapshot: row %d has %d cells", i, len(row))
			if len(row) > 0 {
				log.Printf("[DEBUG] encodeSnapshot: row %d first cell: char='%c' fg=%d bg=%d", i, row[0].Char, row[0].FgColor, row[0].BgColor)
				if len(row) > 1 {
					log.Printf("[DEBUG] encodeSnapshot: row %d last cell: char='%c' fg=%d bg=%d", i, row[len(row)-1].Char, row[len(row)-1].FgColor, row[len(row)-1].BgColor)
				}
				// Log how many cells are actually non-space
				nonSpaceCount := 0
				for _, cell := range row {
					if cell.Char != ' ' {
						nonSpaceCount++
					}
				}
				log.Printf("[DEBUG] encodeSnapshot: row %d has %d non-space cells out of %d total", i, nonSpaceCount, len(row))
			}
		}
	}

	// Get cursor position (no viewport offset needed since we're using current state)
	relativeCursorX := cursorX
	relativeCursorY := cursorY

	// No viewport offset for current terminal state
	viewportY := 0

	log.Printf("[DEBUG] encodeSnapshot: final cells: %d rows, viewportY=%d, cursor=(%d,%d)", len(trimmedCells), viewportY, relativeCursorX, relativeCursorY)

	// Precompute buffer size (like Node.js)
	dataSize := 32 // Header size
	for _, rowCells := range trimmedCells {
		if len(rowCells) == 0 || (len(rowCells) == 1 &&
			rowCells[0].Char == ' ' &&
			rowCells[0].FgColor == -1 &&
			rowCells[0].BgColor == -1 &&
			rowCells[0].Attributes == 0) {
			dataSize += 2 // Empty row marker
		} else {
			dataSize += 3 // Row header
			for _, cell := range rowCells {
				dataSize += calculateCellSize(&cell)
			}
		}
	}

	// Write buffer
	buf := bytes.NewBuffer(make([]byte, 0, dataSize))

	// Write header (28 bytes) - like Node.js
	binary.Write(buf, binary.LittleEndian, uint16(0x5654))            // Magic "VT"
	buf.WriteByte(0x01)                                               // Version
	buf.WriteByte(0x00)                                               // Flags
	binary.Write(buf, binary.LittleEndian, uint32(actualCols))        // Cols
	binary.Write(buf, binary.LittleEndian, uint32(len(trimmedCells))) // Rows
	binary.Write(buf, binary.LittleEndian, int32(viewportY))
	binary.Write(buf, binary.LittleEndian, int32(relativeCursorX))
	binary.Write(buf, binary.LittleEndian, int32(relativeCursorY))
	binary.Write(buf, binary.LittleEndian, uint32(0)) // Reserved

	// Write cells (like Node.js)
	for _, rowCells := range trimmedCells {
		// Check if this is an empty row (like Node.js)
		if len(rowCells) == 0 || (len(rowCells) == 1 &&
			rowCells[0].Char == ' ' &&
			rowCells[0].FgColor == -1 &&
			rowCells[0].BgColor == -1 &&
			rowCells[0].Attributes == 0) {
			// Empty row marker
			buf.WriteByte(0xfe)
			buf.WriteByte(0x01)
		} else {
			// Row with content
			buf.WriteByte(0xfd)
			binary.Write(buf, binary.LittleEndian, uint16(len(rowCells)))

			// Write each cell
			for _, cell := range rowCells {
				writeCellNodejs(buf, &cell)
			}
		}
	}

	log.Printf("[DEBUG] encodeSnapshot: finished encoding, final buffer size=%d", buf.Len())
	return buf.Bytes()
}

// calculateCellSize calculates the size needed to encode a cell (like Node.js)
func calculateCellSize(cell *Cell) int {
	isSpace := cell.Char == ' '
	hasAttrs := cell.Attributes != 0
	hasFg := cell.FgColor != -1
	hasBg := cell.BgColor != -1
	isAscii := cell.Char < 128

	if isSpace && !hasAttrs && !hasFg && !hasBg {
		return 1 // Just a space marker
	}

	size := 1 // Type byte

	if isAscii {
		size += 1 // ASCII character
	} else {
		utf8Bytes := []byte(string(cell.Char))
		size += 1 + len(utf8Bytes) // Length byte + UTF-8 bytes
	}

	// Attributes/colors byte
	if hasAttrs || hasFg || hasBg {
		size += 1 // Flags byte

		if hasFg {
			size += 1 // Palette color
		}

		if hasBg {
			size += 1 // Palette color
		}
	}

	return size
}

// max returns the maximum of two integers
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// safeCell safely accesses a cell in vt10x.Terminal, returning a default glyph on panic
func safeCell(vt vt10x.Terminal, x, y int) vt10x.Glyph {
	defer func() {
		recover()
	}()
	return vt.Cell(x, y)
}

// writeCellNodejs encodes a cell exactly like Node.js
func writeCellNodejs(buf *bytes.Buffer, cell *Cell) {
	isSpace := cell.Char == ' '
	hasAttrs := cell.Attributes != 0
	hasFg := cell.FgColor != -1
	hasBg := cell.BgColor != -1
	isAscii := cell.Char <= 127

	// Type byte format (like Node.js):
	// Bit 7: Has extended data (attrs/colors)
	// Bit 6: Is Unicode (vs ASCII)
	// Bit 5: Has foreground color
	// Bit 4: Has background color
	// Bit 3: Is RGB foreground (vs palette)
	// Bit 2: Is RGB background (vs palette)
	// Bits 1-0: Character type (00=space, 01=ASCII, 10=Unicode)

	if isSpace && !hasAttrs && !hasFg && !hasBg {
		// Simple space - 1 byte
		buf.WriteByte(0x00) // Type: space, no extended data
		return
	}

	var typeByte uint8 = 0

	if hasAttrs || hasFg || hasBg {
		typeByte |= 0x80 // Has extended data
	}

	if !isAscii {
		typeByte |= 0x40 // Is Unicode
		typeByte |= 0x02 // Character type: Unicode
	} else if !isSpace {
		typeByte |= 0x01 // Character type: ASCII
	}

	if hasFg {
		typeByte |= 0x20 // Has foreground
		if cell.FgColor > 255 {
			typeByte |= 0x08 // Is RGB
		}
	}

	if hasBg {
		typeByte |= 0x10 // Has background
		if cell.BgColor > 255 {
			typeByte |= 0x04 // Is RGB
		}
	}

	buf.WriteByte(typeByte)

	// Write character
	if !isAscii {
		charBytes := []byte(string(cell.Char))
		buf.WriteByte(byte(len(charBytes)))
		buf.Write(charBytes)
	} else if !isSpace {
		buf.WriteByte(byte(cell.Char))
	}

	// Write extended data if present
	if typeByte&0x80 != 0 {
		// Attributes byte (if any)
		if hasAttrs {
			buf.WriteByte(cell.Attributes)
		} else if hasFg || hasBg {
			buf.WriteByte(0) // No attributes but need the byte
		}

		// Foreground color
		if hasFg {
			if cell.FgColor > 255 {
				// RGB
				buf.WriteByte(byte((cell.FgColor >> 16) & 0xff))
				buf.WriteByte(byte((cell.FgColor >> 8) & 0xff))
				buf.WriteByte(byte(cell.FgColor & 0xff))
			} else {
				// Palette
				buf.WriteByte(byte(cell.FgColor))
			}
		}

		// Background color
		if hasBg {
			if cell.BgColor > 255 {
				// RGB
				buf.WriteByte(byte((cell.BgColor >> 16) & 0xff))
				buf.WriteByte(byte((cell.BgColor >> 8) & 0xff))
				buf.WriteByte(byte(cell.BgColor & 0xff))
			} else {
				// Palette
				buf.WriteByte(byte(cell.BgColor))
			}
		}
	}
}

// convertColor converts vt10x color to our format
func convertColor(color vt10x.Color) int32 {
	// hinshun/vt10x uses DefaultFG = 16777216 and DefaultBG = 16777217
	if color == vt10x.DefaultFG || color == vt10x.DefaultBG {
		return -1 // Use -1 for default colors (undefined)
	}
	// For other colors, convert to int32
	return int32(color)
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
