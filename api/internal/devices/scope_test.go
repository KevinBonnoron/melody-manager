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

func TestADeviceStaysWhileAnyOfItsStreamsIsOpen(t *testing.T) {
	svc := New(func() string { return "http://example.test" })

	first, ok := svc.RegisterClient("kev", "browser", "session-1", "a tab", 50)
	if !ok {
		t.Fatal("the first stream did not register")
	}
	second, ok := svc.RegisterClient("kev", "browser", "session-1", "a tab", 50)
	if !ok {
		t.Fatal("the second stream did not register")
	}
	if second.ID != first.ID {
		t.Fatalf("two streams of one session made two devices: %q and %q", first.ID, second.ID)
	}

	// Either of them can be the one that ends, and a browser opens two often
	// enough that both orders happen: one replacing another, or two started
	// together and one given up. Whichever ends, the device is still being
	// listened to on the one that stayed.
	if svc.ReleaseClient("kev", first.ID) {
		t.Fatal("giving up one stream was taken for the last one")
	}
	if svc.ForgetClient("kev", first.ID) {
		t.Fatal("the device was taken out while a stream was still open")
	}
	if _, there := svc.GetFor("kev", first.ID); !there {
		t.Fatal("the device went with a stream that was not its last")
	}

	if !svc.ReleaseClient("kev", first.ID) {
		t.Fatal("giving up the last stream was not taken for the last one")
	}
	if !svc.ForgetClient("kev", first.ID) {
		t.Fatal("the device was kept with no stream left")
	}
	if _, there := svc.GetFor("kev", first.ID); there {
		t.Fatal("the device outlived every stream it had")
	}
}

func TestADeviceThatCameBackIsNotForgotten(t *testing.T) {
	svc := New(func() string { return "http://example.test" })

	device, ok := svc.RegisterClient("kev", "browser", "session-1", "a tab", 50)
	if !ok {
		t.Fatal("the stream did not register")
	}
	if !svc.ReleaseClient("kev", device.ID) {
		t.Fatal("giving up the only stream was not taken for the last one")
	}

	// It is given a moment to come back before the playback is told it has
	// gone, and it used it.
	if _, ok := svc.RegisterClient("kev", "browser", "session-1", "a tab", 50); !ok {
		t.Fatal("coming back did not register")
	}
	if svc.ForgetClient("kev", device.ID) {
		t.Fatal("a device that had come back was taken out anyway")
	}
	if _, there := svc.GetFor("kev", device.ID); !there {
		t.Fatal("the device that came back is gone")
	}
}
