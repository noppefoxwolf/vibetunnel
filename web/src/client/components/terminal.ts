import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { Terminal as XtermTerminal, IBufferLine, IBufferCell } from '@xterm/headless';
import { UrlHighlighter } from '../utils/url-highlighter.js';

@customElement('vibe-terminal')
export class Terminal extends LitElement {
  // Disable shadow DOM for Tailwind compatibility and native text selection
  createRenderRoot() {
    return this as unknown as HTMLElement;
  }

  @property({ type: String }) sessionId = '';
  @property({ type: Number }) cols = 80;
  @property({ type: Number }) rows = 24;
  @property({ type: Number }) fontSize = 14;
  @property({ type: Boolean }) fitHorizontally = false;

  private originalFontSize: number = 14;

  @state() private terminal: XtermTerminal | null = null;
  private _viewportY = 0; // Current scroll position in pixels
  @state() private followCursorEnabled = true; // Whether to follow cursor on writes
  private programmaticScroll = false; // Flag to prevent state updates during programmatic scrolling

  // Debug performance tracking
  private debugMode = false;
  private renderCount = 0;
  private totalRenderTime = 0;
  private lastRenderTime = 0;

  get viewportY() {
    return this._viewportY;
  }

  set viewportY(value: number) {
    this._viewportY = value;
  }
  @state() private actualRows = 24; // Rows that fit in viewport

  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimeout: NodeJS.Timeout | null = null;

  // Virtual scrolling optimization
  private renderPending = false;
  private scrollAccumulator = 0;
  private touchScrollAccumulator = 0;
  private isTouchActive = false;
  private momentumVelocityY = 0;
  private momentumVelocityX = 0;
  private momentumAnimation: number | null = null;

  // Operation queue for batching buffer modifications
  private operationQueue: (() => void | Promise<void>)[] = [];

  private queueRenderOperation(operation: () => void | Promise<void>) {
    this.operationQueue.push(operation);

    if (!this.renderPending) {
      this.renderPending = true;
      requestAnimationFrame(() => {
        this.processOperationQueue();
        this.renderPending = false;
      });
    }
  }

  private requestRenderBuffer() {
    this.queueRenderOperation(() => {});
  }

  private async processOperationQueue() {
    // Process all queued operations in order
    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue.shift();
      if (operation) {
        await operation();
      }
    }

