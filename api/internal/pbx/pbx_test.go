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
