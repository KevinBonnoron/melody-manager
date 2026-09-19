package player

import (
	"context"
	"errors"
	"fmt"
	"reflect"
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
	start    time.Time
}

type output struct {
	mu       sync.Mutex
	missing  map[string]bool
	calls    []call
	runs     []int64
	errs     map[string]error
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
	return o.errs[c.device]
}

func (o *output) Knows(_, device string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return !o.missing[device]
}

func (o *output) Play(_ context.Context, _, device, trackID string, position float64, cycle int64, start time.Time) error {
	o.run(cycle)
	return o.record(call{kind: "play", device: device, trackID: trackID, position: position, start: start})
}

func (o *output) Resume(_ context.Context, _, device, trackID string, position float64, cycle int64, start time.Time) error {
	o.run(cycle)
	return o.record(call{kind: "resume", device: device, trackID: trackID, position: position, start: start})
}

func (o *output) run(cycle int64) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.runs = append(o.runs, cycle)
}

func (o *output) cycles() []int64 {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]int64(nil), o.runs...)
}

func (o *output) Pause(_ context.Context, _, device string) error {
	return o.record(call{kind: "pause", device: device})
}

func (o *output) Seek(_ context.Context, _, device string, position float64) error {
	return o.record(call{kind: "seek", device: device, position: position})
}

func (o *output) seen() []call {
	o.mu.Lock()
	defer o.mu.Unlock()
	return append([]call(nil), o.calls...)
}

func (o *output) to(device string) []call {
	out := []call{}
	for _, c := range o.seen() {
		if c.device == device {
			out = append(out, c)
		}
	}
	return out
}

type supply struct {
	tracks []string
	asked  int
	want   int
	err    error
}

func (s *supply) More(_ context.Context, _ string, _ []string, want int) ([]string, error) {
	s.asked++
	s.want = want
	return s.tracks, s.err
}

func service(state State) (*Service, *records, *output, *supply) {
	store := &records{state: state}
	out := &output{errs: map[string]error{}, missing: map[string]bool{}}
	more := &supply{}
	svc := NewService(store, out, more)
	svc.now = func() time.Time { return epoch }
	svc.shuffle = reverse
	return svc, store, out, more
}

