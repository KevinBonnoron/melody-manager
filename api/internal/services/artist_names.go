package services

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// knownArtist reports whether the library can already point at this name.
type knownArtist func(name string) bool

// A tag holds one artist string, so a collaboration arrives as a single name.
var (
	// These never occur inside an artist's own name.
	plainSeparators = []string{";", " feat. ", " feat ", " ft. ", " ft ", " featuring "}
	// These do: AC/DC, Simon & Garfunkel, Earth, Wind & Fire.
	ambiguousSeparators = []string{" & ", " / ", "/", " + "}
)

// splitArtistName turns a tag's artist field into the artists it names.
//
// The unambiguous separators always split. "&" and "/" only split when one of
// the parts is someone the library can already point at: the album's artist,
// the folder the file sits in, or an artist already on record. Without that
// guard "AC/DC" becomes two bands.
func splitArtistName(known knownArtist, raw string, anchors ...string) []string {
	var out []string
	for _, part := range splitOnAny(raw, plainSeparators) {
		out = append(out, splitAmbiguous(known, part, anchors)...)
	}
	return dedupeNames(out)
}

// artistOnRecord answers the same question against the library itself.
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
