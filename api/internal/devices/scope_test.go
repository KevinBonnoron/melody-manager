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

func TestAStreamReplacedDoesNotTakeTheDeviceWithIt(t *testing.T) {
	svc := New(func() string { return "http://example.test" })

	first, ok := svc.RegisterClient("kev", "browser", "session-1", "a tab", 50)
	if !ok {
		t.Fatal("the first stream did not register")
	}

	second, ok := svc.RegisterClient("kev", "browser", "session-1", "a tab", 50)
	if !ok {
		t.Fatal("the stream that replaced it did not register")
	}
	if second.ID != first.ID {
		t.Fatalf("the replacement is a different device: %q then %q", first.ID, second.ID)
	}

	// The stream being replaced closes after its replacement has registered,
	// which is what a reconnection looks like from here. Reading that as the
	// device going away takes it out of the playback and stops the sound.
	if svc.UnregisterClient("kev", first.ID, first.Epoch()) {
		t.Fatal("closing the replaced stream was taken for the device going away")
	}
	if _, there := svc.GetFor("kev", first.ID); !there {
		t.Fatal("the device went with the stream it had already been replaced on")
	}

	if !svc.UnregisterClient("kev", second.ID, second.Epoch()) {
		t.Fatal("closing the stream that was current did not take the device out")
	}
	if _, there := svc.GetFor("kev", second.ID); there {
		t.Fatal("the device outlived the only stream it had")
	}
}
