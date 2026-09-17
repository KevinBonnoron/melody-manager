package services

import (
	"context"
	"errors"
	"testing"

	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

func TestPreviewTracksRejectsAnUnknownSource(t *testing.T) {
	_, err := PreviewTracks(context.Background(), nil, providers.NewRegistry(), "https://example.com/watch?v=abc", "")
	if !errors.Is(err, ErrNoProvider) {
		t.Fatalf("want ErrNoProvider, got %v", err)
	}
}
