package player

import (
	"reflect"
	"testing"
	"time"
)

var epoch = time.Date(2026, 9, 19, 12, 0, 0, 0, time.UTC)

func reverse(n int, swap func(i, j int)) {
	for i, j := 0, n-1; i < j; i, j = i+1, j-1 {
		swap(i, j)
	}
}

func listed(ids ...string) State {
	return State{List: ids}.Sound()
}

func playOrder(s State) []string {
	out := make([]string, 0, len(s.Order))
	for _, at := range s.Order {
		out = append(out, s.List[at])
	}
	return out
}

func TestSoundFillsTheOrderFromTheList(t *testing.T) {
	s := listed("a", "b", "c")
	if !reflect.DeepEqual(s.Order, []int{0, 1, 2}) {
		t.Fatalf("order = %v", s.Order)
	}
	if s.Current() != "a" || s.Track != "a" {
		t.Fatalf("state = %+v", s)
	}
}

func TestSoundDropsOrderEntriesThatNoLongerExist(t *testing.T) {
	s := State{List: []string{"a", "b"}, Order: []int{5, 1, 1, -3, 0}}.Sound()
	if !reflect.DeepEqual(s.Order, []int{1, 0}) {
		t.Fatalf("order = %v", s.Order)
	}
}

func TestSoundAppendsListEntriesTheOrderMissed(t *testing.T) {
	s := State{List: []string{"a", "b", "c"}, Order: []int{2}}.Sound()
	if !reflect.DeepEqual(s.Order, []int{2, 0, 1}) {
		t.Fatalf("order = %v", s.Order)
	}
}

