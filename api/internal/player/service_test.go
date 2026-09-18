package player

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

type records struct {
	mu      sync.Mutex
	state   State
	saves   int
	loadErr error
	saveErr error
	onSave  func(State)
}

func (r *records) Load(string) (State, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.state, r.loadErr
}

func (r *records) Save(_ string, state State) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.saveErr != nil {
		return r.saveErr
	}
	if r.onSave != nil {
		r.onSave(state)
	}
	r.state = state
	r.saves++
	return nil
}

type call struct {
	kind     string
	device   string
	trackID  string
	position float64
}

type output struct {
	mu       sync.Mutex
	calls    []call
	err      error
	delay    time.Duration
	inFlight int
	atOnce   int
}

func (o *output) record(c call) error {
	o.mu.Lock()
	o.inFlight++
	if o.inFlight > o.atOnce {
		o.atOnce = o.inFlight
	}
	o.mu.Unlock()

	if o.delay > 0 {
		time.Sleep(o.delay)
	}

	o.mu.Lock()
	defer o.mu.Unlock()
	o.inFlight--
	o.calls = append(o.calls, c)
	return o.err
}

func (o *output) Play(_ context.Context, _, device, trackID string, position float64) error {
	return o.record(call{"play", device, trackID, position})
}

func (o *output) Resume(_ context.Context, _, device, trackID string, position float64) error {
	return o.record(call{"resume", device, trackID, position})
}

func (o *output) Pause(_ context.Context, _, device string) error {
	return o.record(call{kind: "pause", device: device})
}

func (o *output) Seek(_ context.Context, _, device string, position float64) error {
	return o.record(call{kind: "seek", device: device, position: position})
}

func (o *output) only(t *testing.T) call {
	t.Helper()
	o.mu.Lock()
	defer o.mu.Unlock()
	if len(o.calls) != 1 {
		t.Fatalf("calls = %+v", o.calls)
	}
	return o.calls[0]
}

func service(state State) (*Service, *records, *output) {
	store := &records{state: state}
	out := &output{}
	svc := NewService(store, out)
	svc.now = func() time.Time { return epoch }
	svc.shuffle = reverse
	return svc, store, out
}

func TestPlayDrivesTheDeviceAndWritesTheRecord(t *testing.T) {
	svc, store, out := service(State{Device: "sonos-1"})
	state, err := svc.Play(context.Background(), "u1", "a", []string{"a", "b"})
	if err != nil {
		t.Fatal(err)
	}
	if got := out.only(t); got != (call{"play", "sonos-1", "a", 0}) {
		t.Fatalf("call = %+v", got)
	}
	if store.state.Track != "a" || !store.state.Playing {
		t.Fatalf("stored = %+v", store.state)
	}
	if state.Current() != "a" {
		t.Fatalf("current = %q", state.Current())
	}
}

