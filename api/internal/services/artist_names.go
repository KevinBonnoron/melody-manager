package services

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type knownArtist func(name string) bool

var (
	plainSeparators     = []string{";", " feat. ", " feat ", " ft. ", " ft ", " featuring "}
	ambiguousSeparators = []string{" & ", " / ", "/", " + "}
)

func splitArtistName(known knownArtist, raw string, anchors ...string) []string {
	if whole := strings.TrimSpace(raw); whole != "" && known != nil && known(whole) {
		return []string{whole}
	}

	var out []string
	for _, part := range splitOnAny(raw, plainSeparators) {
		out = append(out, splitAmbiguous(known, part, anchors)...)
	}
	return dedupeNames(out)
}

func artistOnRecord(app core.App) knownArtist {
	return func(name string) bool {
		_, err := app.FindFirstRecordByFilter("artists", "name = {:n}", dbx.Params{"n": name})
		return err == nil
	}
}

func splitAmbiguous(known knownArtist, name string, anchors []string) []string {
	for _, sep := range ambiguousSeparators {
		parts := splitOnAny(name, []string{sep})
		if len(parts) < 2 {
			continue
		}

		for _, part := range parts {
			if matchesAnchor(part, anchors) || (known != nil && known(part)) {
				return parts
			}
		}
	}

	return []string{name}
}

func matchesAnchor(name string, anchors []string) bool {
	for _, anchor := range anchors {
		if strings.EqualFold(strings.TrimSpace(anchor), name) {
			return true
		}
	}

	return false
}

func splitOnAny(value string, separators []string) []string {
	parts := []string{value}
	for _, sep := range separators {
		var next []string
		for _, part := range parts {
			for _, piece := range strings.Split(part, sep) {
				if trimmed := strings.TrimSpace(piece); trimmed != "" {
					next = append(next, trimmed)
				}
			}
		}
		parts = next
	}

	return parts
}

func dedupeNames(names []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, name := range names {
		key := strings.ToLower(name)
		if name == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, name)
	}

	return out
}
