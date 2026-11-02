//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package main

import (
	"os"
	"syscall"
)

func setProcessPaused(process *os.Process, paused bool) error {
	if paused {
		return process.Signal(syscall.SIGSTOP)
	}
	return process.Signal(syscall.SIGCONT)
}
