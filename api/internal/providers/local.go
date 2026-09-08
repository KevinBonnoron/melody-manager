package providers

import (
	"context"
	"strings"
)

// Local streams music files already on the server's disk. Importing/scanning is
// handled by the local scanner (see local/ package); here it only resolves a
// stored sourceUrl/localPath into a file stream.
type Local struct{}

func (Local) ID() string { return "local" }

func (Local) ResolveStream(_ context.Context, sourceURL string, _ Config) (*Stream, error) {
	path := strings.TrimPrefix(sourceURL, "file://")
	return &Stream{Kind: "file", Path: path}, nil
}

var _ StreamResolver = Local{}
