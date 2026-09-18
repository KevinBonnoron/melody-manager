package providers

import (
	"context"
	"net/url"
	"os"
	"strings"

	"github.com/KevinBonnoron/melody-manager/api/internal/domain"
)

// Config is the effective per-request provider config.
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

// PlaylistNamer is optionally implemented by providers that can name a playlist URL, so an
// imported playlist keeps its own title.
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
//
// A pattern ending in ":" is one of our own source ids, matched on the front of the string.
// Every other pattern is a domain, and a domain is only the host: looked for anywhere in the
// string it is also found in a query, a path or a userinfo, and the link
// http://169.254.169.254/?x=youtube.com would be handed to yt-dlp as if YouTube had written it.
func DetectFromURL(raw string) string {
	host := ""
	if u, err := url.Parse(raw); err == nil {
		host = strings.ToLower(u.Hostname())
	}

	for _, mf := range manifests {
		for _, p := range mf.URLPatterns {
			if strings.HasSuffix(p, ":") {
				if strings.HasPrefix(raw, p) {
					return mf.ID
				}
				continue
			}

			if host == p || strings.HasSuffix(host, "."+p) {
				return mf.ID
			}
		}
	}
	return ""
}

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

// CatalogResolver describes a source that knows a track but cannot serve its audio, Spotify,
// whose streams are DRM-protected.
type CatalogResolver interface {
	ResolveCatalogTrack(ctx context.Context, url string, cfg Config) (domain.ResolvedTrack, error)
}

func (r *Registry) CatalogResolver(id string) CatalogResolver {
	if c, ok := r.providers[id].(CatalogResolver); ok {
		return c
	}
	return nil
}
