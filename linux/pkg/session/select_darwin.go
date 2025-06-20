//go:build darwin
// +build darwin

package session

import (
	"fmt"
	"syscall"
	"time"
)

// selectRead performs a select() operation on multiple file descriptors
func selectRead(fds []int, timeout time.Duration) ([]int, error) {
	if len(fds) == 0 {
		return nil, fmt.Errorf("no file descriptors to select on")
	}

	// Find the highest FD number
	maxFd := 0
	for _, fd := range fds {
		if fd > maxFd {
			maxFd = fd
		}
	}

	// Create FD set
	var readSet syscall.FdSet
	for _, fd := range fds {
		fdSetAdd(&readSet, fd)
	}

	// Convert timeout to timeval
	tv := syscall.NsecToTimeval(timeout.Nanoseconds())

	// Perform select - on Darwin, Select returns only error
	err := syscall.Select(maxFd+1, &readSet, nil, nil, &tv)
	if err != nil {
		if err == syscall.EINTR || err == syscall.EAGAIN {
			return []int{}, nil // Interrupted or would block
		}
		return nil, err
	}

	// Check which FDs are ready
	var ready []int
	for _, fd := range fds {
		if fdIsSet(&readSet, fd) {
			ready = append(ready, fd)
		}
	}

	return ready, nil
}