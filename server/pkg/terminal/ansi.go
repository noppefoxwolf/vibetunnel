package terminal

import ()

// ANSIParser parses ANSI escape sequences
type ANSIParser struct {
	term        *Terminal
	state       parseState
	params      []int
	currentChar []byte
}

type parseState int

const (
	stateNormal parseState = iota
	stateEscape
	stateCSI
	stateOSC
	stateDCS
)

// NewANSIParser creates a new ANSI parser
func NewANSIParser(term *Terminal) *ANSIParser {
	return &ANSIParser{
		term:        term,
		state:       stateNormal,
		params:      make([]int, 0, 16),
		currentChar: make([]byte, 0, 4),
	}
}

// Parse processes input data and updates terminal state
func (p *ANSIParser) Parse(data []byte) {
	for _, b := range data {
		p.processByte(b)
	}
}

// processByte processes a single byte
func (p *ANSIParser) processByte(b byte) {
	switch p.state {
	case stateNormal:
		p.processNormalByte(b)
	case stateEscape:
		p.processEscapeByte(b)
	case stateCSI:
		p.processCSIByte(b)
	case stateOSC:
		p.processOSCByte(b)
	case stateDCS:
		p.processDCSByte(b)
	}
}

// processNormalByte processes a byte in normal state
func (p *ANSIParser) processNormalByte(b byte) {
	switch b {
	case 0x1B: // ESC
		p.state = stateEscape
	case '\n', 0x0B, 0x0C: // LF, VT, FF
		p.term.lineFeed()
	case '\r': // CR
		p.term.carriageReturn()
	case '\b': // BS
		p.term.backspace()
	case '\t': // TAB
		p.term.tab()
	case 0x07: // BEL
		// Bell - ignore
	case 0x00: // NUL
		// Ignore
	default:
		if b >= 0x20 { // Printable
			p.currentChar = append(p.currentChar[:0], b)
			
			// Check if this is the start of a UTF-8 sequence
			if b >= 0x80 {
				// For now, just use the byte as-is
				// TODO: Proper UTF-8 handling
			}
			
			p.term.writeChar(rune(b))
		}
	}
}

// processEscapeByte processes a byte in escape state
func (p *ANSIParser) processEscapeByte(b byte) {
	p.state = stateNormal // Default back to normal

	switch b {
	case '[': // CSI
		p.state = stateCSI
		p.params = p.params[:0]
	case ']': // OSC
		p.state = stateOSC
	case 'P': // DCS
		p.state = stateDCS
	case 'D': // IND - Index
		p.term.lineFeed()
	case 'M': // RI - Reverse Index
		p.term.reverseLineFeed()
	case 'E': // NEL - Next Line
		p.term.carriageReturn()
		p.term.lineFeed()
	case '7': // DECSC - Save Cursor
		p.term.saveCursor()
	case '8': // DECRC - Restore Cursor
		p.term.restoreCursor()
	case 'c': // RIS - Reset
		p.term.reset()
	}
}

// processCSIByte processes a byte in CSI state
func (p *ANSIParser) processCSIByte(b byte) {
	if b >= '0' && b <= '9' {
		// Digit - accumulate parameter
		if len(p.params) == 0 {
			p.params = append(p.params, 0)
		}
		p.params[len(p.params)-1] = p.params[len(p.params)-1]*10 + int(b-'0')
	} else if b == ';' {
		// Parameter separator
		p.params = append(p.params, 0)
	} else if b >= 0x40 && b <= 0x7E {
		// Final character
		p.executeCSI(b)
		p.state = stateNormal
	}
}

