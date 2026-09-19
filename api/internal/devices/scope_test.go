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

func TestTheSameSessionKeepsTheSameDeviceAcrossRestarts(t *testing.T) {
	before := New(func() string { return "http://example.test" })
	device, ok := before.RegisterClient("kev", "browser", "tab-1", "A tab", 80)
	if !ok {
		t.Fatal("the device was refused")
	}

	after := New(func() string { return "http://example.test" })
	again, ok := after.RegisterClient("kev", "browser", "tab-1", "A tab", 80)
	if !ok {
		t.Fatal("the device was refused on the way back")
	}
	if again.ID != device.ID {
		t.Fatalf("the device came back as a stranger: %q then %q", device.ID, again.ID)
	}
}

func TestTwoSessionsAreTwoDevices(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	one, _ := svc.RegisterClient("kev", "browser", "tab-1", "A tab", 80)
	two, _ := svc.RegisterClient("kev", "browser", "tab-2", "Another tab", 80)
	if one.ID == two.ID {
		t.Fatal("two tabs came back as one device")
	}
}

func TestTwoAccountsOnOneSessionAreTwoDevices(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	mine, _ := svc.RegisterClient("kev", "browser", "tab-1", "A tab", 80)
	theirs, _ := svc.RegisterClient("someone-else", "browser", "tab-1", "A tab", 80)
	if mine.ID == theirs.ID {
		t.Fatal("two accounts shared a device")
	}
}

func TestAStreamAlreadyReplacedDoesNotTakeTheDeviceWithIt(t *testing.T) {
	svc := New(func() string { return "http://example.test" })
	first, _ := svc.RegisterClient("kev", "browser", "tab-1", "A tab", 80)
	second, _ := svc.RegisterClient("kev", "browser", "tab-1", "A tab", 80)

	if svc.UnregisterClient("kev", first.ID, first.Epoch()) {
		t.Fatal("the older stream took the device that replaced it")
	}
	if _, ok := svc.GetFor("kev", second.ID); !ok {
		t.Fatal("the device is gone")
	}
	if !svc.UnregisterClient("kev", second.ID, second.Epoch()) {
		t.Fatal("the current stream could not take its own device away")
	}
}