func TestResumeTellsTheDeviceWhatItIsSupposedToBePlaying(t *testing.T) {
	svc, _, out := service(State{Queue: []string{"a"}, Track: "a", Position: 62, Device: "sonos-1"})
	if _, err := svc.Resume(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if got := out.only(t); got != (call{"resume", "sonos-1", "a", 62}) {
		t.Fatalf("call = %+v", got)
	}
}

func TestPauseWritesDownWhereItGotTo(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a"}, Track: "a", Position: 10, PositionAt: epoch.Add(-30 * time.Second), Playing: true})
	if _, err := svc.Pause(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if got := out.only(t); got.kind != "pause" {
		t.Fatalf("call = %+v", got)
	}
	if store.state.Position != 40 || store.state.Playing {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestADeviceThatRefusesLeavesTheRecordStopped(t *testing.T) {
	svc, store, _ := service(State{Queue: []string{"a", "b"}, Track: "a"})
	failing := errors.New("the speaker said no")
	svc.out.(*output).err = failing

	state, err := svc.Play(context.Background(), "u1", "b", nil)
	if !errors.Is(err, failing) {
		t.Fatalf("error = %v", err)
	}
	if state.Playing {
		t.Fatalf("state = %+v", state)
	}
	if store.state.Playing {
		t.Fatalf("stored as playing: %+v", store.state)
	}
	if store.state.Track != "b" {
		t.Fatalf("stored track = %q", store.state.Track)
	}
}

func TestSeekMovesThePlayheadOnTheDevice(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a"}, Track: "a", Device: "sonos-1", Playing: true})
	if _, err := svc.Seek(context.Background(), "u1", 90); err != nil {
		t.Fatal(err)
	}
	if got := out.only(t); got != (call{kind: "seek", device: "sonos-1", position: 90}) {
		t.Fatalf("call = %+v", got)
	}
	if store.state.Position != 90 {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestChangingTheQueueDoesNotDisturbTheDevice(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a"}, Track: "a", Playing: true})
	if _, err := svc.Append(context.Background(), "u1", []string{"b"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetShuffle(context.Background(), "u1", true); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetRepeat(context.Background(), "u1", RepeatAll); err != nil {
		t.Fatal(err)
	}
	out.mu.Lock()
	defer out.mu.Unlock()
	if len(out.calls) != 0 {
		t.Fatalf("calls = %+v", out.calls)
	}
	if !store.state.Shuffle || store.state.Repeat != RepeatAll || len(store.state.Queue) != 2 {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestRemovingTheTrackBeingPlayedStartsTheNextOne(t *testing.T) {
	svc, _, out := service(State{Queue: []string{"a", "b"}, Track: "a", Playing: true, Device: "sonos-1"})
	if _, err := svc.Remove(context.Background(), "u1", "a"); err != nil {
		t.Fatal(err)
	}
	if got := out.only(t); got != (call{"play", "sonos-1", "b", 0}) {
		t.Fatalf("call = %+v", got)
	}
}

func TestRemovingATrackThatIsNotPlayingSaysNothingToTheDevice(t *testing.T) {
	svc, _, out := service(State{Queue: []string{"a", "b"}, Track: "a", Playing: true})
	if _, err := svc.Remove(context.Background(), "u1", "b"); err != nil {
		t.Fatal(err)
	}
	out.mu.Lock()
	defer out.mu.Unlock()
	if len(out.calls) != 0 {
		t.Fatalf("calls = %+v", out.calls)
	}
}

func TestMovingToADeviceCarriesThePlayheadOverAndStopsTheOldOne(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a"}, Track: "a", Position: 10, PositionAt: epoch.Add(-20 * time.Second), Playing: true, Device: "browser-1"})
	if _, err := svc.On(context.Background(), "u1", "sonos-1"); err != nil {
		t.Fatal(err)
	}
	out.mu.Lock()
	defer out.mu.Unlock()
	if len(out.calls) != 2 {
		t.Fatalf("calls = %+v", out.calls)
	}
	if out.calls[0] != (call{kind: "pause", device: "browser-1"}) {
		t.Fatalf("the old device was not stopped: %+v", out.calls[0])
	}
	if out.calls[1] != (call{"play", "sonos-1", "a", 30}) {
		t.Fatalf("call = %+v", out.calls[1])
	}
	if store.state.Device != "sonos-1" {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestMovingToADeviceWhilePausedStartsNothing(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a"}, Track: "a", Position: 10})
	if _, err := svc.On(context.Background(), "u1", "sonos-1"); err != nil {
		t.Fatal(err)
	}
	out.mu.Lock()
	calls := len(out.calls)
	out.mu.Unlock()
	if calls != 0 {
		t.Fatalf("calls = %d", calls)
	}
	if store.state.Device != "sonos-1" {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestEndedRepeatsASingleTrackWhereNextWouldNot(t *testing.T) {
	svc, _, out := service(State{Queue: []string{"a", "b"}, Track: "a", Repeat: RepeatOne, Playing: true, Device: "d"})
	if _, err := svc.Ended(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if got := out.only(t); got.trackID != "a" {
		t.Fatalf("call = %+v", got)
	}
}

func TestOrdersOfOneUserDoNotOverlap(t *testing.T) {
	svc, _, out := service(State{Queue: []string{"a", "b", "c", "d"}, Track: "a"})
	out.delay = 2 * time.Millisecond

	var wg sync.WaitGroup
	for _, id := range []string{"b", "c", "d"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.Play(context.Background(), "u1", id, nil); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()

	out.mu.Lock()
	defer out.mu.Unlock()
	if out.atOnce != 1 {
		t.Fatalf("%d orders were in flight at once", out.atOnce)
	}
	if len(out.calls) != 3 {
		t.Fatalf("calls = %+v", out.calls)
	}
}

func TestStateReadsWithoutWriting(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a"}, Track: "a"})
	if _, err := svc.State("u1"); err != nil {
		t.Fatal(err)
	}
	if store.saves != 0 {
		t.Fatalf("saves = %d", store.saves)
	}
	out.mu.Lock()
	defer out.mu.Unlock()
	if len(out.calls) != 0 {
		t.Fatalf("calls = %+v", out.calls)
	}
}

func TestARecordThatCannotBeReadStopsTheOrder(t *testing.T) {
	svc, store, out := service(State{})
	store.loadErr = errors.New("database is away")
	if _, err := svc.Play(context.Background(), "u1", "a", nil); err == nil {
		t.Fatal("expected an error")
	}
	out.mu.Lock()
	defer out.mu.Unlock()
	if len(out.calls) != 0 {
		t.Fatalf("calls = %+v", out.calls)
	}
}

func TestADeviceThatHasGoneIsForgotten(t *testing.T) {
	svc, store, _ := service(State{Queue: []string{"a"}, Track: "a", Device: "sonos-1", Playing: true})
	svc.out.(*output).err = ErrNoDevice

	state, err := svc.Resume(context.Background(), "u1")
	if !errors.Is(err, ErrNoDevice) {
		t.Fatalf("error = %v", err)
	}
	if state.Device != "" {
		t.Fatalf("device = %q", state.Device)
	}
	if store.state.Device != "" || store.state.Playing {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestADeviceThatRefusesForAnyOtherReasonIsKept(t *testing.T) {
	svc, store, _ := service(State{Queue: []string{"a"}, Track: "a", Device: "sonos-1", Playing: true})
	svc.out.(*output).err = errors.New("the speaker is busy")

	if _, err := svc.Resume(context.Background(), "u1"); err == nil {
		t.Fatal("expected an error")
	}
	if store.state.Device != "sonos-1" {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestAPositionReportedForTheTrackBeingPlayedMovesThePlayhead(t *testing.T) {
	svc, store, _ := service(State{Queue: []string{"a"}, Track: "a", Position: 5, Playing: true})
	if err := svc.SavePosition("u1", "a", 61); err != nil {
		t.Fatal(err)
	}
	if store.state.Position != 61 || !store.state.PositionAt.Equal(epoch) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestAPositionReportedForAnotherTrackIsIgnored(t *testing.T) {
	svc, store, _ := service(State{Queue: []string{"a"}, Track: "a", Position: 5})
	if err := svc.SavePosition("u1", "b", 61); err != nil {
		t.Fatal(err)
	}
	if store.state.Position != 5 || store.saves != 0 {
		t.Fatalf("stored = %+v after %d saves", store.state, store.saves)
	}
}

func TestAReportedPositionLeavesTheQueueAndTheModeAlone(t *testing.T) {
	svc, store, _ := service(State{Queue: []string{"a", "b"}, Track: "a", Shuffle: true, Repeat: RepeatAll, Device: "sonos-1", Playing: true})
	if err := svc.SavePosition("u1", "a", 61); err != nil {
		t.Fatal(err)
	}
	if !store.state.Shuffle || store.state.Repeat != RepeatAll || store.state.Device != "sonos-1" || len(store.state.Queue) != 2 {
		t.Fatalf("stored = %+v", store.state)
	}
	if !store.state.Playing {
		t.Fatalf("stopped by a report: %+v", store.state)
	}
}

func TestTheRecordIsWrittenBeforeTheDeviceIsTold(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a", "b"}, Track: "a"})
	store.onSave = func(state State) {
		out.mu.Lock()
		defer out.mu.Unlock()
		if len(out.calls) != 0 {
			t.Errorf("the device was told first: %+v", out.calls)
		}
	}
	if _, err := svc.Play(context.Background(), "u1", "b", nil); err != nil {
		t.Fatal(err)
	}
}

func TestARecordThatCannotBeWrittenNeverReachesTheDevice(t *testing.T) {
	svc, store, out := service(State{Queue: []string{"a", "b"}, Track: "a"})
	store.saveErr = errors.New("database is away")
	if _, err := svc.Play(context.Background(), "u1", "b", nil); err == nil {
		t.Fatal("expected an error")
	}
	out.mu.Lock()
	defer out.mu.Unlock()
	if len(out.calls) != 0 {
		t.Fatalf("calls = %+v", out.calls)
	}
}