// executeCSI executes a CSI sequence
func (p *ANSIParser) executeCSI(finalChar byte) {
	// Default parameter values
	if len(p.params) == 0 {
		p.params = append(p.params, 1)
	}

	switch finalChar {
	case 'A': // CUU - Cursor Up
		p.term.moveCursor(0, -p.getParam(0, 1))
	case 'B': // CUD - Cursor Down
		p.term.moveCursor(0, p.getParam(0, 1))
	case 'C': // CUF - Cursor Forward
		p.term.moveCursor(p.getParam(0, 1), 0)
	case 'D': // CUB - Cursor Back
		p.term.moveCursor(-p.getParam(0, 1), 0)
	case 'H', 'f': // CUP - Cursor Position
		row := p.getParam(0, 1) - 1
		col := p.getParam(1, 1) - 1
		p.term.setCursorPos(col, row)
	case 'J': // ED - Erase Display
		p.term.eraseDisplay(p.getParam(0, 0))
	case 'K': // EL - Erase Line
		p.term.eraseLine(p.getParam(0, 0))
	case 'm': // SGR - Select Graphic Rendition
		for _, param := range p.params {
			p.term.setSGR(param)
		}
	case 's': // SCP - Save Cursor Position
		p.term.saveCursor()
	case 'u': // RCP - Restore Cursor Position
		p.term.restoreCursor()
	}
}

// getParam gets a parameter value with default
func (p *ANSIParser) getParam(index, defaultValue int) int {
	if index < len(p.params) && p.params[index] > 0 {
		return p.params[index]
	}
	return defaultValue
}

// processOSCByte processes a byte in OSC state
func (p *ANSIParser) processOSCByte(b byte) {
	// For now, just consume until ST or BEL
	if b == 0x07 || b == 0x9C { // BEL or ST
		p.state = stateNormal
	} else if b == 0x1B {
		// Check for ESC \
		p.state = stateEscape
	}
}

// processDCSByte processes a byte in DCS state
func (p *ANSIParser) processDCSByte(b byte) {
	// For now, just consume until ST
	if b == 0x9C { // ST
		p.state = stateNormal
	} else if b == 0x1B {
		// Check for ESC \
		p.state = stateEscape
	}
}

// Terminal methods for ANSI operations

func (t *Terminal) writeChar(ch rune) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.CursorX >= t.Cols {
		t.CursorX = 0
		t.CursorY++
		t.checkScroll()
	}

	if t.CursorY < len(t.Buffer) && t.CursorX < t.Cols {
		t.Buffer[t.CursorY][t.CursorX] = Cell{
			Char:       ch,
			FgColor:    t.currentFgColor,
			BgColor:    t.currentBgColor,
			Attributes: t.currentAttributes,
		}
		t.CursorX++
	}
}

func (t *Terminal) lineFeed() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.CursorY++
	t.checkScroll()
}

func (t *Terminal) carriageReturn() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.CursorX = 0
}

func (t *Terminal) backspace() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.CursorX > 0 {
		t.CursorX--
	}
}

func (t *Terminal) tab() {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Move to next tab stop (every 8 columns)
	t.CursorX = ((t.CursorX / 8) + 1) * 8
	if t.CursorX >= t.Cols {
		t.CursorX = t.Cols - 1
	}
}

func (t *Terminal) moveCursor(dx, dy int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.CursorX += dx
	t.CursorY += dy

	// Clamp to bounds
	if t.CursorX < 0 {
		t.CursorX = 0
	} else if t.CursorX >= t.Cols {
		t.CursorX = t.Cols - 1
	}

	if t.CursorY < 0 {
		t.CursorY = 0
	} else if t.CursorY >= len(t.Buffer) {
		t.CursorY = len(t.Buffer) - 1
	}
}

func (t *Terminal) setCursorPos(x, y int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.CursorX = x
	t.CursorY = y

	// Clamp to bounds
	if t.CursorX < 0 {
		t.CursorX = 0
	} else if t.CursorX >= t.Cols {
		t.CursorX = t.Cols - 1
	}

	if t.CursorY < 0 {
		t.CursorY = 0
	} else if t.CursorY >= len(t.Buffer) {
		t.CursorY = len(t.Buffer) - 1
	}
}

func (t *Terminal) eraseDisplay(mode int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	switch mode {
	case 0: // Erase from cursor to end
		// Erase rest of current line
		for x := t.CursorX; x < t.Cols; x++ {
			t.Buffer[t.CursorY][x] = Cell{}
		}
		// Erase lines below
		for y := t.CursorY + 1; y < len(t.Buffer); y++ {
			for x := 0; x < t.Cols; x++ {
				t.Buffer[y][x] = Cell{}
			}
		}
	case 1: // Erase from start to cursor
		// Erase lines above
		for y := 0; y < t.CursorY; y++ {
			for x := 0; x < t.Cols; x++ {
				t.Buffer[y][x] = Cell{}
			}
		}
		// Erase start of current line
		for x := 0; x <= t.CursorX; x++ {
			t.Buffer[t.CursorY][x] = Cell{}
		}
	case 2: // Erase entire display
		for y := 0; y < len(t.Buffer); y++ {
			for x := 0; x < t.Cols; x++ {
				t.Buffer[y][x] = Cell{}
			}
		}
	}
}

