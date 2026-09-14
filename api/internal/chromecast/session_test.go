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

	// The app has to be launched before a device will take a LOAD, and the LOAD
	// has to be addressed to the app rather than to the device.
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
	// A device told the stream is live refuses to seek in it.
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

// Pause is what tells the two ids apart: it is addressed to the app, and it
// carries the media session the device handed back when it took the LOAD.
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

// Nothing loaded is not a failure to report against the device, and asking
// anyway has it answer INVALID_MEDIA_SESSION_ID, which says the same later and
// less well.
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
	// The device speaks in a fraction of full scale and the rest of the server in
	// percent, so the conversion is worth seeing both ways.
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

// One session per device: two would have each undo the other, and a device
// drops a sender that opens a second connection without closing the first.
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

// A device that went away and came back gets a new session rather than commands
// posted into a closed socket.
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

// A device drops a sender that stops answering its heartbeat. Nothing in a test
// runs long enough for the ticker to fire, so the half that matters here is the
// other one: a PING arriving from the device has to come back as a PONG, or a
// real session dies about ten seconds in and every command after that is posted
// into a socket nobody is reading.
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

// Status arrives unprompted whenever somebody else touches the device, from its
// own app or a phone in the same room. Dropping those would have this server
// reporting a volume nobody is at.
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