func TestSoundClampsTheIndex(t *testing.T) {
	if got := (State{List: []string{"a", "b"}, Index: 9}).Sound().Index; got != 1 {
		t.Fatalf("index = %d", got)
	}
	if got := (State{List: []string{"a", "b"}, Index: -4}).Sound().Index; got != 0 {
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

func TestSoundNamesATrackOnlyWhenThereIsNone(t *testing.T) {
	if got := (State{List: []string{"a", "b"}, Index: 1}).Sound().Track; got != "b" {
		t.Fatalf("track = %q", got)
	}
	if got := (State{List: []string{"a"}, Track: "z"}).Sound().Track; got != "z" {
		t.Fatalf("track = %q", got)
	}
}

func TestSoundKeepsEachDeviceOnce(t *testing.T) {
	s := State{Devices: []string{"sonos", "", "phone", "sonos"}}.Sound()
	if !reflect.DeepEqual(s.Devices, []string{"sonos", "phone"}) {
		t.Fatalf("devices = %v", s.Devices)
	}
}

func TestAheadCountsWhatIsLeft(t *testing.T) {
	if got := listed("a", "b", "c").Ahead(); got != 2 {
		t.Fatalf("ahead = %d", got)
	}
	if got := (State{List: []string{"a", "b", "c"}, Index: 2}).Sound().Ahead(); got != 0 {
		t.Fatalf("ahead = %d", got)
	}
	if got := (State{}).Ahead(); got != 0 {
		t.Fatalf("ahead = %d", got)
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

func TestStartPlaysTheFirstTrackHandedOver(t *testing.T) {
	s := State{}.Start([]string{"c", "d", "e"}, epoch, nil)
	if s.Track != "c" || !s.Playing || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
	if !reflect.DeepEqual(s.List, []string{"c", "d", "e"}) {
		t.Fatalf("list = %v", s.List)
	}
}

func TestStartReplacesWhateverWasThere(t *testing.T) {
	s := listed("a", "b").Start([]string{"z"}, epoch, nil)
	if !reflect.DeepEqual(s.List, []string{"z"}) {
		t.Fatalf("list = %v", s.List)
	}
}

func TestStartOfASingleTrackIsAListOfOne(t *testing.T) {
	s := State{}.Start([]string{"a"}, epoch, nil)
	if len(s.List) != 1 || s.Current() != "a" {
		t.Fatalf("state = %+v", s)
	}
}

func TestStartKeepsATrackOnlyOnce(t *testing.T) {
	s := State{}.Start([]string{"a", "b", "a"}, epoch, nil)
	if !reflect.DeepEqual(s.List, []string{"a", "b"}) {
		t.Fatalf("list = %v", s.List)
	}
}

func TestStartDropsWhatIsNotATrack(t *testing.T) {
	s := State{}.Start([]string{"", "a", ""}, epoch, nil)
	if !reflect.DeepEqual(s.List, []string{"a"}) {
		t.Fatalf("list = %v", s.List)
	}
}

func TestStartWithNothingToPlayChangesNothing(t *testing.T) {
	before := listed("a", "b")
	after := before.Start(nil, epoch, nil)
	if !reflect.DeepEqual(before.List, after.List) || after.Playing {
		t.Fatalf("state = %+v", after)
	}
}

func TestStartUnderShuffleStillPlaysWhatWasAskedForFirst(t *testing.T) {
	s := State{Shuffle: true}.Start([]string{"a", "b", "c"}, epoch, reverse)
	if s.Current() != "a" || s.Index != 0 {
		t.Fatalf("state = %+v", s)
	}
	if !reflect.DeepEqual(playOrder(s), []string{"a", "c", "b"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
	if s.Ahead() != 2 {
		t.Fatalf("ahead = %d", s.Ahead())
	}
}

func TestExtendAddsAfterEverythingInTheList(t *testing.T) {
	s := listed("a", "b").Extend([]string{"c", "d"}, 10)
	if !reflect.DeepEqual(s.List, []string{"a", "b", "c", "d"}) {
		t.Fatalf("list = %v", s.List)
	}
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestExtendAddsNoMoreThanAskedFor(t *testing.T) {
	s := listed("a").Extend([]string{"b", "c", "d"}, 2)
	if !reflect.DeepEqual(s.List, []string{"a", "b", "c"}) {
		t.Fatalf("list = %v", s.List)
	}
}

func TestExtendAddsNothingWhenNothingIsWanted(t *testing.T) {
	s := listed("a").Extend([]string{"b"}, 0)
	if len(s.List) != 1 {
		t.Fatalf("list = %v", s.List)
	}
}

func TestExtendDoesNotRepeatWhatIsAlreadyComing(t *testing.T) {
	s := listed("a", "b").Extend([]string{"b", "c"}, 10)
	if !reflect.DeepEqual(s.List, []string{"a", "b", "c"}) {
		t.Fatalf("list = %v", s.List)
	}
}

func TestExtendUnderShuffleQueuesTheNewTracksLast(t *testing.T) {
	s := State{Shuffle: true}.Start([]string{"a", "b"}, epoch, reverse).Extend([]string{"c"}, 10)
	if !reflect.DeepEqual(playOrder(s), []string{"a", "b", "c"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestResumeCatchesUpWithThePlayhead(t *testing.T) {
	later := epoch.Add(30 * time.Second)
	s := State{List: []string{"a"}, Position: 42, PositionAt: epoch, Playing: true}.Sound().Resume(later)
	if s.Position != 72 || !s.PositionAt.Equal(later) {
		t.Fatalf("state = %+v", s)
	}
}

func TestResumeFromAPauseLeavesThePositionAlone(t *testing.T) {
	later := epoch.Add(time.Hour)
	s := State{List: []string{"a"}, Position: 42, PositionAt: epoch}.Sound().Resume(later)
	if !s.Playing || s.Position != 42 || !s.PositionAt.Equal(later) {
		t.Fatalf("state = %+v", s)
	}
}

func TestResumeWithNothingToPlayStaysStopped(t *testing.T) {
	if (State{}).Resume(epoch).Playing {
		t.Fatal("started with nothing to play")
	}
}

func TestPauseWritesDownWhereThePlayheadHadReached(t *testing.T) {
	later := epoch.Add(30 * time.Second)
	s := State{List: []string{"a"}, Position: 10, PositionAt: epoch, Playing: true}.Sound().Pause(later)
	if s.Playing || s.Position != 40 || !s.PositionAt.Equal(later) {
		t.Fatalf("state = %+v", s)
	}
}

func TestSeekRefusesToGoBeforeTheStart(t *testing.T) {
	if got := listed("a").Seek(-5, epoch).Position; got != 0 {
		t.Fatalf("position = %v", got)
	}
}

func TestNextWalksTheList(t *testing.T) {
	s := listed("a", "b", "c").Next(epoch)
	if s.Current() != "b" || !s.Playing || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestNextAtTheEndStopsWhenNothingRepeats(t *testing.T) {
	s := State{List: []string{"a", "b"}, Index: 1, Playing: true}.Sound().Next(epoch)
	if s.Playing || s.Current() != "b" {
		t.Fatalf("state = %+v", s)
	}
}

func TestNextAtTheEndWrapsWhenTheListRepeats(t *testing.T) {
	s := State{List: []string{"a", "b"}, Index: 1, Repeat: RepeatAll}.Sound().Next(epoch)
	if s.Current() != "a" || !s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestNextIgnoresRepeatingOneTrack(t *testing.T) {
	s := State{List: []string{"a", "b"}, Repeat: RepeatOne}.Sound().Next(epoch)
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestPreviousStepsBack(t *testing.T) {
	s := State{List: []string{"a", "b", "c"}, Index: 2}.Sound().Previous(epoch)
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestPreviousAtTheStartRestartsTheTrack(t *testing.T) {
	s := State{List: []string{"a", "b"}, Position: 50, PositionAt: epoch, Playing: true}.Sound().Previous(epoch.Add(time.Minute))
	if s.Current() != "a" || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestEndedRepeatsTheSameTrackWhenAskedTo(t *testing.T) {
	s := State{List: []string{"a", "b"}, Repeat: RepeatOne, Position: 200, PositionAt: epoch, Playing: true}.Sound().Ended(epoch.Add(time.Minute))
	if s.Current() != "a" || s.Position != 0 || !s.Playing {
		t.Fatalf("state = %+v", s)
	}
}

func TestEndedOtherwiseMovesOn(t *testing.T) {
	if got := listed("a", "b").Ended(epoch).Current(); got != "b" {
		t.Fatalf("current = %q", got)
	}
}

func TestShuffleOnPutsTheTrackBeingPlayedAtTheHead(t *testing.T) {
	s := listed("a", "b", "c").SetShuffle(true, reverse)
	if s.Current() != "a" || s.Index != 0 {
		t.Fatalf("state = %+v", s)
	}
	if !reflect.DeepEqual(playOrder(s), []string{"a", "c", "b"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestShuffleOnInTheMiddleLeavesTheWholeListAhead(t *testing.T) {
	s := State{List: []string{"a", "b", "c", "d"}, Index: 3}.Sound().SetShuffle(true, reverse)
	if s.Current() != "d" {
		t.Fatalf("current = %q", s.Current())
	}
	if s.Ahead() != 3 {
		t.Fatalf("ahead = %d", s.Ahead())
	}
}

func TestShuffleOffGivesTheOriginalOrderBack(t *testing.T) {
	s := listed("a", "b", "c").SetShuffle(true, reverse).SetShuffle(false, reverse)
	if !reflect.DeepEqual(playOrder(s), []string{"a", "b", "c"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
	if s.Current() != "a" || s.Index != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestAddNextPutsATrackStraightAfterTheOnePlaying(t *testing.T) {
	s := listed("a", "b", "c").AddNext("z")
	if !reflect.DeepEqual(playOrder(s), []string{"a", "z", "b", "c"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestAddNextOfATrackAlreadyThereMovesItRatherThanRepeatingIt(t *testing.T) {
	s := listed("a", "b", "c").AddNext("c")
	if !reflect.DeepEqual(playOrder(s), []string{"a", "c", "b"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
	if len(s.List) != 3 {
		t.Fatalf("list = %v", s.List)
	}
}

func TestAddNextOfTheTrackBeingPlayedChangesNothing(t *testing.T) {
	before := listed("a", "b")
	after := before.AddNext("a")
	if !reflect.DeepEqual(playOrder(before), playOrder(after)) {
		t.Fatalf("order = %v", playOrder(after))
	}
}

func TestAddNextOnAnEmptyListStartsOne(t *testing.T) {
	s := State{}.AddNext("a")
	if !reflect.DeepEqual(s.List, []string{"a"}) {
		t.Fatalf("list = %v", s.List)
	}
	if s.Playing {
		t.Fatal("adding a track started playing it")
	}
}

func TestAddNextUnderShuffleStillLandsAfterTheOnePlaying(t *testing.T) {
	s := State{List: []string{"a", "b", "c", "d"}, Index: 0}.Sound().SetShuffle(true, reverse).AddNext("d")
	if playOrder(s)[1] != "d" {
		t.Fatalf("order = %v", playOrder(s))
	}
	if s.Current() != "a" {
		t.Fatalf("current = %q", s.Current())
	}
}

func TestAddNextKeepsThePlayheadWhereItWas(t *testing.T) {
	s := State{List: []string{"a", "b", "c"}, Index: 2}.Sound().AddNext("z")
	if s.Current() != "c" {
		t.Fatalf("current = %q", s.Current())
	}
	if !reflect.DeepEqual(playOrder(s), []string{"a", "b", "c", "z"}) {
		t.Fatalf("order = %v", playOrder(s))
	}
}

func TestOnReplacesWhereTheSoundComesOut(t *testing.T) {
	s := State{Devices: []string{"sonos"}}.On([]string{"phone", "kitchen"})
	if !reflect.DeepEqual(s.Devices, []string{"phone", "kitchen"}) {
		t.Fatalf("devices = %v", s.Devices)
	}
}

func TestJoinAddsADeviceWithoutDisturbingTheOthers(t *testing.T) {
	s := State{Devices: []string{"sonos"}}.Sound().Join("phone")
	if !reflect.DeepEqual(s.Devices, []string{"sonos", "phone"}) {
		t.Fatalf("devices = %v", s.Devices)
	}
}

func TestJoinOfADeviceAlreadyPlayingChangesNothing(t *testing.T) {
	s := State{Devices: []string{"sonos"}}.Sound().Join("sonos")
	if !reflect.DeepEqual(s.Devices, []string{"sonos"}) {
		t.Fatalf("devices = %v", s.Devices)
	}
}

func TestLeaveTakesADeviceOutAndTheRestCarryOn(t *testing.T) {
	s := State{Devices: []string{"sonos", "phone"}, List: []string{"a"}, Playing: true}.Sound().Leave("sonos")
	if !reflect.DeepEqual(s.Devices, []string{"phone"}) {
		t.Fatalf("devices = %v", s.Devices)
	}
	if !s.Playing {
		t.Fatal("playback stopped when one device left")
	}
}

func TestLeavingTheLastDeviceLeavesNowhereToPlay(t *testing.T) {
	s := State{Devices: []string{"sonos"}}.Sound().Leave("sonos")
	if len(s.Devices) != 0 {
		t.Fatalf("devices = %v", s.Devices)
	}
}

func TestPlaysSaysWhetherADeviceIsOneOfThem(t *testing.T) {
	s := State{Devices: []string{"sonos", "phone"}}.Sound()
	if !s.Plays("phone") || s.Plays("kitchen") {
		t.Fatalf("devices = %v", s.Devices)
	}
}

func TestWalkingTheWholeListUnderShuffleReachesEveryTrackOnce(t *testing.T) {
	s := State{Shuffle: true}.Start([]string{"a", "b", "c", "d"}, epoch, reverse)
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
		t.Fatal("kept playing past the end of the list")
	}
}

func TestSkipMovesThePlayheadWithinTheList(t *testing.T) {
	s := listed("a", "b", "c").Skip("c", epoch)
	if s.Current() != "c" || !s.Playing || s.Position != 0 {
		t.Fatalf("state = %+v", s)
	}
	if len(s.List) != 3 {
		t.Fatalf("list = %v", s.List)
	}
}

func TestSkipToATrackNotInTheListDoesNothing(t *testing.T) {
	before := listed("a", "b")
	after := before.Skip("z", epoch)
	if after.Current() != "a" || after.Playing {
		t.Fatalf("state = %+v", after)
	}
	if !reflect.DeepEqual(before.List, after.List) {
		t.Fatalf("list = %v", after.List)
	}
}

func TestSkipFollowsTheShuffledOrderNotTheList(t *testing.T) {
	s := listed("a", "b", "c", "d").SetShuffle(true, reverse).Skip("b", epoch)
	if s.Current() != "b" {
		t.Fatalf("current = %q", s.Current())
	}
	if s.Order[s.Index] != 1 {
		t.Fatalf("playhead landed on list entry %d", s.Order[s.Index])
	}
}

func TestSkipBackwardsWorksTheSameWay(t *testing.T) {
	s := State{List: []string{"a", "b", "c"}, Index: 2}.Sound().Skip("a", epoch)
	if s.Current() != "a" || s.Index != 0 {
		t.Fatalf("state = %+v", s)
	}
}

func TestAddNextOnAnEmptyListNamesTheTrack(t *testing.T) {
	s := State{}.AddNext("a")
	if s.Track != "a" {
		t.Fatalf("track = %q", s.Track)
	}
}
