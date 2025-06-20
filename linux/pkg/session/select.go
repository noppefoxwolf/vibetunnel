//go:build darwin || linux
// +build darwin linux

package session

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// selectRead is implemented in platform-specific files:
// - select_darwin.go for macOS
// - select_linux.go for Linux

// fdSetAdd adds a file descriptor to an FdSet
func fdSetAdd(set *syscall.FdSet, fd int) {
	set.Bits[fd/64] |= 1 << uint(fd%64)
}

// fdIsSet checks if a file descriptor is set in an FdSet
func fdIsSet(set *syscall.FdSet, fd int) bool {
	return set.Bits[fd/64]&(1<<uint(fd%64)) != 0
}

// pollWithSelect polls multiple file descriptors using select
func (p *PTY) pollWithSelect() error {
	// Buffer for reading
	buf := make([]byte, 32*1024)

	// Get file descriptors
	ptyFd := int(p.pty.Fd())
	stdinFd := int(p.stdinPipe.Fd())

	// Open control FIFO in non-blocking mode
	controlPath := filepath.Join(p.session.Path(), "control")
	controlFile, err := os.OpenFile(controlPath, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	var controlFd int = -1
	if err == nil {
		controlFd = int(controlFile.Fd())
		defer controlFile.Close()
	} else {
		log.Printf("[WARN] Failed to open control FIFO: %v", err)
	}

	for {
		// Build FD list
		fds := []int{ptyFd, stdinFd}
		if controlFd >= 0 {
			fds = append(fds, controlFd)
		}

		// Wait for activity with 100ms timeout
		ready, err := selectRead(fds, 100*time.Millisecond)
		if err != nil {
			log.Printf("[ERROR] select error: %v", err)
			return err
		}

		// Check if process has exited
		if p.cmd.ProcessState != nil {
			return nil
		}

		// Process ready file descriptors
		for _, fd := range ready {
			switch fd {
			case ptyFd:
				// Read from PTY
				n, err := syscall.Read(ptyFd, buf)
				if err != nil {
					if err == syscall.EIO {
						// PTY closed
						return nil
					}
					log.Printf("[ERROR] PTY read error: %v", err)
					return err
				}
				if n > 0 {
					// Write to output
					if err := p.streamWriter.WriteOutput(buf[:n]); err != nil {
						log.Printf("[ERROR] Failed to write to stream: %v", err)
					}
				}

			case stdinFd:
				// Read from stdin FIFO
				n, err := syscall.Read(stdinFd, buf)
				if err != nil && err != syscall.EAGAIN {
					log.Printf("[ERROR] stdin read error: %v", err)
					continue
				}
				if n > 0 {
					// Write to PTY
					if _, err := p.pty.Write(buf[:n]); err != nil {
						log.Printf("[ERROR] Failed to write to PTY: %v", err)
					}
				}

			case controlFd:
				// Read from control FIFO
				n, err := syscall.Read(controlFd, buf)
				if err != nil && err != syscall.EAGAIN {
					log.Printf("[ERROR] control read error: %v", err)
					continue
				}
				if n > 0 {
					// Parse control commands
					cmdStr := string(buf[:n])
					for _, line := range strings.Split(cmdStr, "\n") {
						line = strings.TrimSpace(line)
						if line == "" {
							continue
						}

						var cmd ControlCommand
						if err := json.Unmarshal([]byte(line), &cmd); err != nil {
							log.Printf("[ERROR] Failed to parse control command: %v", err)
							continue
						}

						p.session.handleControlCommand(&cmd)
					}
				}
			}
		}
	}
}
