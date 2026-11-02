//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris

package main

import (
	"errors"
	"os"
)

func setProcessPaused(_ *os.Process, _ bool) error {
	return errors.New("pausing ffplay is not supported on this platform; install mpv")
}