func TestStartTellsEveryDeviceTheSoundComesOutOf(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos", "phone"}})
	if _, err := svc.Start(context.Background(), "u1", []string{"a", "b"}); err != nil {
		t.Fatal(err)
	}

	got := out.seen()
	if len(got) != 2 {
		t.Fatalf("calls = %+v", got)
	}
	for _, c := range got {
		if c.kind != "play" || c.trackID != "a" {
			t.Fatalf("call = %+v", c)
		}
	}
	if store.state.Track != "a" || !store.state.Playing {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestADeviceThatHasGoneLeavesTheSetAndTheRestCarryOn(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos", "phone"}, List: []string{"a"}, Track: "a"})
	out.errs["sonos"] = ErrNoDevice

	state, err := svc.Resume(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(state.Devices, []string{"phone"}) {
		t.Fatalf("devices = %v", state.Devices)
	}
	if !state.Playing {
		t.Fatal("playback stopped when one device went")
	}
	if !reflect.DeepEqual(store.state.Devices, []string{"phone"}) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestWhenEveryDeviceHasGoneThereIsNowhereToPlay(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a"})
	out.errs["sonos"] = ErrNoDevice

	state, err := svc.Resume(context.Background(), "u1")
	if !errors.Is(err, ErrNowhereToPlay) {
		t.Fatalf("error = %v", err)
	}
	if state.Playing || len(state.Devices) != 0 {
		t.Fatalf("state = %+v", state)
	}
	if store.state.Playing {
		t.Fatalf("stored as playing: %+v", store.state)
	}
}

func TestADeviceRefusingDoesNotStopTheOthers(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos", "phone"}, List: []string{"a"}, Track: "a"})
	out.errs["sonos"] = errors.New("the speaker is busy")

	state, err := svc.Resume(context.Background(), "u1")
	if err != nil {
		t.Fatal(err)
	}
	if !state.Playing {
		t.Fatal("stopped because one device refused")
	}
	if !reflect.DeepEqual(state.Devices, []string{"sonos", "phone"}) {
		t.Fatalf("devices = %v", state.Devices)
	}
}

func TestResumeTellsEachDeviceWhatItIsSupposedToBePlaying(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Position: 62})
	if _, err := svc.Resume(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != 1 || got[0] != (call{kind: "resume", device: "sonos", trackID: "a", position: 62}) {
		t.Fatalf("calls = %+v", got)
	}
}

func TestPauseWritesDownWhereItGotTo(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Position: 10, PositionAt: epoch.Add(-30 * time.Second), Playing: true})
	if _, err := svc.Pause(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != 1 || got[0].kind != "pause" {
		t.Fatalf("calls = %+v", got)
	}
	if store.state.Position != 40 || store.state.Playing {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestMovingToOtherDevicesStopsTheOldAndStartsTheNew(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"browser"}, List: []string{"a"}, Track: "a", Position: 10, PositionAt: epoch.Add(-20 * time.Second), Playing: true})
	if _, err := svc.On(context.Background(), "u1", []string{"sonos"}); err != nil {
		t.Fatal(err)
	}

	if got := out.to("browser"); len(got) != 1 || got[0].kind != "pause" {
		t.Fatalf("the old device was not stopped: %+v", got)
	}
	if got := out.to("sonos"); len(got) != 1 || got[0] != (call{kind: "play", device: "sonos", trackID: "a", position: 30}) {
		t.Fatalf("the new device: %+v", got)
	}
	if !reflect.DeepEqual(store.state.Devices, []string{"sonos"}) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestJoiningStartsTheNewDeviceAndLeavesTheOtherAlone(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Position: 10, PositionAt: epoch.Add(-5 * time.Second), Playing: true})
	if _, err := svc.Join(context.Background(), "u1", "phone"); err != nil {
		t.Fatal(err)
	}

	for _, device := range []string{"sonos", "phone"} {
		got := out.to(device)
		if len(got) != 1 || got[0].kind != "play" || got[0].position != 15 {
			t.Fatalf("%s: %+v", device, got)
		}
	}
	if !reflect.DeepEqual(store.state.Devices, []string{"sonos", "phone"}) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestLeavingStopsOnlyThatDevice(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos", "phone"}, List: []string{"a"}, Track: "a", Playing: true})
	if _, err := svc.Leave(context.Background(), "u1", "sonos"); err != nil {
		t.Fatal(err)
	}
	if got := out.to("sonos"); len(got) != 1 || got[0].kind != "pause" {
		t.Fatalf("sonos: %+v", got)
	}
	if got := out.to("phone"); len(got) != 0 {
		t.Fatalf("phone was disturbed: %+v", got)
	}
	if !store.state.Playing || !reflect.DeepEqual(store.state.Devices, []string{"phone"}) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestTheListIsToppedUpAsThePlayheadRunsOutOfIt(t *testing.T) {
	svc, store, _, more := service(State{Devices: []string{"sonos"}})
	more.tracks = []string{"x", "y"}

	if _, err := svc.Start(context.Background(), "u1", []string{"a", "b"}); err != nil {
		t.Fatal(err)
	}
	if more.asked != 1 {
		t.Fatalf("asked %d times", more.asked)
	}
	if more.want != keepAhead-1 {
		t.Fatalf("asked for %d", more.want)
	}
	if !reflect.DeepEqual(store.state.List, []string{"a", "b", "x", "y"}) {
		t.Fatalf("list = %v", store.state.List)
	}
}

func TestTheListIsNeverToppedUpBeyondTheBound(t *testing.T) {
	svc, store, _, more := service(State{Devices: []string{"sonos"}})
	for i := range 40 {
		more.tracks = append(more.tracks, fmt.Sprintf("x%d", i))
	}

	if _, err := svc.Start(context.Background(), "u1", []string{"a"}); err != nil {
		t.Fatal(err)
	}
	if got := store.state.Ahead(); got != keepAhead {
		t.Fatalf("ahead = %d", got)
	}
}

func TestAListThatRepeatsIsNeverToppedUp(t *testing.T) {
	svc, _, _, more := service(State{Devices: []string{"sonos"}, List: []string{"a", "b"}, Track: "a", Repeat: RepeatAll})
	more.tracks = []string{"x"}
	if _, err := svc.Next(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if more.asked != 0 {
		t.Fatalf("asked %d times", more.asked)
	}
}

func TestAListThatCannotBeExtendedStillPlays(t *testing.T) {
	svc, store, _, more := service(State{Devices: []string{"sonos"}})
	more.err = errors.New("the library is away")

	state, err := svc.Start(context.Background(), "u1", []string{"a"})
	if err != nil {
		t.Fatal(err)
	}
	if state.Track != "a" || !state.Playing {
		t.Fatalf("state = %+v", state)
	}
	if !reflect.DeepEqual(store.state.List, []string{"a"}) {
		t.Fatalf("list = %v", store.state.List)
	}
}

func TestTheRecordIsWrittenBeforeAnyDeviceIsTold(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}})
	store.onSave = func(State) {
		if got := out.seen(); len(got) != 0 {
			t.Errorf("a device was told first: %+v", got)
		}
	}
	if _, err := svc.Start(context.Background(), "u1", []string{"a"}); err != nil {
		t.Fatal(err)
	}
}

