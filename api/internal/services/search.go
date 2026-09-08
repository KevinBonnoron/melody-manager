package services

import (
	"context"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
	"github.com/KevinBonnoron/melody-manager/api/internal/pbx"
	"github.com/KevinBonnoron/melody-manager/api/internal/providers"
)

// SearchLibrary searches the local database (tracks, albums, artists).
func SearchLibrary(app core.App, query string) []domain.SearchResult {
	var out []domain.SearchResult

	if recs, err := app.FindRecordsByFilter("tracks", "title ~ {:q}", "-created", 20, 0, dbx.Params{"q": query}); err == nil {
		for _, r := range recs {
			out = append(out, domain.SearchResult{
				Type: domain.ResultTrack, ID: r.Id, Title: r.GetString("title"),
				Source: r.GetString("source"), SourceURL: r.GetString("sourceUrl"),
				Duration: r.GetInt("duration"), InLibrary: true,
			})
		}
	}
	if recs, err := app.FindRecordsByFilter("albums", "name ~ {:q}", "-created", 20, 0, dbx.Params{"q": query}); err == nil {
		for _, r := range recs {
			out = append(out, domain.SearchResult{Type: domain.ResultAlbum, ID: r.Id, Title: r.GetString("name"), InLibrary: true})
		}
	}
	if recs, err := app.FindRecordsByFilter("artists", "name ~ {:q}", "-created", 20, 0, dbx.Params{"q": query}); err == nil {
		for _, r := range recs {
			out = append(out, domain.SearchResult{Type: domain.ResultArtist, ID: r.Id, Title: r.GetString("name"), InLibrary: true})
		}
	}
	return out
}

// ProviderError reports a provider that could not answer, in the shape the
// client renders as a "connect this source" prompt (ProviderError in
// src/shared/types/search-result.type.ts).
type ProviderError struct {
	Provider string `json:"provider"`
	Code     string `json:"code"`
}

const (
	codeCookiesRequired     = "COOKIES_REQUIRED"
	codeCredentialsRequired = "CREDENTIALS_REQUIRED"
)

// SearchProviders queries every enabled provider that supports search and that
// the user can use, marking results already present in the library. Providers
// that fail are reported rather than dropped: an expired cookie or a missing
// Spotify credential is actionable by the user.
func SearchProviders(ctx context.Context, app core.App, reg *providers.Registry, query string, typ domain.SearchResultType, userID string) ([]domain.SearchResult, []ProviderError) {
	var out []domain.SearchResult
	errs := make([]ProviderError, 0)
	for _, mf := range providers.Manifests() {
		if !slices.Contains(mf.Features, "search") || !pbx.ProviderEnabled(app, mf.ID) {
			continue
		}
		s := reg.Searcher(mf.ID)
		if s == nil {
			continue
		}
		cfg := pbx.EffectiveConfig(app, userID, mf.ID)
		results, err := s.Search(ctx, query, typ, cfg)
		if err != nil {
			if code := authErrorCode(mf.ID, err); code != "" {
				errs = append(errs, ProviderError{Provider: mf.ID, Code: code})
			} else {
				app.Logger().Warn("provider search failed", "provider", mf.ID, "error", err)
			}
			continue
		}
		for i := range results {
			results[i].InLibrary = inLibrary(app, results[i].SourceURL)
		}
		out = append(out, results...)
	}
	return out, errs
}

// authErrorCode classifies a provider failure the user can act on, or returns
// "" for anything else (a network blip is not a credentials problem).
func authErrorCode(provider string, err error) string {
	msg := strings.ToLower(err.Error())
	switch provider {
	case "spotify":
		if strings.Contains(msg, "client") || strings.Contains(msg, "401") || strings.Contains(msg, "credential") {
			return codeCredentialsRequired
		}
	case "youtube", "soundcloud":
		if strings.Contains(msg, "sign in") || strings.Contains(msg, "cookie") || strings.Contains(msg, "bot") || strings.Contains(msg, "403") {
			return codeCookiesRequired
		}
	}
	return ""
}

func inLibrary(app core.App, sourceURL string) bool {
	if sourceURL == "" {
		return false
	}
	n, _ := app.CountRecords("tracks", dbx.NewExp("sourceUrl = {:u}", dbx.Params{"u": sourceURL}))
	return n > 0
}
