package chromecast

import (
	"context"
	"testing"
	"time"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

const fake = "127.0.0.1"

func TestPlayURLLaunchesTheReceiverAndLoadsTheTrack(t *testing.T) {
	receiver := startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := d.PlayURL(ctx, fake, trackFixture())
	if err != nil {
		t.Fatalf("PlayURL: %v", err)
	}

	if receiver.sent("LAUNCH") == nil {
		t.Error("the media receiver was never launched")
	}

	load := receiver.sent("LOAD")
	if load == nil {
		t.Fatal("no LOAD reached the receiver")
	}
	media, ok := load["media"].(map[string]any)
	if !ok {
		t.Fatalf("LOAD carried no media: %+v", load)
	}
	if media["contentId"] != "http://192.0.2.1:8090/api/tracks/abc/stream?token=x" {
		t.Errorf("contentId = %v", media["contentId"])
	}
	if media["contentType"] != "audio/mpeg" {
		t.Errorf("contentType = %v", media["contentType"])
	}
	if media["streamType"] != "BUFFERED" {
		t.Errorf("streamType = %v, want BUFFERED", media["streamType"])
	}
	if load["autoplay"] != true {
		t.Errorf("autoplay = %v, want true", load["autoplay"])
	}
}

func TestTransportAndPositionComeBackFromTheDevice(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	if err := d.PlayURL(ctx, fake, trackFixture()); err != nil {
		t.Fatalf("PlayURL: %v", err)
	}

	if got := d.Transport(ctx, fake); got != "PLAYING" {
		t.Errorf("Transport = %q, want PLAYING", got)
	}

	if err := d.Seek(ctx, fake, 42); err != nil {
		t.Fatalf("Seek: %v", err)
	}
	elapsed, duration := d.Position(ctx, fake)
	if elapsed != 42 || duration != 168 {
		t.Errorf("Position = (%d, %d), want (42, 168)", elapsed, duration)
	}

	if got := d.CurrentURL(ctx, fake); got != trackFixture().URL {
		t.Errorf("CurrentURL = %q", got)
	}
}

// Pause is what tells the two ids apart.
func TestPauseCarriesTheMediaSession(t *testing.T) {
	receiver := startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	if err := d.PlayURL(ctx, fake, trackFixture()); err != nil {
		t.Fatalf("PlayURL: %v", err)
	}
	if err := d.Pause(ctx, fake); err != nil {
		t.Fatalf("Pause: %v", err)
	}

	pause := receiver.sent("PAUSE")
	if pause == nil {
		t.Fatal("no PAUSE reached the receiver")
	}
	if pause["mediaSessionId"] != float64(7) {
		t.Errorf("mediaSessionId = %v, want the one the device gave", pause["mediaSessionId"])
	}
	if got := d.Transport(ctx, fake); got != "PAUSED_PLAYBACK" {
		t.Errorf("Transport = %q, want PAUSED_PLAYBACK", got)
	}
}

// Nothing loaded is not a failure to report against the device, and asking anyway has it answer
// INVALID_MEDIA_SESSION_ID, which says the same later and less well.
func TestCommandsRefuseWhenNothingIsLoaded(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	if err := d.Pause(context.Background(), fake); err == nil {
		t.Fatal("pausing a device holding nothing was accepted")
	}
}

func TestVolumeRoundTrips(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	if got := d.Volume(ctx, fake); got != 40 {
		t.Errorf("Volume = %d, want 40", got)
	}
	if err := d.SetVolume(ctx, fake, 65); err != nil {
		t.Fatalf("SetVolume: %v", err)
	}
	if got := d.Volume(ctx, fake); got != 65 {
		t.Errorf("Volume after setting = %d, want 65", got)
	}
}

// One session per device.
func TestOneSessionPerDevice(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	first, err := d.session(ctx, fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	second, err := d.session(ctx, fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	if first != second {
		t.Error("a second session was opened to the same device")
	}
}

// A device that went away and came back gets a new session rather than commands posted into a
// closed socket.
func TestASessionThatDiedIsReopened(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	first, err := d.session(ctx, fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	first.Close()

	second, err := d.session(ctx, fake)
	if err != nil {
		t.Fatalf("reopening: %v", err)
	}
	if first == second {
		t.Error("the dead session was handed back")
	}
}

func trackFixture() players.Track {
	return players.Track{
		URL:      "http://192.0.2.1:8090/api/tracks/abc/stream?token=x",
		MimeType: "audio/mpeg",
		Title:    "Starry Night",
		Artist:   "Couple N",
		Album:    "Starry Night",
		Duration: 168,
	}
}

func closeAll(d *Devices) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, c := range d.conns {
		c.Close()
	}
}

// A device drops a sender that stops answering its heartbeat.
func TestADevicePingIsAnswered(t *testing.T) {
	receiver := startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	c, err := d.session(context.Background(), fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}

	receiver.ping()
	waitFor(t, func() bool { return receiver.sent("PONG") != nil })
	_ = c
}

// Status arrives unprompted whenever somebody else touches the device, from its own app or a
// phone in the same room.
func TestUnpromptedStatusIsKept(t *testing.T) {
	receiver := startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	c, err := d.session(ctx, fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}

	receiver.announceVolume(0.9)
	waitFor(t, func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		return c.lastVolume == 0.9
	})
}

func waitFor(t *testing.T, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if done() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("timed out waiting")
}

// A device answers a request it will not carry out with the same requestId as one it will.
func TestARefusalIsAnError(t *testing.T) {
	for _, payload := range []string{
		`{"type":"INVALID_REQUEST","requestId":1,"reason":"INVALID_MEDIA_SESSION_ID"}`,
		`{"type":"LOAD_FAILED","requestId":2}`,
		`{"type":"INVALID_PLAYER_STATE","requestId":3}`,
	} {
		if err := castError([]byte(payload)); err == nil {
			t.Errorf("%s was taken for success", payload)
		}
	}

	for _, payload := range []string{
		`{"type":"MEDIA_STATUS","requestId":4,"status":[]}`,
		`{"type":"RECEIVER_STATUS","requestId":5}`,
		`not json at all`,
	} {
		if err := castError([]byte(payload)); err != nil {
			t.Errorf("%s was taken for a refusal: %v", payload, err)
		}
	}
}

// A socket can stay writable long after the device behind it stopped listening, so a write that
// succeeds says nothing.
func TestASilentPeerIsDropped(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	c, err := d.session(context.Background(), fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}

	c.mu.Lock()
	c.awaitingPong = true
	c.mu.Unlock()

	c.beatOnce()
	if alive(c) {
		t.Error("a session whose last heartbeat went unanswered is still held")
	}
}

// A session handed back by the pool has to be one commands can be sent on.
func TestADeadWinnerIsNotHandedBack(t *testing.T) {
	startReceiver(t)
	d := &Devices{conns: map[string]*conn{}}
	t.Cleanup(func() { closeAll(d) })

	ctx := context.Background()
	dead, err := dial(ctx, fake)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	dead.Close()
	d.conns[fake] = dead

	got, err := d.session(ctx, fake)
	if err != nil {
		t.Fatalf("session: %v", err)
	}
	if got == dead || !alive(got) {
		t.Error("the pool handed back a closed session")
	}
}