func TestARecordThatCannotBeWrittenNeverReachesADevice(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}})
	store.saveErr = errors.New("database is away")
	if _, err := svc.Start(context.Background(), "u1", []string{"a"}); err == nil {
		t.Fatal("expected an error")
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("calls = %+v", got)
	}
}

func TestARecordThatCannotBeReadStopsTheOrder(t *testing.T) {
	svc, store, out, _ := service(State{})
	store.loadErr = errors.New("database is away")
	if _, err := svc.Start(context.Background(), "u1", []string{"a"}); err == nil {
		t.Fatal("expected an error")
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("calls = %+v", got)
	}
}

func TestChangingTheModeDoesNotDisturbTheDevices(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a", "b"}, Track: "a", Playing: true})
	if _, err := svc.SetShuffle(context.Background(), "u1", true); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetRepeat(context.Background(), "u1", RepeatAll); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AddNext(context.Background(), "u1", "z"); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("calls = %+v", got)
	}
	if !store.state.Shuffle || store.state.Repeat != RepeatAll {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestSkipMovesThePlayheadAndTellsTheDevices(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a", "b", "c"}, Track: "a"})
	if _, err := svc.Skip(context.Background(), "u1", "c"); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != 1 || got[0] != (call{kind: "play", device: "sonos", trackID: "c"}) {
		t.Fatalf("calls = %+v", got)
	}
}

func TestAPositionReportedForTheTrackBeingPlayedMovesThePlayhead(t *testing.T) {
	svc, store, _, _ := service(State{List: []string{"a"}, Track: "a", Position: 5, Playing: true})
	if err := svc.SavePosition("u1", "a", 61); err != nil {
		t.Fatal(err)
	}
	if store.state.Position != 61 || !store.state.PositionAt.Equal(epoch) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestAPositionReportedForAnotherTrackIsIgnored(t *testing.T) {
	svc, store, _, _ := service(State{List: []string{"a"}, Track: "a", Position: 5})
	if err := svc.SavePosition("u1", "b", 61); err != nil {
		t.Fatal(err)
	}
	if store.state.Position != 5 || store.saves != 0 {
		t.Fatalf("stored = %+v after %d saves", store.state, store.saves)
	}
}

func TestOrdersOfOneUserDoNotOverlap(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a", "b", "c", "d"}, Track: "a"})
	out.delay = 2 * time.Millisecond

	var wg sync.WaitGroup
	for i := range 3 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.Start(context.Background(), "u1", []string{fmt.Sprintf("t%d", i)}); err != nil {
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
	svc, store, out, _ := service(State{List: []string{"a"}, Track: "a"})
	if _, err := svc.State("u1"); err != nil {
		t.Fatal(err)
	}
	if store.saves != 0 {
		t.Fatalf("saves = %d", store.saves)
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("calls = %+v", got)
	}
}

func TestPlayingWithNoDeviceChosenSaysSoRatherThanPretending(t *testing.T) {
	svc, store, out, _ := service(State{})
	state, err := svc.Start(context.Background(), "u1", []string{"a"})
	if !errors.Is(err, ErrNowhereToPlay) {
		t.Fatalf("error = %v", err)
	}
	if state.Playing {
		t.Fatalf("state = %+v", state)
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("calls = %+v", got)
	}
	if store.state.Track != "a" {
		t.Fatalf("the choice was not kept: %+v", store.state)
	}
}

func TestChangingTheModeWithNoDeviceChosenIsFine(t *testing.T) {
	svc, _, _, _ := service(State{List: []string{"a"}, Track: "a"})
	if _, err := svc.SetShuffle(context.Background(), "u1", true); err != nil {
		t.Fatal(err)
	}
}

func TestLeavingTheLastDeviceIsWrittenDownAsStopped(t *testing.T) {
	svc, store, _, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Playing: true})
	state, err := svc.Leave(context.Background(), "u1", "sonos")
	if err != nil {
		t.Fatal(err)
	}
	if state.Playing {
		t.Fatalf("state = %+v", state)
	}
	if store.state.Playing {
		t.Fatalf("the answer said stopped but the record says playing: %+v", store.state)
	}
}

func TestAddingATrackWithNothingPlayingIsWrittenDown(t *testing.T) {
	svc, store, _, _ := service(State{})
	state, err := svc.AddNext(context.Background(), "u1", "a")
	if err != nil {
		t.Fatal(err)
	}
	if state.Track != "a" {
		t.Fatalf("state = %+v", state)
	}
	if store.state.Track != "a" || len(store.state.List) != 1 {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestReadingTheRecordTakesOutDevicesThatHaveGone(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos", "phone"}, List: []string{"a"}, Track: "a", Playing: true})
	out.missing["sonos"] = true

	state, err := svc.State("u1")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(state.Devices, []string{"phone"}) {
		t.Fatalf("devices = %v", state.Devices)
	}
	if !state.Playing {
		t.Fatal("playback stopped although a device is left")
	}
	if !reflect.DeepEqual(store.state.Devices, []string{"phone"}) {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestARecordPlayingNowhereIsReadAsStopped(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Playing: true, Position: 40})
	out.missing["sonos"] = true

	state, err := svc.State("u1")
	if err != nil {
		t.Fatal(err)
	}
	if state.Playing || len(state.Devices) != 0 {
		t.Fatalf("state = %+v", state)
	}
	if store.state.Playing {
		t.Fatalf("stored as playing: %+v", store.state)
	}
	if store.state.Position != 40 {
		t.Fatalf("the position was lost: %+v", store.state)
	}
}

func TestReadingARecordWhoseDevicesAreAllThereWritesNothing(t *testing.T) {
	svc, store, _, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Playing: true})
	if _, err := svc.State("u1"); err != nil {
		t.Fatal(err)
	}
	if store.saves != 0 {
		t.Fatalf("saves = %d", store.saves)
	}
}

func TestOneDeviceStartsAtOnce(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos"}})
	if _, err := svc.Start(context.Background(), "u1", []string{"a"}); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != 1 || !got[0].start.IsZero() {
		t.Fatalf("calls = %+v", got)
	}
}

func TestSeveralDevicesAreGivenTheSameMomentToStartOn(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos", "phone"}})
	if _, err := svc.Start(context.Background(), "u1", []string{"a"}); err != nil {
		t.Fatal(err)
	}

	got := out.seen()
	if len(got) != 2 {
		t.Fatalf("calls = %+v", got)
	}
	if got[0].start.IsZero() || !got[0].start.Equal(got[1].start) {
		t.Fatalf("devices were told different moments: %v and %v", got[0].start, got[1].start)
	}
	if want := epoch.Add(lead); !got[0].start.Equal(want) {
		t.Fatalf("start = %v, wanted %v", got[0].start, want)
	}
}

func TestResumingOnSeveralDevicesAlsoAgreesOnTheMoment(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos", "phone"}, List: []string{"a"}, Track: "a", Position: 30})
	if _, err := svc.Resume(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}

	got := out.seen()
	if len(got) != 2 || got[0].start.IsZero() || !got[0].start.Equal(got[1].start) {
		t.Fatalf("calls = %+v", got)
	}
}

func TestPlayingNowhereOnPurposeIsStoppingRatherThanFailing(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Playing: true, Position: 20, PositionAt: epoch.Add(-10 * time.Second)})

	state, err := svc.On(context.Background(), "u1", nil)
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if state.Playing || len(state.Devices) != 0 {
		t.Fatalf("state = %+v", state)
	}
	if state.Position != 30 {
		t.Fatalf("the playhead was lost: %v", state.Position)
	}
	if store.state.Playing {
		t.Fatalf("stored as playing: %+v", store.state)
	}
	if got := out.to("sonos"); len(got) != 1 || got[0].kind != "pause" {
		t.Fatalf("the device it left: %+v", got)
	}
}

