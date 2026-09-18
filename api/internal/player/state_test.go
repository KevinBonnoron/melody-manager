package player

import (
	"reflect"
	"testing"
	"time"
)

var epoch = time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)

func reverse(n int, swap func(i, j int)) {
	for i, j := 0, n-1; i < j; i, j = i+1, j-1 {
		swap(i, j)
	}
}

func queued(ids ...string) State {
	return State{Queue: ids}.Sound()
}

func playOrder(s State) []string {
	out := make([]string, 0, len(s.Order))
	for _, at := range s.Order {
		out = append(out, s.Queue[at])
	}
	return out
}

func TestSoundFillsTheOrderFromTheQueue(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}}.Sound()
	if !reflect.DeepEqual(s.Order, []int{0, 1, 2}) {
		t.Fatalf("order = %v", s.Order)
	}
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestSoundDropsOrderEntriesThatNoLongerExist(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Order: []int{5, 1, 1, -3, 0}}.Sound()
	if !reflect.DeepEqual(s.Order, []int{1, 0}) {
		t.Fatalf("order = %v", s.Order)
	}
}

func TestSoundAppendsQueueEntriesTheOrderMissed(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Order: []int{2}}.Sound()
	if !reflect.DeepEqual(s.Order, []int{2, 0, 1}) {
		t.Fatalf("order = %v", s.Order)
	}
}

func TestSoundClampsTheIndex(t *testing.T) {
	if got := (State{Queue: []string{"a", "b"}, Index: 9}).Sound().Index; got != 1 {
		t.Fatalf("index = %d", got)
	}
	if got := (State{Queue: []string{"a", "b"}, Index: -4}).Sound().Index; got != 0 {
		t.Fatalf("index = %d", got)
	}
	if got := (State{Index: 3}).Sound().Index; got != 0 {
		t.Fatalf("index = %d", got)
	}
}

func TestSoundRejectsARepeatModeItDoesNotKnow(t *testing.T) {
	if got := (State{Repeat: Repeat("sideways")}).Sound().Repeat; got != RepeatNone {
		t.Fatalf("repeat = %q", got)
	}
}

func TestSoundKeepsTheTrackWhenTheQueueIsEmpty(t *testing.T) {
	s := State{Track: "a"}.Sound()
	if s.Track != "a" {
		t.Fatalf("track = %q", s.Track)
	}
}

func TestPositionAtTimeMovesOnWhilePlaying(t *testing.T) {
	s := State{Position: 10, PositionAt: epoch, Playing: true}
	if got := s.PositionAtTime(epoch.Add(4 * time.Second)); got != 14 {
		t.Fatalf("position = %v", got)
	}
}

func TestPositionAtTimeStandsStillWhilePaused(t *testing.T) {
	s := State{Position: 10, PositionAt: epoch}
	if got := s.PositionAtTime(epoch.Add(4 * time.Second)); got != 10 {
		t.Fatalf("position = %v", got)
	}
}

func TestPositionAtTimeIgnoresAClockThatWentBackwards(t *testing.T) {
	s := State{Position: 10, PositionAt: epoch, Playing: true}
	if got := s.PositionAtTime(epoch.Add(-4 * time.Second)); got != 10 {
		t.Fatalf("position = %v", got)
	}
}

func TestPositionAtTimeWithoutATimestampReadsWhatIsWrittenDown(t *testing.T) {
	s := State{Position: 10, Playing: true}
	if got := s.PositionAtTime(epoch); got != 10 {
		t.Fatalf("position = %v", got)
	}
}

func TestPlayJumpsToATrackAlreadyQueued(t *testing.T) {
	s := queued("a", "b", "c").Play("c", epoch)
	if s.Index != 2 || s.Current() != "c" || !s.Playing {
		t.Fatalf("state = %+v", s)
	}
	if len(s.Queue) != 3 {
		t.Fatalf("queue = %v", s.Queue)
	}
}

