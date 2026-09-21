// Package version carries which build this is, stamped in when the binary is
// linked. A server and the client it serves come out of the same build, so one
// answer covers both.
package version

import (
	"runtime/debug"
	"strings"
)

// Revision names the build, and is the commit it was made from. It is set at
// link time by whatever built it.
var Revision = ""

// BuiltAt is when it was linked, in RFC 3339.
var BuiltAt = ""

// Build is what this binary is. Nothing set it when it was built by hand, and
// Go's own record of the checkout it came out of answers instead, which is the
// case that matters most: a build made to try something is the one whose
// identity is easiest to lose track of.
func Build() (revision, builtAt string) {
	revision, builtAt = Revision, BuiltAt
	if revision != "" && builtAt != "" {
		return revision, builtAt
	}

	info, ok := debug.ReadBuildInfo()
	if !ok {
		return fallback(revision), builtAt
	}

	var modified bool
	for _, setting := range info.Settings {
		switch setting.Key {
		case "vcs.revision":
			if revision == "" && len(setting.Value) >= 7 {
				revision = setting.Value[:7]
			}
		case "vcs.time":
			if builtAt == "" {
				builtAt = setting.Value
			}
		case "vcs.modified":
			modified = setting.Value == "true"
		}
	}
	if modified && revision != "" && !strings.HasSuffix(revision, "-dirty") {
		revision += "-dirty"
	}
	return fallback(revision), builtAt
}

func fallback(revision string) string {
	if revision == "" {
		return "unknown"
	}
	return revision
}
