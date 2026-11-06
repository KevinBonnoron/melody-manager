package services

import (
	"context"
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/tests"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

func TestPreviewTracksRejectsAnUnknownSource(t *testing.T) {
	_, err := PreviewTracks(context.Background(), nil, providers.NewRegistry(), "https://example.com/watch?v=abc", "")
	if !errors.Is(err, ErrNoProvider) {
		t.Fatalf("want ErrNoProvider, got %v", err)
	}
}

func TestUnconfiguredProviderCannotSearchPreviewOrImport(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	registry := providers.NewRegistry()
	const url = "https://soundcloud.com/artist/track"

	results, providerErrors := SearchProviders(context.Background(), app, registry, "track", domain.ResultTrack, "listener")
	if len(results) != 0 || len(providerErrors) != 0 {
		t.Fatalf("unconfigured search returned results=%d errors=%d", len(results), len(providerErrors))
	}
	if _, err := PreviewTracks(context.Background(), app, registry, url, "listener"); !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("preview error = %v, want ErrProviderUnavailable", err)
	}
	if _, err := Import(context.Background(), app, registry, url, KindTrack, "listener"); !errors.Is(err, ErrProviderUnavailable) {
		t.Fatalf("import error = %v, want ErrProviderUnavailable", err)
	}
}