func (t *Terminal) eraseLine(mode int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.CursorY >= len(t.Buffer) {
		return
	}

	switch mode {
	case 0: // Erase from cursor to end
		for x := t.CursorX; x < t.Cols; x++ {
			t.Buffer[t.CursorY][x] = Cell{}
		}
	case 1: // Erase from start to cursor
		for x := 0; x <= t.CursorX; x++ {
			t.Buffer[t.CursorY][x] = Cell{}
		}
	case 2: // Erase entire line
		for x := 0; x < t.Cols; x++ {
			t.Buffer[t.CursorY][x] = Cell{}
		}
	}
}

func (t *Terminal) setSGR(param int) {
	t.mu.Lock()
	defer t.mu.Unlock()

	switch param {
	case 0: // Reset
		t.currentFgColor = -1
		t.currentBgColor = -1
		t.currentAttributes = 0
	case 1: // Bold
		t.currentAttributes |= AttrBold
	case 2: // Dim
		t.currentAttributes |= AttrDim
	case 3: // Italic
		t.currentAttributes |= AttrItalic
	case 4: // Underline
		t.currentAttributes |= AttrUnderline
	case 5: // Blink (treat as bold)
		t.currentAttributes |= AttrBold
	case 7: // Inverse
		t.currentAttributes |= AttrInverse
	case 8: // Invisible
		t.currentAttributes |= AttrInvisible
	case 9: // Strikethrough
		t.currentAttributes |= AttrStrikethrough
	case 21: // Bold off
		t.currentAttributes &^= AttrBold
	case 22: // Dim off
		t.currentAttributes &^= AttrDim
	case 23: // Italic off
		t.currentAttributes &^= AttrItalic
	case 24: // Underline off
		t.currentAttributes &^= AttrUnderline
	case 27: // Inverse off
		t.currentAttributes &^= AttrInverse
	case 28: // Invisible off
		t.currentAttributes &^= AttrInvisible
	case 29: // Strikethrough off
		t.currentAttributes &^= AttrStrikethrough
	default:
		// Color codes
		if param >= 30 && param <= 37 {
			// Foreground color
			t.currentFgColor = int32(param - 30)
		} else if param == 39 {
			// Default foreground
			t.currentFgColor = -1
		} else if param >= 40 && param <= 47 {
			// Background color
			t.currentBgColor = int32(param - 40)
		} else if param == 49 {
			// Default background
			t.currentBgColor = -1
		} else if param >= 90 && param <= 97 {
			// Bright foreground
			t.currentFgColor = int32(param - 90 + 8)
		} else if param >= 100 && param <= 107 {
			// Bright background
			t.currentBgColor = int32(param - 100 + 8)
		}
	}
}

func (t *Terminal) saveCursor() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.savedCursorX = t.CursorX
	t.savedCursorY = t.CursorY
}

func (t *Terminal) restoreCursor() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.CursorX = t.savedCursorX
	t.CursorY = t.savedCursorY
}

func (t *Terminal) reverseLineFeed() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.CursorY > 0 {
		t.CursorY--
	}
}

func (t *Terminal) reset() {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Clear buffer
	for y := 0; y < len(t.Buffer); y++ {
		for x := 0; x < t.Cols; x++ {
			t.Buffer[y][x] = Cell{}
		}
	}

	// Reset cursor
	t.CursorX = 0
	t.CursorY = 0
	t.savedCursorX = 0
	t.savedCursorY = 0

	// Reset colors and attributes
	t.currentFgColor = -1
	t.currentBgColor = -1
	t.currentAttributes = 0
}

func (t *Terminal) checkScroll() {
	if t.CursorY >= len(t.Buffer) {
		// Scroll buffer up
		t.Buffer = append(t.Buffer[1:], make([]Cell, t.Cols))
		t.CursorY = len(t.Buffer) - 1
		t.ScrollbackTop++
	}
}