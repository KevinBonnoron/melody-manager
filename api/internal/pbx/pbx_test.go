package pbx

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestEffectiveConfigKeepsYouTubeCookiesServerOwned(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	providerConfig := core.NewBaseCollection("provider_config")
	providerConfig.Fields.Add(
		&core.TextField{Name: "type", Required: true},
		&core.JSONField{Name: "config", MaxSize: 2_000_000},
	)
	if err := app.Save(providerConfig); err != nil {
		t.Fatal(err)
	}
	connections := core.NewBaseCollection("connections")
	connections.Fields.Add(
		&core.TextField{Name: "user", Required: true},
		&core.TextField{Name: "type", Required: true},
		&core.JSONField{Name: "config", MaxSize: 2_000_000},
	)
	if err := app.Save(connections); err != nil {
		t.Fatal(err)
	}

	for _, providerType := range []string{"youtube", "soundcloud"} {
		server := core.NewRecord(providerConfig)
		server.Set("type", providerType)
		server.Set("config", map[string]any{"cookies": "server"})
		if err := app.Save(server); err != nil {
			t.Fatal(err)
		}
		listener := core.NewRecord(connections)
		listener.Set("user", "listener")
		listener.Set("type", providerType)
		listener.Set("config", map[string]any{"cookies": "listener"})
		if err := app.Save(listener); err != nil {
			t.Fatal(err)
		}
	}

	if got := EffectiveConfig(app, "listener", "youtube").String("cookies"); got != "server" {
		t.Fatalf("YouTube cookies = %q, want server-owned value", got)
	}
	if got := EffectiveConfig(app, "listener", "soundcloud").String("cookies"); got != "listener" {
		t.Fatalf("SoundCloud cookies = %q, want listener-owned value", got)
	}
}

func TestProviderUsableRequiresActivationConfigAndUserLink(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	settings := core.NewBaseCollection("provider_settings")
	settings.Fields.Add(&core.TextField{Name: "type", Required: true}, &core.BoolField{Name: "enabled"})
	configs := core.NewBaseCollection("provider_config")
	configs.Fields.Add(&core.TextField{Name: "type", Required: true}, &core.JSONField{Name: "config"})
	connections := core.NewBaseCollection("connections")
	connections.Fields.Add(&core.TextField{Name: "user", Required: true}, &core.TextField{Name: "type", Required: true}, &core.JSONField{Name: "config"})
	for _, collection := range []*core.Collection{settings, configs, connections} {
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
	}
	for _, typ := range []string{"soundcloud", "youtube", "spotify", "local"} {
		record := core.NewRecord(settings)
		record.Set("type", typ)
		record.Set("enabled", true)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}

	if ProviderUsable(app, "listener", "soundcloud", "search") {
		t.Fatal("SoundCloud should require a user link")
	}
	if ProviderUsable(app, "listener", "youtube", "search") {
		t.Fatal("YouTube should require a user link")
	}
	if ProviderUsable(app, "listener", "local", "import") {
		t.Fatal("local import should require its server path")
	}
	localConfig := core.NewRecord(configs)
	localConfig.Set("type", "local")
	localConfig.Set("config", map[string]any{"path": "/music"})
	if err := app.Save(localConfig); err != nil {
		t.Fatal(err)
	}
	if !ProviderUsable(app, "listener", "local", "import") {
		t.Fatal("an enabled and configured public source should be usable")
	}
	if ProviderUsable(app, "listener", "spotify", "search") {
		t.Fatal("Spotify should require its server credentials")
	}

	otherLink := core.NewRecord(connections)
	otherLink.Set("user", "other")
	otherLink.Set("type", "soundcloud")
	if err := app.Save(otherLink); err != nil {
		t.Fatal(err)
	}
	if ProviderUsable(app, "listener", "soundcloud", "search") {
		t.Fatal("another user's link should not grant access")
	}

	for _, typ := range []string{"soundcloud", "youtube", "spotify"} {
		link := core.NewRecord(connections)
		link.Set("user", "listener")
		link.Set("type", typ)
		if err := app.Save(link); err != nil {
			t.Fatal(err)
		}
	}
	spotifyConfig := core.NewRecord(configs)
	spotifyConfig.Set("type", "spotify")
	spotifyConfig.Set("config", map[string]any{"clientId": "id", "clientSecret": "secret"})
	if err := app.Save(spotifyConfig); err != nil {
		t.Fatal(err)
	}
	for _, typ := range []string{"soundcloud", "youtube", "spotify"} {
		if !ProviderUsable(app, "listener", typ, "search") {
			t.Fatalf("%s should be usable once configured and linked", typ)
		}
	}
}
