package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// ErrNoProvider says the URL belongs to no known provider, so nothing can resolve it.
var ErrNoProvider = errors.New("no provider matches URL")

// PreviewTracks resolves a URL the way Import does and returns the tracks an import would
// create, without persisting anything: a long video cut on its chapters comes back as one
// entry per chapter, so the caller can show what it is about to add.
func PreviewTracks(ctx context.Context, app core.App, reg *providers.Registry, url, userID string) ([]domain.ResolvedTrack, error) {
	providerID := providers.DetectFromURL(url)
	if providerID == "" {
		return nil, fmt.Errorf("%w: %s", ErrNoProvider, url)
	}
	cfg := pbx.EffectiveConfig(app, userID, providerID)

	resolver := reg.TrackResolver(providerID)
	if resolver == nil {
		catalog := reg.CatalogResolver(providerID)
		if catalog == nil {
			return nil, fmt.Errorf("provider %q cannot resolve tracks", providerID)
		}

		// A catalog source knows the track but not its audio; the import resolves a playable
		// twin for it, which never splits, so one entry is the whole preview.
		meta, err := catalog.ResolveCatalogTrack(ctx, url, cfg)
		if err != nil {
			return nil, err
		}
		meta.Source = providerID
		return []domain.ResolvedTrack{meta}, nil
	}

	resolved, err := resolver.ResolveTracks(ctx, url, cfg)
	if err != nil {
		return nil, err
	}
	for i := range resolved {
		resolved[i].Source = providerID
	}
	return resolved, nil
}