func TestPlayOfATrackOutsideTheQueueStartsAQueueOfItsOwn(t *testing.T) {
	s := queued("a", "b").Play("z", epoch)
	if !reflect.DeepEqual(s.Queue, []string{"z"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
	if s.Current() != "z" || s.Index != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestPlayRestartsTheTrackFromTheBeginning(t *testing.T) {
	s := State{Queue: []string{"a"}, Position: 90, Playing: true, PositionAt: epoch}.Sound().Play("a", epoch.Add(time.Minute))
	if s.Position != 0 {
		t.Fatalf("position = %v", s.Position)
	}
	if !s.PositionAt.Equal(epoch.Add(time.Minute)) {
		t.Fatalf("positionAt = %v", s.PositionAt)
	}
}

func TestPlayFromReplacesTheQueue(t *testing.T) {
	s := queued("a", "b").PlayFrom([]string{"x", "y", "z"}, "y", epoch, nil)
	if !reflect.DeepEqual(s.Queue, []string{"x", "y", "z"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
	if s.Current() != "y" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestPlayFromShufflesTheNewQueueWhenShuffleIsOn(t *testing.T) {
	s := State{Shuffle: true}.PlayFrom([]string{"a", "b", "c"}, "a", epoch, reverse)
	if !reflect.DeepEqual(playOrder(s), []string{"c", "b", "a"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
	if s.Current() != "a" || s.Index != 2 {
		t.Fatalf("state = %+v", s)
	}
}

func TestResumeLeavesThePositionAloneAndRestartsTheClock(t *testing.T) {
	later := epoch.Add(time.Hour)
	s := State{Queue: []string{"a"}, Position: 42, PositionAt: epoch}.Sound().Resume(later)
	if !s.Playing || s.Position != 42 || !s.PositionAt.Equal(later) {
		t.Fatalf("state = %+v", s)
	}
}

func TestResumeOfSomethingAlreadyPlayingCatchesUpWithThePlayhead(t *testing.T) {
	later := epoch.Add(30 * time.Second)
	s := State{Queue: []string{"a"}, Position: 42, PositionAt: epoch, Playing: true}.Sound().Resume(later)
	if s.Position != 72 || !s.PositionAt.Equal(later) {
		t.Fatalf("state = %+v", s)
	}
}

func TestResumeWithNothingToPlayStaysStopped(t *testing.T) {
	s := State{}.Resume(epoch)
	if s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestRemoveOfADuplicateLeavesThePlayheadWhereItIs(t *testing.T) {
	s := State{Queue: []string{"a", "b", "a"}, Index: 2, Position: 30, PositionAt: epoch}.Sound().Remove("a", epoch.Add(time.Minute))
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
	if s.Position != 30 {
		t.Fatalf("position = %v", s.Position)
	}
	if !reflect.DeepEqual(s.Queue, []string{"b", "a"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
}

func TestPauseWritesDownWhereThePlayheadHadReached(t *testing.T) {
	later := epoch.Add(30 * time.Second)
	s := State{Queue: []string{"a"}, Position: 10, PositionAt: epoch, Playing: true}.Sound().Pause(later)
	if s.Playing || s.Position != 40 || !s.PositionAt.Equal(later) {
		t.Fatalf("state = %+v", s)
	}
}

func TestSeekMovesThePlayheadWithoutStartingIt(t *testing.T) {
	s := queued("a").Seek(75, epoch)
	if s.Position != 75 || s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestSeekRefusesToGoBeforeTheStart(t *testing.T) {
	if got := queued("a").Seek(-5, epoch).Position; got != 0 {
		t.Fatalf("position = %v", got)
	}
}

func TestNextWalksTheQueue(t *testing.T) {
	s := queued("a", "b", "c").Next(epoch)
	if s.Current() != "b" || !s.Playing || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestNextAtTheEndStopsWhenNothingRepeats(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Index: 1, Playing: true}.Sound().Next(epoch)
	if s.Playing {
		t.Fatalf("still playing: %+v", s)
	}
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestNextAtTheEndWrapsWhenTheQueueRepeats(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Index: 1, Repeat: RepeatAll}.Sound().Next(epoch)
	if s.Current() != "a" || !s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestNextIgnoresRepeatingOneTrack(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Repeat: RepeatOne}.Sound().Next(epoch)
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestNextOnAnEmptyQueueDoesNothing(t *testing.T) {
	s := State{Track: "a", Playing: true}.Next(epoch)
	if !s.Playing || s.Track != "a" {
		t.Fatalf("state = %+v", s)
	}
}

func TestPreviousStepsBack(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 2}.Sound().Previous(epoch)
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestPreviousAtTheStartRestartsTheTrack(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Position: 50, PositionAt: epoch, Playing: true}.Sound().Previous(epoch.Add(time.Minute))
	if s.Current() != "a" || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestPreviousAtTheStartWrapsWhenTheQueueRepeats(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Repeat: RepeatAll}.Sound().Previous(epoch)
	if s.Current() != "c" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestEndedRepeatsTheSameTrackWhenAskedTo(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Repeat: RepeatOne, Position: 200, PositionAt: epoch, Playing: true}.Sound().Ended(epoch.Add(time.Minute))
	if s.Current() != "a" || s.Position != 0 || !s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestEndedOtherwiseMovesOn(t *testing.T) {
	s := queued("a", "b").Ended(epoch)
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestEndedOnTheLastTrackStops(t *testing.T) {
	s := State{Queue: []string{"a"}, Playing: true}.Sound().Ended(epoch)
	if s.Playing {
		t.Fatalf("still playing: %+v", s)
	}
}

func TestSetQueueKeepsThePlayheadOnItsTrack(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 1}.Sound().SetQueue([]string{"x", "b", "y"}, nil)
	if s.Current() != "b" || s.Index != 1 {
		t.Fatalf("state = %+v", s)
	}
}

func TestSetQueueWithoutTheTrackBeingPlayedKeepsPlayingIt(t *testing.T) {
	s := State{Queue: []string{"a"}, Track: "a"}.Sound().SetQueue([]string{"x", "y"}, nil)
	if s.Track != "a" {
		t.Fatalf("track = %q", s.Track)
	}
	if !reflect.DeepEqual(s.Queue, []string{"x", "y"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
}

func TestSetQueueShufflesWhenShuffleIsOn(t *testing.T) {
	s := State{Shuffle: true}.SetQueue([]string{"a", "b", "c"}, reverse)
	if !reflect.DeepEqual(playOrder(s), []string{"c", "b", "a"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestAppendAddsAfterEverythingQueued(t *testing.T) {
	s := queued("a", "b").Append([]string{"c"})
	if !reflect.DeepEqual(s.Queue, []string{"a", "b", "c"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestAppendUnderShuffleLeavesTheOrderAlone(t *testing.T) {
	s := State{Shuffle: true}.SetQueue([]string{"a", "b"}, reverse).Append([]string{"c"})
	if !reflect.DeepEqual(playOrder(s), []string{"b", "a", "c"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestRemoveDropsATrackAheadOfThePlayhead(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 0}.Sound().Remove("c", epoch)
	if !reflect.DeepEqual(s.Queue, []string{"a", "b"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestRemoveDropsATrackBehindThePlayheadWithoutMovingIt(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 2}.Sound().Remove("a", epoch)
	if s.Current() != "c" {
		t.Fatalf("current = %q", s.Current())
	}
	if !reflect.DeepEqual(s.Queue, []string{"b", "c"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
}

func TestRemoveOfTheTrackBeingPlayedMovesToWhatTookItsPlace(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 1, Position: 30, PositionAt: epoch}.Sound().Remove("b", epoch)
	if s.Current() != "c" || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestRemoveOfTheLastTrackBeingPlayedFallsBack(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Index: 1}.Sound().Remove("b", epoch)
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestRemoveOfTheOnlyTrackEmptiesTheQueue(t *testing.T) {
	s := State{Queue: []string{"a"}}.Sound().Remove("a", epoch)
	if len(s.Queue) != 0 || s.Current() != "" {
		t.Fatalf("state = %+v", s)
	}
}

func TestRemoveOfSomethingNotQueuedChangesNothing(t *testing.T) {
	s := queued("a", "b").Remove("z", epoch)
	if !reflect.DeepEqual(s.Queue, []string{"a", "b"}) {
		t.Fatalf("queue = %v", s.Queue)
	}
}

func TestRemoveKeepsTheShuffledOrderConsistent(t *testing.T) {
	s := State{Shuffle: true}.SetQueue([]string{"a", "b", "c", "d"}, reverse).Remove("c", epoch)
	if !reflect.DeepEqual(playOrder(s), []string{"d", "b", "a"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestClearEmptiesTheQueueButNotThePlayer(t *testing.T) {
	s := State{Queue: []string{"a", "b"}, Index: 1, Playing: true}.Sound().Clear()
	if len(s.Queue) != 0 {
		t.Fatalf("queue = %v", s.Queue)
	}
	if s.Track != "b" || !s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestShuffleOnKeepsThePlayheadOnItsTrack(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 0}.Sound().SetShuffle(true, reverse)
	if s.Current() != "a" || s.Index != 2 {
		t.Fatalf("state = %+v", s)
	}
	if !reflect.DeepEqual(playOrder(s), []string{"c", "b", "a"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestShuffleOffGivesTheOriginalOrderBack(t *testing.T) {
	s := State{Queue: []string{"a", "b", "c"}, Index: 0}.Sound().SetShuffle(true, reverse).SetShuffle(false, reverse)
	if !reflect.DeepEqual(playOrder(s), []string{"a", "b", "c"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
	if s.Current() != "a" || s.Index != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestShuffleSetToWhatItAlreadyIsChangesNothing(t *testing.T) {
	before := State{Queue: []string{"a", "b", "c"}, Shuffle: true}.Sound().SetShuffle(true, reverse)
	after := before.SetShuffle(true, reverse)
	if !reflect.DeepEqual(before.Order, after.Order) {
		t.Fatalf("order changed: %v -> %v", before.Order, after.Order)
	}
}

func TestRepeatOnlyTakesTheModesItKnows(t *testing.T) {
	if got := queued("a").SetRepeat(RepeatAll).Repeat; got != RepeatAll {
		t.Fatalf("repeat = %q", got)
	}
	if got := queued("a").SetRepeat(Repeat("often")).Repeat; got != RepeatNone {
		t.Fatalf("repeat = %q", got)
	}
}

func TestOnNamesTheDevice(t *testing.T) {
	if got := queued("a").On("speaker-1").Device; got != "speaker-1" {
		t.Fatalf("device = %q", got)
	}
}

func TestWalkingTheWholeQueueUnderShuffleReachesEveryTrackOnce(t *testing.T) {
	s := State{Shuffle: true}.SetQueue([]string{"a", "b", "c", "d"}, reverse).Play("d", epoch)
	seen := map[string]int{s.Current(): 1}
	for range 3 {
		s = s.Next(epoch)
		seen[s.Current()]++
	}
	if len(seen) != 4 {
		t.Fatalf("seen = %v", seen)
	}
	for id, times := range seen {
		if times != 1 {
			t.Fatalf("%q played %d times", id, times)
		}
	}
	if s.Next(epoch).Playing {
		t.Fatal("kept playing past the end of the queue")
	}
}

func TestSoundLeavesATrackPlayingFromOutsideTheQueueAlone(t *testing.T) {
	kept := State{Queue: []string{"a"}, Track: "a"}.Sound().SetQueue([]string{"x", "y"}, nil)
	reloaded := State{Queue: kept.Queue, Order: kept.Order, Index: kept.Index, Track: kept.Track}.Sound()
	if reloaded.Track != "a" {
		t.Fatalf("track = %q", reloaded.Track)
	}
}

func TestSoundNamesATrackOnlyWhenThereIsNone(t *testing.T) {
	if got := (State{Queue: []string{"a", "b"}, Index: 1}).Sound().Track; got != "b" {
		t.Fatalf("track = %q", got)
	}
}