func TestAPositionReportedFromBeforeTheStartIsNotKept(t *testing.T) {
	svc, store, _, _ := service(State{List: []string{"a"}, Track: "a", Position: 30, Playing: true})
	if err := svc.SavePosition("u1", "a", -12); err != nil {
		t.Fatal(err)
	}
	if store.state.Position != 0 {
		t.Fatalf("stored = %v", store.state.Position)
	}
}

func TestAnEndReportedTwiceMovesOnOnceAndDisturbsNobody(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos", "phone"}, List: []string{"a", "b", "c"}, Track: "a", Playing: true})

	if _, err := svc.Ended(context.Background(), "u1", "a", 0); err != nil {
		t.Fatal(err)
	}
	before := len(out.seen())

	if _, err := svc.Ended(context.Background(), "u1", "a", 0); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != before {
		t.Fatalf("the second report reached a device: %+v", got[before:])
	}
}

func TestAnEndReportedTwiceWhileRepeatingOneRestartsItOnce(t *testing.T) {
	started := epoch.Add(-3 * time.Minute)
	svc, store, out, _ := service(State{
		Devices:    []string{"sonos", "phone"},
		List:       []string{"a", "b"},
		Track:      "a",
		Position:   0,
		PositionAt: started,
		Playing:    true,
		Repeat:     RepeatOne,
	})
	ticking := epoch
	svc.now = func() time.Time {
		ticking = ticking.Add(50 * time.Millisecond)
		return ticking
	}

	if _, err := svc.Ended(context.Background(), "u1", "a", started.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	before := len(out.seen())
	if store.state.Cycle() == started.UnixMilli() {
		t.Fatal("the first report did not restart the track")
	}

	if _, err := svc.Ended(context.Background(), "u1", "a", started.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != before {
		t.Fatalf("the second report reached a device: %+v", got[before:])
	}
}

func TestAnEndReportedUnderTheCurrentPlayheadIsActedOnHoweverShortTheTrack(t *testing.T) {
	svc, store, _, _ := service(State{
		Devices:    []string{"sonos"},
		List:       []string{"a", "b"},
		Track:      "a",
		PositionAt: epoch,
		Playing:    true,
	})

	if _, err := svc.Ended(context.Background(), "u1", "a", epoch.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	if store.state.Track != "b" {
		t.Fatalf("stored = %+v", store.state)
	}
}

func TestSkippingToATrackThatIsNotThereDisturbsNobody(t *testing.T) {
	svc, _, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a", "b"}, Track: "a", Playing: true})
	if _, err := svc.Skip(context.Background(), "u1", "nowhere"); err != nil {
		t.Fatal(err)
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("calls = %+v", got)
	}
}

func TestRemovingTheLastTrackStopsTheDevicePlayingIt(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a"}, Track: "a", Playing: true})
	state, err := svc.Remove(context.Background(), "u1", "a")
	if err != nil {
		t.Fatal(err)
	}
	if state.Playing {
		t.Fatalf("state = %+v", state)
	}
	if got := out.seen(); len(got) != 1 || got[0].kind != "pause" {
		t.Fatalf("the device was not stopped: %+v", got)
	}
	if store.saves == 0 {
		t.Fatal("nothing was written down")
	}
}

func TestRemovingATrackNobodyIsPlayingIsStillWrittenDown(t *testing.T) {
	svc, store, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a", "b", "c"}, Track: "a", Playing: true, Repeat: RepeatAll})

	state, err := svc.Remove(context.Background(), "u1", "c")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(state.List, []string{"a", "b"}) {
		t.Fatalf("answered with %v", state.List)
	}
	if !reflect.DeepEqual(store.state.List, []string{"a", "b"}) {
		t.Fatalf("stored %v", store.state.List)
	}
	if got := out.seen(); len(got) != 0 {
		t.Fatalf("a device was disturbed: %+v", got)
	}
}

func TestADeviceIsToldWhichRunOfTheTrackItIsToPlay(t *testing.T) {
	started := epoch.Add(-3 * time.Minute)
	svc, _, out, _ := service(State{Devices: []string{"sonos"}, List: []string{"a", "b"}, Track: "a", PositionAt: started})
	if _, err := svc.Resume(context.Background(), "u1"); err != nil {
		t.Fatal(err)
	}
	if got := out.cycles(); len(got) != 1 || got[0] != epoch.UnixMilli() {
		t.Fatalf("cycles = %v", got)
	}
}
