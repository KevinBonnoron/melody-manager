package providers

import (
	"context"
	"os"
	"strings"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// Config is the effective per-request provider config: server-level
// (provider_settings.config) overlaid with the user connection (connections.config).
type Config map[string]any

// String returns a string config value, or "".
func (c Config) String(key string) string {
	if c == nil {
		return ""
	}
	if v, ok := c[key].(string); ok {
		return v
	}
	return ""
}

// Stream describes how to obtain a track's audio.
type Stream struct {
	Kind     string // "url" | "file"
	URL      string
	Path     string
	MimeType string
	// Download, when set, fetches the audio to a local file (used for sources
	// whose direct URLs expire quickly, e.g. SoundCloud).
	Download func(ctx context.Context) (string, error)
}

// Provider is the minimal identity every provider implements.
type Provider interface{ ID() string }

// Searcher searches a remote source.
type Searcher interface {
	Search(ctx context.Context, query string, typ domain.SearchResultType, cfg Config) ([]domain.SearchResult, error)
}

// TrackResolver resolves a URL into one or more tracks (metadata only).
type TrackResolver interface {
	ResolveTracks(ctx context.Context, url string, cfg Config) ([]domain.ResolvedTrack, error)
}

// StreamResolver resolves a source URL into playable audio.
type StreamResolver interface {
	ResolveStream(ctx context.Context, sourceURL string, cfg Config) (*Stream, error)
}

// Registry holds the registered provider implementations keyed by id.
type Registry struct {
	providers map[string]Provider
}

// PlaylistNamer is optionally implemented by providers that can name a
// playlist URL, so an imported playlist keeps its own title.
type PlaylistNamer interface {
	PlaylistName(ctx context.Context, url string, cfg Config) (string, error)
}

// NewRegistry builds the registry with all track providers wired in.
func NewRegistry() *Registry {
	r := &Registry{providers: map[string]Provider{}}
	r.add(Local{})
	r.add(YouTube{})
	r.add(SoundCloud{})
	r.add(Bandcamp{})
	r.add(Spotify{})
	return r
}

func (r *Registry) add(p Provider) { r.providers[p.ID()] = p }

// Get returns the provider for an id.
func (r *Registry) Get(id string) Provider { return r.providers[id] }

// Searcher / TrackResolver / StreamResolver return the typed capability or nil.
func (r *Registry) Searcher(id string) Searcher {
	if s, ok := r.providers[id].(Searcher); ok {
		return s
	}
	return nil
}

func (r *Registry) TrackResolver(id string) TrackResolver {
	if t, ok := r.providers[id].(TrackResolver); ok {
		return t
	}
	return nil
}

func (r *Registry) StreamResolver(id string) StreamResolver {
	if s, ok := r.providers[id].(StreamResolver); ok {
		return s
	}
	return nil
}

// DetectFromURL returns the provider id whose manifest urlPatterns match, or "".
func DetectFromURL(url string) string {
	for _, mf := range manifests {
		for _, p := range mf.URLPatterns {
			if strings.Contains(url, strings.TrimSuffix(p, ":")) {
				return mf.ID
			}
		}
	}
	return ""
}

// writeCookies materialises a Netscape cookies file from config, returning its
// path and a cleanup func.
func writeCookies(cfg Config) (string, func()) {
	c := cfg.String("cookies")
	if c == "" {
		return "", func() {}
	}
	f, err := os.CreateTemp("", "ytcookies-*.txt")
	if err != nil {
		return "", func() {}
	}
	_, _ = f.WriteString(c)
	_ = f.Close()
	return f.Name(), func() { _ = os.Remove(f.Name()) }
}