    // Render once after all operations are complete
    this.renderBuffer();
  }

  connectedCallback() {
    super.connectedCallback();

    // Check for debug mode
    this.debugMode = new URLSearchParams(window.location.search).has('debug');
  }

  disconnectedCallback() {
    this.cleanup();
    super.disconnectedCallback();
  }

  private cleanup() {
    // Stop momentum animation
    if (this.momentumAnimation) {
      cancelAnimationFrame(this.momentumAnimation);
      this.momentumAnimation = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('cols') || changedProperties.has('rows')) {
      if (this.terminal) {
        this.reinitializeTerminal();
      }
    }
    if (changedProperties.has('fontSize')) {
      // Store original font size when it changes (but not during horizontal fitting)
      if (!this.fitHorizontally) {
        this.originalFontSize = this.fontSize;
      }
    }
    if (changedProperties.has('fitHorizontally')) {
      if (!this.fitHorizontally) {
        // Restore original font size when turning off horizontal fitting
        this.fontSize = this.originalFontSize;
      }
      this.fitTerminal();
    }
  }

  firstUpdated() {
    // Store the initial font size as original
    this.originalFontSize = this.fontSize;
    this.initializeTerminal();
  }

  private async initializeTerminal() {
    try {
      this.requestUpdate();

      this.container = this.querySelector('#terminal-container') as HTMLElement;

      if (!this.container) {
        throw new Error('Terminal container not found');
      }

      await this.setupTerminal();
      this.setupResize();
      this.setupScrolling();

      this.requestUpdate();
    } catch (_error: unknown) {
      this.requestUpdate();
    }
  }

  private async reinitializeTerminal() {
    if (this.terminal) {
      // Force layout/reflow so container gets its proper height
      if (this.container) {
        // Force layout reflow by accessing offsetHeight
        void this.container.offsetHeight;
      }

      this.terminal.resize(this.cols, this.rows);
      this.fitTerminal();
    }
  }

  private async setupTerminal() {
    try {
      // Create regular terminal but don't call .open() to make it headless
      this.terminal = new XtermTerminal({
        cursorBlink: false,
        lineHeight: 1.2,
        scrollback: 10000,
        allowProposedApi: true,
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#00ff00',
          black: '#000000',
          red: '#f14c4c',
          green: '#23d18b',
          yellow: '#f5f543',
          blue: '#3b8eea',
          magenta: '#d670d6',
          cyan: '#29b8db',
          white: '#e5e5e5',
        },
      });

      // Set terminal size - don't call .open() to keep it headless
      this.terminal.resize(this.cols, this.rows);
    } catch (error) {
      console.error('Failed to create terminal:', error);
      throw error;
    }
  }

  private measureCharacterWidth(): number {
    if (!this.container) return 8;

    // Create temporary element with same styles as terminal content, attached to container
    const measureEl = document.createElement('div');
    measureEl.className = 'terminal-line';
    measureEl.style.position = 'absolute';
    measureEl.style.visibility = 'hidden';
    measureEl.style.top = '0';
    measureEl.style.left = '0';
    measureEl.style.fontSize = `${this.fontSize}px`;
    measureEl.style.fontFamily = 'Fira Code, monospace';

    // Use a mix of characters that represent typical terminal content
    const testString =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const repeatCount = Math.ceil(this.cols / testString.length);
    const testContent = testString.repeat(repeatCount).substring(0, this.cols);
    measureEl.textContent = testContent;

    // Attach to container so it inherits all the proper CSS context
    this.container.appendChild(measureEl);
    const measureRect = measureEl.getBoundingClientRect();
    const actualCharWidth = measureRect.width / this.cols;
    this.container.removeChild(measureEl);

    return actualCharWidth;
  }

  private fitTerminal() {
    if (!this.terminal || !this.container) return;

    const _oldActualRows = this.actualRows;
    const oldLineHeight = this.fontSize * 1.2;
    const wasAtBottom = this.isScrolledToBottom();

    // Calculate current scroll position in terms of content lines (before any changes)
    const currentScrollLines = oldLineHeight > 0 ? this.viewportY / oldLineHeight : 0;

    if (this.fitHorizontally) {
      // Horizontal fitting: calculate fontSize to fit this.cols characters in container width
      const containerWidth = this.container.clientWidth;
      const containerHeight = this.container.clientHeight;
      const targetCharWidth = containerWidth / this.cols;

      // Calculate fontSize needed for target character width
      // Use current font size as starting point and measure actual character width
      const currentCharWidth = this.measureCharacterWidth();
      const scaleFactor = targetCharWidth / currentCharWidth;
      const calculatedFontSize = this.fontSize * scaleFactor;
      const newFontSize = Math.max(4, Math.min(32, calculatedFontSize));

      this.fontSize = newFontSize;

      // Also fit rows to use full container height with the new font size
      const lineHeight = this.fontSize * 1.2;
      const fittedRows = Math.max(1, Math.floor(containerHeight / lineHeight));

      // Update both actualRows and the terminal's actual row count
      this.actualRows = fittedRows;
      this.rows = fittedRows;

      // Resize the terminal to the new dimensions
      if (this.terminal) {
        this.terminal.resize(this.cols, this.rows);
      }
    } else {
      // Normal mode: just calculate how many rows fit in the viewport
      const containerHeight = this.container.clientHeight;
      const lineHeight = this.fontSize * 1.2;
      const newActualRows = Math.max(1, Math.floor(containerHeight / lineHeight));

      this.actualRows = newActualRows;
    }

    // Recalculate viewportY based on new lineHeight and actualRows
    if (this.terminal) {
      const buffer = this.terminal.buffer.active;
      const newLineHeight = this.fontSize * 1.2;
      const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * newLineHeight);

      if (wasAtBottom) {
        // If we were at bottom, stay at bottom with new constraints
        this.viewportY = maxScrollPixels;
      } else {
        // Convert the scroll position from old lineHeight to new lineHeight
        const newViewportY = currentScrollLines * newLineHeight;
        const clampedY = Math.max(0, Math.min(maxScrollPixels, newViewportY));
        this.viewportY = clampedY;
      }
    }

    // Always trigger a render after fit changes
    this.requestRenderBuffer();
    this.requestUpdate();
  }

  private setupResize() {
    if (!this.container) return;

    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.fitTerminal();
      }, 50);
    });
    this.resizeObserver.observe(this.container);

    window.addEventListener('resize', () => {
      this.fitTerminal();
    });
  }

  private setupScrolling() {
    if (!this.container) return;

    // Handle wheel events with pixel-based scrolling (both vertical and horizontal)
    this.container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();

        const lineHeight = this.fontSize * 1.2;
        let deltaPixelsY = 0;
        let deltaPixelsX = 0;

        // Convert wheel deltas to pixels based on deltaMode
        switch (e.deltaMode) {
          case WheelEvent.DOM_DELTA_PIXEL:
            // Already in pixels
            deltaPixelsY = e.deltaY;
            deltaPixelsX = e.deltaX;
            break;
          case WheelEvent.DOM_DELTA_LINE:
            // Convert lines to pixels
            deltaPixelsY = e.deltaY * lineHeight;
            deltaPixelsX = e.deltaX * lineHeight;
            break;
          case WheelEvent.DOM_DELTA_PAGE:
            // Convert pages to pixels (assume page = viewport height)
            deltaPixelsY = e.deltaY * (this.actualRows * lineHeight);
            deltaPixelsX = e.deltaX * (this.actualRows * lineHeight);
            break;
        }

        // Apply scaling for comfortable scrolling speed
        const scrollScale = 0.5;
        deltaPixelsY *= scrollScale;
        deltaPixelsX *= scrollScale;

        // Apply vertical scrolling (our custom pixel-based)
        if (Math.abs(deltaPixelsY) > 0) {
          this.scrollViewportPixels(deltaPixelsY);
        }

        // Apply horizontal scrolling (native browser scrollLeft) - only if not in horizontal fit mode
        if (Math.abs(deltaPixelsX) > 0 && !this.fitHorizontally && this.container) {
          this.container.scrollLeft += deltaPixelsX;
        }
      },
      { passive: false }
    );

    // Touch scrolling with momentum
    let isScrolling = false;
    let lastY = 0;
    let lastX = 0;
    let touchHistory: Array<{ y: number; x: number; time: number }> = [];

    const handlePointerDown = (e: PointerEvent) => {
      // Only handle touch pointers, not mouse
      if (e.pointerType !== 'touch' || !e.isPrimary) return;

      // Stop any existing momentum
      if (this.momentumAnimation) {
        cancelAnimationFrame(this.momentumAnimation);
        this.momentumAnimation = null;
      }

      this.isTouchActive = true;
      isScrolling = false;
      lastY = e.clientY;
      lastX = e.clientX;

      // Initialize touch tracking
      touchHistory = [{ y: e.clientY, x: e.clientX, time: performance.now() }];

      // Capture the pointer so we continue to receive events even if DOM rebuilds
      this.container?.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: PointerEvent) => {
      // Only handle touch pointers that we have captured
      if (e.pointerType !== 'touch' || !this.container?.hasPointerCapture(e.pointerId)) return;

      const currentY = e.clientY;
      const currentX = e.clientX;
      const deltaY = lastY - currentY; // Positive = scroll down, negative = scroll up
      const deltaX = lastX - currentX; // Positive = scroll right, negative = scroll left

      // Track touch history for velocity calculation (keep last 5 points)
      const now = performance.now();
      touchHistory.push({ y: currentY, x: currentX, time: now });
      if (touchHistory.length > 5) {
        touchHistory.shift();
      }

      // Start scrolling if we've moved more than a few pixels
      if (!isScrolling && (Math.abs(deltaY) > 5 || Math.abs(deltaX) > 5)) {
        isScrolling = true;
      }

      if (!isScrolling) return;

      // Vertical scrolling (our custom pixel-based)
      if (Math.abs(deltaY) > 0) {
        this.scrollViewportPixels(deltaY);
        lastY = currentY;
      }

      // Horizontal scrolling (native browser scrollLeft) - only if not in horizontal fit mode
      if (Math.abs(deltaX) > 0 && !this.fitHorizontally) {
        this.container.scrollLeft += deltaX;
        lastX = currentX;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      // Only handle touch pointers
      if (e.pointerType !== 'touch') return;

      this.isTouchActive = false;

      // Calculate momentum if we were scrolling
      if (isScrolling && touchHistory.length >= 2) {
        const now = performance.now();
        const recent = touchHistory[touchHistory.length - 1];
        const older = touchHistory[touchHistory.length - 2];

        const timeDiff = now - older.time;
        const distanceY = recent.y - older.y;
        const distanceX = recent.x - older.x;

        // Calculate velocity in pixels per millisecond
        const velocityY = timeDiff > 0 ? -distanceY / timeDiff : 0; // Negative for scroll direction
        const velocityX = timeDiff > 0 ? -distanceX / timeDiff : 0;

        // Start momentum if velocity is above threshold
        const minVelocity = 0.3; // pixels per ms
        if (Math.abs(velocityY) > minVelocity || Math.abs(velocityX) > minVelocity) {
          this.startMomentum(velocityY, velocityX);
        }
      }

      // Release pointer capture
      this.container?.releasePointerCapture(e.pointerId);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      // Only handle touch pointers
      if (e.pointerType !== 'touch') return;

      this.isTouchActive = false;

      // Release pointer capture
      this.container?.releasePointerCapture(e.pointerId);
    };

    // Attach pointer events to the container (touch only)
    this.container.addEventListener('pointerdown', handlePointerDown);
    this.container.addEventListener('pointermove', handlePointerMove);
    this.container.addEventListener('pointerup', handlePointerUp);
    this.container.addEventListener('pointercancel', handlePointerCancel);
  }

  private scrollViewport(deltaLines: number) {
    if (!this.terminal) return;

    const lineHeight = this.fontSize * 1.2;
    const deltaPixels = deltaLines * lineHeight;
    this.scrollViewportPixels(deltaPixels);
  }

  private scrollViewportPixels(deltaPixels: number) {
    if (!this.terminal) return;

    const buffer = this.terminal.buffer.active;
    const lineHeight = this.fontSize * 1.2;
    const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * lineHeight);

    const newViewportY = Math.max(0, Math.min(maxScrollPixels, this.viewportY + deltaPixels));

    // Only render if we actually moved
    if (newViewportY !== this.viewportY) {
      this.viewportY = newViewportY;

      // Update follow cursor state based on scroll position
      this.updateFollowCursorState();
      this.requestRenderBuffer();
    }
  }

  private startMomentum(velocityY: number, velocityX: number) {
    // Store momentum velocities
    this.momentumVelocityY = velocityY * 16; // Convert from pixels/ms to pixels/frame (assuming 60fps)
    this.momentumVelocityX = velocityX * 16;

    // Cancel any existing momentum
    if (this.momentumAnimation) {
      cancelAnimationFrame(this.momentumAnimation);
    }

    // Start momentum animation
    this.animateMomentum();
  }

  private animateMomentum() {
    const minVelocity = 0.1; // Stop when velocity gets very small
    const decayFactor = 0.92; // Exponential decay per frame

    // Apply current velocity to scroll position
    const deltaY = this.momentumVelocityY;
    const deltaX = this.momentumVelocityX;

    let scrolled = false;

    // Apply vertical momentum
    if (Math.abs(deltaY) > minVelocity) {
      const buffer = this.terminal?.buffer.active;
      if (buffer) {
        const lineHeight = this.fontSize * 1.2;
        const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * lineHeight);
        const newViewportY = Math.max(0, Math.min(maxScrollPixels, this.viewportY + deltaY));

        if (newViewportY !== this.viewportY) {
          this.viewportY = newViewportY;
          scrolled = true;

          // Update follow cursor state for momentum scrolling too
          this.updateFollowCursorState();
        } else {
          // Hit boundary, stop vertical momentum
          this.momentumVelocityY = 0;
        }
      }
    }

    // Apply horizontal momentum (only if not in horizontal fit mode)
    if (Math.abs(deltaX) > minVelocity && !this.fitHorizontally && this.container) {
      const newScrollLeft = this.container.scrollLeft + deltaX;
      this.container.scrollLeft = newScrollLeft;
      scrolled = true;
    }

    // Decay velocities
    this.momentumVelocityY *= decayFactor;
    this.momentumVelocityX *= decayFactor;

    // Continue animation if velocities are still significant
    if (
      Math.abs(this.momentumVelocityY) > minVelocity ||
      Math.abs(this.momentumVelocityX) > minVelocity
    ) {
      this.momentumAnimation = requestAnimationFrame(() => {
        this.animateMomentum();
      });

      // Render if we scrolled - use direct call during momentum to avoid RAF conflicts
      if (scrolled) {
        this.renderBuffer();
      }
    } else {
      // Momentum finished
      this.momentumAnimation = null;
      this.momentumVelocityY = 0;
      this.momentumVelocityX = 0;
    }
  }

  private renderBuffer() {
    if (!this.terminal || !this.container) return;

    const startTime = this.debugMode ? performance.now() : 0;

    // Increment render count immediately
    if (this.debugMode) {
      this.renderCount++;
    }

    const buffer = this.terminal.buffer.active;
    const bufferLength = buffer.length;
    const lineHeight = this.fontSize * 1.2;

    // Convert pixel scroll position to fractional line position
    const startRowFloat = this.viewportY / lineHeight;
    const startRow = Math.floor(startRowFloat);
    const pixelOffset = (startRowFloat - startRow) * lineHeight;

    // Build complete innerHTML string
    let html = '';
    const cell = buffer.getNullCell();

    // Get cursor position
    const cursorX = this.terminal.buffer.active.cursorX;
    const cursorY = this.terminal.buffer.active.cursorY + this.terminal.buffer.active.viewportY;

    // Render exactly actualRows
    for (let i = 0; i < this.actualRows; i++) {
      const row = startRow + i;

      // Apply pixel offset to ALL lines for smooth scrolling
      const style = pixelOffset > 0 ? ` style="transform: translateY(-${pixelOffset}px);"` : '';

      if (row >= bufferLength) {
        html += `<div class="terminal-line"${style}></div>`;
        continue;
      }

      const line = buffer.getLine(row);
      if (!line) {
        html += `<div class="terminal-line"${style}></div>`;
        continue;
      }

      // Check if cursor is on this line (relative to viewport)
      const isCursorLine = row === cursorY;
      const lineContent = this.renderLine(line, cell, isCursorLine ? cursorX : -1);

      html += `<div class="terminal-line"${style}>${lineContent || ''}</div>`;
    }

    // Set the complete innerHTML at once
    this.container.innerHTML = html;

    // Process links after rendering
    UrlHighlighter.processLinks(this.container);

    // Track render performance in debug mode
    if (this.debugMode) {
      const endTime = performance.now();
      this.lastRenderTime = endTime - startTime;
      this.totalRenderTime += this.lastRenderTime;

      // Force component re-render to update debug overlay
      this.requestUpdate();
    }
  }

  private renderLine(line: IBufferLine, cell: IBufferCell, cursorCol: number = -1): string {
    let html = '';
    let currentChars = '';
    let currentClasses = '';
    let currentStyle = '';

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const flushGroup = () => {
      if (currentChars) {
        const escapedChars = escapeHtml(currentChars);
        html += `<span class="${currentClasses}"${currentStyle ? ` style="${currentStyle}"` : ''}>${escapedChars}</span>`;
        currentChars = '';
      }
    };

    // Process each cell in the line
    for (let col = 0; col < line.length; col++) {
      line.getCell(col, cell);
      if (!cell) continue;

      // XTerm.js cell API - use || ' ' to ensure we get a space for empty cells
      const char = cell.getChars() || ' ';
      const width = cell.getWidth();

      // Skip zero-width cells (part of wide characters)
      if (width === 0) continue;

      // Get styling attributes
      let classes = 'terminal-char';
      let style = '';

      // Check if this is the cursor position
      const isCursor = col === cursorCol;
      if (isCursor) {
        classes += ' cursor';
      }

      // Get foreground color
      const fg = cell.getFgColor();
      if (fg !== undefined) {
        if (typeof fg === 'number' && fg >= 0 && fg <= 255) {
          // Standard palette color (0-255)
          style += `color: var(--terminal-color-${fg});`;
        } else if (typeof fg === 'number' && fg > 255) {
          // 24-bit RGB color - convert to CSS hex
          const r = (fg >> 16) & 0xff;
          const g = (fg >> 8) & 0xff;
          const b = fg & 0xff;
          style += `color: rgb(${r}, ${g}, ${b});`;
        }
      }

      // Get background color
      const bg = cell.getBgColor();
      if (bg !== undefined) {
        if (typeof bg === 'number' && bg >= 0 && bg <= 255) {
          // Standard palette color (0-255)
          style += `background-color: var(--terminal-color-${bg});`;
        } else if (typeof bg === 'number' && bg > 255) {
          // 24-bit RGB color - convert to CSS hex
          const r = (bg >> 16) & 0xff;
          const g = (bg >> 8) & 0xff;
          const b = bg & 0xff;
          style += `background-color: rgb(${r}, ${g}, ${b});`;
        }
      }

      // Override background for cursor
      if (isCursor) {
        style += `background-color: #23d18b;`;
      }

      // Get text attributes/flags
      const isBold = cell.isBold();
      const isItalic = cell.isItalic();
      const isUnderline = cell.isUnderline();
      const isDim = cell.isDim();

      if (isBold) classes += ' bold';
      if (isItalic) classes += ' italic';
      if (isUnderline) classes += ' underline';
      if (isDim) classes += ' dim';

      // Check if styling changed - if so, flush current group
      if (classes !== currentClasses || style !== currentStyle) {
        flushGroup();
        currentClasses = classes;
        currentStyle = style;
      }

      // Add character to current group
      currentChars += char;
    }

    // Flush final group
    flushGroup();

    return html;
  }

  /**
   * DOM Terminal Public API
   *
   * This component provides a DOM-based terminal renderer with XTerm.js backend.
   * All buffer-modifying operations are queued and executed in requestAnimationFrame
   * to ensure optimal batching and rendering performance.
   */

  // === BUFFER MODIFICATION METHODS (Queued) ===

  /**
   * Write data to the terminal buffer.
   * @param data - String data to write (supports ANSI escape sequences)
   * @param followCursor - If true, automatically scroll to keep cursor visible (default: true)
   */
  public write(data: string, followCursor: boolean = true) {
    if (!this.terminal) return;

    this.queueRenderOperation(async () => {
      if (!this.terminal) return;

      // XTerm.write() is async, wait for it to complete
      await new Promise<void>((resolve) => {
        if (this.terminal) {
          this.terminal.write(data, resolve);
        } else {
          resolve();
        }
      });

      // Follow cursor: scroll to bottom if enabled
      if (followCursor && this.followCursorEnabled) {
        const buffer = this.terminal.buffer.active;
        const lineHeight = this.fontSize * 1.2;
        const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * lineHeight);

        // Set programmatic scroll flag and scroll to bottom
        this.programmaticScroll = true;
        this.viewportY = maxScrollPixels;
        this.programmaticScroll = false;
      }
    });
  }

  /**
   * Clear the terminal buffer and reset scroll position.
   */
  public clear() {
    if (!this.terminal) return;

    this.queueRenderOperation(() => {
      if (!this.terminal) return;

      this.terminal.clear();
      this.viewportY = 0;
    });
  }

  /**
   * Resize the terminal to specified dimensions.
   * @param cols - Number of columns
   * @param rows - Number of rows
   */
  public setTerminalSize(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;

    if (!this.terminal) return;

    this.queueRenderOperation(() => {
      if (!this.terminal) return;

      this.terminal.resize(cols, rows);
      this.fitTerminal();
      this.requestUpdate();
    });
  }

  // === SCROLL CONTROL METHODS (Queued) ===

  /**
   * Scroll to the bottom of the buffer.
   */
  public scrollToBottom() {
    if (!this.terminal) return;

    this.queueRenderOperation(() => {
      if (!this.terminal) return;

      const buffer = this.terminal.buffer.active;
      const lineHeight = this.fontSize * 1.2;
      // Use the same maxScrollPixels calculation as scrollViewportPixels
      const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * lineHeight);

      // Set programmatic scroll flag
      this.programmaticScroll = true;
      this.viewportY = maxScrollPixels;
      this.programmaticScroll = false;
    });
  }

  /**
   * Scroll to a specific position in the buffer.
   * @param position - Line position (0 = top, max = bottom)
   */
  public scrollToPosition(position: number) {
    if (!this.terminal) return;

    this.queueRenderOperation(() => {
      if (!this.terminal) return;

      const buffer = this.terminal.buffer.active;
      const lineHeight = this.fontSize * 1.2;
      const maxScrollLines = Math.max(0, buffer.length - this.actualRows);

      // Set programmatic scroll flag
      this.programmaticScroll = true;
      this.viewportY = Math.max(0, Math.min(maxScrollLines, position)) * lineHeight;
      this.programmaticScroll = false;
    });
  }

  /**
   * Queue a custom operation to be executed after the next render is complete.
   * Useful for actions that need to happen after terminal state is fully updated.
   * @param callback - Function to execute after render
   */
  public queueCallback(callback: () => void) {
    this.queueRenderOperation(callback);
  }

  // === QUERY METHODS (Immediate) ===
  // Note: These methods return current state immediately but may return stale data
  // if operations are pending in the RAF queue. For guaranteed fresh data, call
  // these methods inside queueCallback() to ensure they run after all operations complete.

  /**
   * Get terminal dimensions.
   * @returns Object with cols and rows
   * @note May return stale data if operations are pending. Use queueCallback() for fresh data.
   */
  public getTerminalSize(): { cols: number; rows: number } {
    return {
      cols: this.cols,
      rows: this.rows,
    };
  }

  /**
   * Get number of visible rows in the current viewport.
   * @returns Number of rows that fit in the viewport
   * @note May return stale data if operations are pending. Use queueCallback() for fresh data.
   */
  public getVisibleRows(): number {
    return this.actualRows;
  }

  /**
   * Get total number of lines in the scrollback buffer.
   * @returns Total lines in buffer
   * @note May return stale data if operations are pending. Use queueCallback() for fresh data.
   */
  public getBufferSize(): number {
    if (!this.terminal) return 0;
    return this.terminal.buffer.active.length;
  }

  /**
   * Get current scroll position.
   * @returns Current scroll position (0 = top)
   * @note May return stale data if operations are pending. Use queueCallback() for fresh data.
   */
  public getScrollPosition(): number {
    const lineHeight = this.fontSize * 1.2;
    return Math.round(this.viewportY / lineHeight);
  }

  /**
   * Get maximum possible scroll position.
   * @returns Maximum scroll position
   * @note May return stale data if operations are pending. Use queueCallback() for fresh data.
   */
  public getMaxScrollPosition(): number {
    if (!this.terminal) return 0;
    const buffer = this.terminal.buffer.active;
    return Math.max(0, buffer.length - this.actualRows);
  }

  /**
   * Scroll the viewport to follow the cursor position.
   * This ensures the cursor stays visible during text input or playback.
   */
  private followCursor() {
    if (!this.terminal) return;

    const buffer = this.terminal.buffer.active;
    const cursorY = buffer.cursorY + buffer.viewportY; // Absolute cursor position in buffer
    const lineHeight = this.fontSize * 1.2;

    // Calculate what line the cursor is on
    const cursorLine = cursorY;

    // Calculate current viewport range in lines
    const viewportStartLine = Math.floor(this.viewportY / lineHeight);
    const viewportEndLine = viewportStartLine + this.actualRows - 1;

    // Set programmatic scroll flag to prevent state updates
    this.programmaticScroll = true;

    // If cursor is outside viewport, scroll to keep it visible
    if (cursorLine < viewportStartLine) {
      // Cursor is above viewport - scroll up
      this.viewportY = cursorLine * lineHeight;
    } else if (cursorLine > viewportEndLine) {
      // Cursor is below viewport - scroll down to show cursor at bottom of viewport
      this.viewportY = Math.max(0, (cursorLine - this.actualRows + 1) * lineHeight);
    }

    // Ensure we don't scroll past the buffer
    const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * lineHeight);
    this.viewportY = Math.min(this.viewportY, maxScrollPixels);

    // Clear programmatic scroll flag
    this.programmaticScroll = false;
  }

  /**
   * Check if the terminal is currently scrolled to the bottom.
   * @returns True if at bottom, false otherwise
   */
  private isScrolledToBottom(): boolean {
    if (!this.terminal) return true;

    const buffer = this.terminal.buffer.active;
    const lineHeight = this.fontSize * 1.2;
    const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * lineHeight);

    // Consider "at bottom" if within one line height of the bottom
    return this.viewportY >= maxScrollPixels - lineHeight;
  }

  /**
   * Update follow cursor state based on current scroll position.
   * Disable follow cursor when user scrolls away from bottom.
   * Re-enable when user scrolls back to bottom.
   */
  private updateFollowCursorState(): void {
    // Don't update state during programmatic scrolling
    if (this.programmaticScroll) return;

    const wasAtBottom = this.isScrolledToBottom();

    if (wasAtBottom && !this.followCursorEnabled) {
      // User scrolled back to bottom - re-enable follow cursor
      this.followCursorEnabled = true;
    } else if (!wasAtBottom && this.followCursorEnabled) {
      // User scrolled away from bottom - disable follow cursor
      this.followCursorEnabled = false;
    }
  }

  /**
   * Handle click on scroll-to-bottom indicator
   */
  private handleScrollToBottom = () => {
    // Immediately enable follow cursor to hide the indicator
    this.followCursorEnabled = true;
    this.scrollToBottom();
    this.requestUpdate();
  };

  /**
   * Handle fit to width toggle
   */
  public handleFitToggle = () => {
    if (!this.terminal || !this.container) {
      this.fitHorizontally = !this.fitHorizontally;
      this.requestUpdate();
      return;
    }

    // Store current logical scroll position before toggling
    const buffer = this.terminal.buffer.active;
    const currentLineHeight = this.fontSize * 1.2;
    const currentScrollLines = currentLineHeight > 0 ? this.viewportY / currentLineHeight : 0;
    const wasAtBottom = this.isScrolledToBottom();

    // Store original font size when entering fit mode
    if (!this.fitHorizontally) {
      this.originalFontSize = this.fontSize;
    }

    // Toggle the mode
    this.fitHorizontally = !this.fitHorizontally;

    // Restore original font size when exiting fit mode
    if (!this.fitHorizontally) {
      this.fontSize = this.originalFontSize;
    }

    // Recalculate fit
    this.fitTerminal();

    // Restore scroll position - prioritize staying at bottom if we were there
    if (wasAtBottom) {
      // Force scroll to bottom with new dimensions
      this.scrollToBottom();
    } else {
      // Restore logical scroll position for non-bottom positions
      const newLineHeight = this.fontSize * 1.2;
      const maxScrollPixels = Math.max(0, (buffer.length - this.actualRows) * newLineHeight);
      const newViewportY = currentScrollLines * newLineHeight;
      this.viewportY = Math.max(0, Math.min(maxScrollPixels, newViewportY));
    }

    this.requestUpdate();
  };

  render() {
    return html`
      <style>
        /* Terminal color variables */
        :root {
          --terminal-color-0: #000000;
          --terminal-color-1: #f14c4c;
          --terminal-color-2: #23d18b;
          --terminal-color-3: #f5f543;
          --terminal-color-4: #3b8eea;
          --terminal-color-5: #d670d6;
          --terminal-color-6: #29b8db;
          --terminal-color-7: #e5e5e5;
          --terminal-color-8: #666666;
          --terminal-color-9: #ff6b6b;
          --terminal-color-10: #5af78e;
          --terminal-color-11: #f4f99d;
          --terminal-color-12: #70a5ed;
          --terminal-color-13: #d670d6;
          --terminal-color-14: #5fb3d3;
          --terminal-color-15: #ffffff;
        }

        .terminal-container {
          color: #d4d4d4;
          font-family: 'Fira Code', ui-monospace, SFMono-Regular, monospace;
          font-size: ${this.fontSize}px;
          line-height: ${this.fontSize * 1.2}px;
          white-space: pre;
          touch-action: none !important;
          overflow: hidden !important;
        }

        .terminal-line {
          display: block;
          height: ${this.fontSize * 1.2}px;
          line-height: ${this.fontSize * 1.2}px;
        }

        .terminal-char {
          font-family: inherit;
          display: inline-block;
        }

        .terminal-char.bold {
          font-weight: bold;
        }

        .terminal-char.dim {
          opacity: 0.5;
        }

        .terminal-char.italic {
          font-style: italic;
        }

        .terminal-char.underline {
          text-decoration: underline;
        }

        .terminal-char.strikethrough {
          text-decoration: line-through;
        }

        .terminal-char.inverse {
          filter: invert(1);
        }

        .terminal-char.invisible {
          opacity: 0;
        }

        .terminal-char.cursor {
          animation: cursor-blink 1s infinite;
        }

        @keyframes cursor-blink {
          0%,
          50% {
            opacity: 1;
          }
          51%,
          100% {
            opacity: 0.3;
          }
        }

        .terminal-link {
          color: #4fc3f7;
          text-decoration: underline;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .terminal-link:hover {
          background-color: rgba(79, 195, 247, 0.2);
        }

        .scroll-to-bottom {
          position: absolute;
          bottom: 12px;
          left: 12px;
          width: 48px;
          height: 48px;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid #444;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 24px;
          transition: all 0.2s ease;
          user-select: none;
          z-index: 10;
        }

        .scroll-to-bottom:hover {
          background: rgba(0, 0, 0, 0.9);
          border-color: #666;
          transform: translateY(-1px);
        }

        .scroll-to-bottom:active {
          transform: translateY(0px);
        }

        .debug-overlay {
          position: absolute;
          bottom: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid #444;
          border-radius: 4px;
          padding: 8px 12px;
          font-family: 'Fira Code', monospace;
          font-size: 11px;
          color: #d4d4d4;
          user-select: none;
          z-index: 10;
          line-height: 1.4;
        }

        .debug-overlay .metric {
          display: flex;
          justify-content: space-between;
          min-width: 120px;
        }

        .debug-overlay .metric-label {
          opacity: 0.7;
        }

        .debug-overlay .metric-value {
          font-weight: bold;
          margin-left: 8px;
        }

        .fit-toggle {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 48px;
          height: 48px;
          background: rgba(0, 0, 0, 0.8);
          border: 1px solid #444;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #d4d4d4;
          font-size: 20px;
          transition: all 0.2s ease;
          user-select: none;
          z-index: 10;
        }

        .fit-toggle:hover {
          background: rgba(0, 0, 0, 0.9);
          border-color: #666;
          transform: translateY(-1px);
        }

        .fit-toggle:active {
          transform: translateY(0px);
        }

        .fit-toggle.active {
          border-color: #569cd6;
          color: #569cd6;
        }
      </style>
      <div style="position: relative; width: 100%; height: 100%;">
        <div id="terminal-container" class="terminal-container w-full h-full overflow-hidden"></div>
        ${!this.followCursorEnabled
          ? html`
              <div
                class="scroll-to-bottom"
                @click=${this.handleScrollToBottom}
                title="Scroll to bottom"
              >
                ↓
              </div>
            `
          : ''}
        ${this.debugMode
          ? html`
              <div class="debug-overlay">
                <div class="metric">
                  <span class="metric-label">Renders:</span>
                  <span class="metric-value">${this.renderCount}</span>
                </div>
                <div class="metric">
                  <span class="metric-label">Avg:</span>
                  <span class="metric-value"
                    >${this.renderCount > 0
                      ? (this.totalRenderTime / this.renderCount).toFixed(2)
                      : '0.00'}ms</span
                  >
                </div>
                <div class="metric">
                  <span class="metric-label">Last:</span>
                  <span class="metric-value">${this.lastRenderTime.toFixed(2)}ms</span>
                </div>
              </div>
            `
          : ''}
      </div>
    `;
  }
}
