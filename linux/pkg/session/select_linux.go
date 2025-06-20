//go:build linux
// +build linux

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

	// Perform select - on Linux, Select returns (n int, err error)
	n, err := syscall.Select(maxFd+1, &readSet, nil, nil, &tv)
	if err != nil {
		if err == syscall.EINTR || err == syscall.EAGAIN {
			return []int{}, nil // Interrupted or would block
		}
		return nil, err
	}
	
	// If no FDs are ready, return empty slice
	if n == 0 {
		return []int{}, nil
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