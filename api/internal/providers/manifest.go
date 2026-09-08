package providers

// Category of a provider.
const (
	CategoryTrack  = "track"
	CategoryDevice = "device"
)

// AuthKind describes how a provider authenticates (see
// docs/guide/configuration.md).
const (
	AuthNone             = "none"               // anonymous (soundcloud, bandcamp, local)
	AuthServerCredential = "server-credentials" // admin app credentials (spotify clientId/secret)
	AuthUserOAuth        = "user-oauth"         // per-user OAuth token (spotify private import)
	AuthUserCredential   = "user-credentials"   // per-user secret
)

// SchemaField is one configurable field, tagged server- or user-level by the
// schema it lives in (ConfigSchema vs ConnectionSchema).
type SchemaField struct {
	Name        string `json:"name"`
	Type        string `json:"type"` // string|secret|textarea|bool|number|string-list
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	Required    bool   `json:"required,omitempty"`
}

// Manifest is the static description of a provider type. It keeps the legacy
// JSON shape (so the existing client keeps working) and adds the new-model
// fields: AuthKind, UserConnectable, CatalogOnly, Category.
type Manifest struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Version     string   `json:"version,omitempty"`
	Icon        string   `json:"icon,omitempty"`
	Scope       string   `json:"scope"`
	Features    []string `json:"features"`
	SearchTypes []string `json:"searchTypes,omitempty"`
	ImportTypes []string `json:"importTypes,omitempty"`
	URLPatterns []string `json:"urlPatterns,omitempty"`

	// ConfigSchema = server/admin-level (stored in provider_settings.config).
	ConfigSchema []SchemaField `json:"configSchema,omitempty"`
	// ConnectionSchema = per-user (stored in connections.config).
	ConnectionSchema []SchemaField `json:"connectionSchema,omitempty"`

	Category        string `json:"category"`
	AuthKind        string `json:"authKind"`
	UserConnectable bool   `json:"userConnectable"`
	CatalogOnly     bool   `json:"catalogOnly"`
}

var manifests = []Manifest{
	{
		ID: "local", Name: "Local Files", Icon: "hard-drive", Scope: "public", Version: "1.0.0",
		Description:     "Import and stream music from local files on disk",
		Features:        []string{"import", "stream"},
		ImportTypes:     []string{"track"},
		Category:        CategoryTrack,
		AuthKind:        AuthNone,
		UserConnectable: false, // server library, admin-only
		ConfigSchema: []SchemaField{
			{Name: "path", Type: "string", Label: "Music directory", Required: true,
				Description: "Path to the local directory containing music files"},
		},
	},
	{
		ID: "youtube", Name: "YouTube", Icon: "youtube", Scope: "personal", Version: "1.0.0",
		Description:     "Search, stream and import music from YouTube videos and playlists",
		Features:        []string{"search", "stream", "import"},
		SearchTypes:     []string{"track", "album", "artist", "playlist"},
		ImportTypes:     []string{"track", "album", "artist", "playlist"},
		URLPatterns:     []string{"youtube.com", "youtu.be", "youtube:"},
		Category:        CategoryTrack,
		AuthKind:        AuthNone,
		UserConnectable: true,
		ConfigSchema: []SchemaField{
			{Name: "downloadPath", Type: "string", Label: "Download path", Required: true,
				Description: "Server path where YouTube audio files will be downloaded"},
		},
		ConnectionSchema: []SchemaField{
			{Name: "cookies", Type: "textarea", Label: "Cookies (optional)", Required: false,
				Description: "YouTube cookies in Netscape format. Only needed if YouTube blocks requests."},
		},
	},
	{
		ID: "soundcloud", Name: "SoundCloud", Icon: "soundcloud", Scope: "personal", Version: "1.0.0",
		Description:     "Search, stream and import music from SoundCloud",
		Features:        []string{"search", "stream", "import"},
		SearchTypes:     []string{"track"},
		ImportTypes:     []string{"track"},
		URLPatterns:     []string{"soundcloud.com", "soundcloud:"},
		Category:        CategoryTrack,
		AuthKind:        AuthNone,
		UserConnectable: true, // opt-in
	},
	{
		ID: "bandcamp", Name: "Bandcamp", Icon: "bandcamp", Scope: "personal", Version: "1.1.0",
		Description:     "Stream music from Bandcamp",
		Features:        []string{"stream", "import"},
		ImportTypes:     []string{"track", "album", "artist"},
		URLPatterns:     []string{"bandcamp.com", "bandcamp:"},
		Category:        CategoryTrack,
		AuthKind:        AuthNone,
		UserConnectable: true, // opt-in
	},
	{
		ID: "spotify", Name: "Spotify", Icon: "spotify", Scope: "personal", Version: "1.0.0",
		Description:     "Search and import music from Spotify",
		Features:        []string{"search", "import"},
		SearchTypes:     []string{"track"},
		ImportTypes:     []string{"track"},
		URLPatterns:     []string{"spotify.com", "spotify:"},
		Category:        CategoryTrack,
		AuthKind:        AuthServerCredential, // app creds (admin) + user-oauth for private import
		UserConnectable: true,
		CatalogOnly:     true, // metadata only; audio resolved via youtube
		ConfigSchema: []SchemaField{
			{Name: "clientId", Type: "string", Label: "Client ID", Required: true,
				Description: "Spotify application client ID"},
			{Name: "clientSecret", Type: "secret", Label: "Client Secret", Required: true,
				Description: "Spotify application client secret"},
		},
	},
	{
		ID: "sonos", Name: "Sonos", Icon: "speaker", Scope: "shared", Version: "1.0.0",
		Description:     "Stream music to Sonos speakers on the local network",
		Features:        []string{"device"},
		Category:        CategoryDevice,
		AuthKind:        AuthNone,
		UserConnectable: false,
	},
}

// Manifests returns all known provider manifests (track + device).
func Manifests() []Manifest {
	out := make([]Manifest, len(manifests))
	copy(out, manifests)
	return out
}

// ManifestByID returns the manifest for a provider type, or nil.
func ManifestByID(id string) *Manifest {
	for i := range manifests {
		if manifests[i].ID == id {
			return &manifests[i]
		}
	}
	return nil
}

// ManifestFor returns the manifest for a provider type.
func ManifestFor(id string) (Manifest, bool) {
	for _, m := range Manifests() {
		if m.ID == id {
			return m, true
		}
	}
	return Manifest{}, false
}
