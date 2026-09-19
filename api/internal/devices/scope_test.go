package devices

import "testing"

func TestABrowserBelongsToWhoeverRegisteredIt(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	svc.devices["tab"] = Device{ID: "tab", Type: "browser", owner: "kev"}

	if _, ok := svc.GetFor("kev", "tab"); !ok {
		t.Fatal("its own owner could not reach it")
	}
	if _, ok := svc.GetFor("someone-else", "tab"); ok {
		t.Fatal("knowing the id was enough to drive someone else's browser")
	}
}

func TestASpeakerIsSharedByEveryone(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	svc.devices["lounge"] = Device{ID: "lounge", Type: "sonos", IPAddress: "10.0.0.2"}

	for _, owner := range []string{"kev", "someone-else"} {
		if _, ok := svc.GetFor(owner, "lounge"); !ok {
			t.Fatalf("%q could not reach a shared speaker", owner)
		}
	}
}

func TestADeviceThatIsNotThereIsNotFound(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	if _, ok := svc.GetFor("kev", "nothing"); ok {
		t.Fatal("found a device that does not exist")
	}
}
