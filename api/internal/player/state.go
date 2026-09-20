package player

import "time"

// Repeat says what happens when the list runs out under the playhead.
type Repeat string

const (
	RepeatNone Repeat = "none"
	RepeatAll  Repeat = "all"
	RepeatOne  Repeat = "one"
)

// Shuffler permutes n elements by swapping them, as math/rand.Shuffle does.
type Shuffler func(n int, swap func(i, j int))

// State is what one user is playing.
//
// List is the tracks in the order they were handed over or found; Order is a
// permutation of its indices, which is what shuffle rearranges, so turning
// shuffle off gives the original back. Index walks Order, never List.
//
// Devices is everywhere the sound comes out at once. One device is a set of
// one, and the empty set is a user who has not said where to play yet.
type State struct {
	Track      string
	Position   float64
	PositionAt time.Time
	Playing    bool
	Devices    []string
	List       []string
	Order      []int
	Index      int
	Shuffle    bool
	Repeat     Repeat
}

// Sound is what the state settles to, having been repaired if it was stored
// inconsistent and reconciled with the list it walks. The track being played
// is left alone: it is not always the one the playhead sits on, since a track
// can outlive the list it came from.
func (s State) Sound() State {
	seen := make(map[int]bool, len(s.List))
	order := make([]int, 0, len(s.List))
	for _, at := range s.Order {
		if at >= 0 && at < len(s.List) && !seen[at] {
			seen[at] = true
			order = append(order, at)
		}
	}
	for at := range s.List {
		if !seen[at] {
			order = append(order, at)
		}
	}
	s.Order = order

	switch {
	case len(order) == 0:
		s.Index = 0
	case s.Index < 0:
		s.Index = 0
	case s.Index >= len(order):
		s.Index = len(order) - 1
	}

	if s.Track == "" {
		s.Track = s.Current()
	}
	if s.Repeat != RepeatAll && s.Repeat != RepeatOne {
		s.Repeat = RepeatNone
	}
	s.Devices = only(s.Devices)
	return s
}

// Cycle names one run of a track: the moment the playhead was set, in
// milliseconds. A device is given the run it is to play and reports the end of
// that run, so that a track restarted under RepeatOne is not ended a second
// time by the device that was still finishing the run before it.
func (s State) Cycle() int64 {
	if s.PositionAt.IsZero() {
		return 0
	}
	return s.PositionAt.UnixMilli()
}

// Same says whether two states describe the same sound coming out of the same
// places. An order that changed none of it has nothing to tell a device, and
// telling it anyway restarts what is already playing.
func (s State) Same(other State) bool {
	if s.Track != other.Track || s.Playing != other.Playing || s.Position != other.Position || !s.PositionAt.Equal(other.PositionAt) {
		return false
	}
	if len(s.Devices) != len(other.Devices) {
		return false
	}
	for i, device := range s.Devices {
		if other.Devices[i] != device {
			return false
		}
	}
	return true
}

// Identical says whether two states are the same record. What is queued and how
// it is played can change without a device having anything to hear about it,
// and it still has to be written down.
func (s State) Identical(other State) bool {
	if !s.Same(other) || s.Index != other.Index || s.Shuffle != other.Shuffle || s.Repeat != other.Repeat {
		return false
	}
	if len(s.List) != len(other.List) || len(s.Order) != len(other.Order) {
		return false
	}
	for i, id := range s.List {
		if other.List[i] != id {
			return false
		}
	}
	for i, at := range s.Order {
		if other.Order[i] != at {
			return false
		}
	}
	return true
}

// Current is the track the playhead sits on, empty when the list is.
func (s State) Current() string {
	if s.Index < 0 || s.Index >= len(s.Order) {
		return ""
	}
	at := s.Order[s.Index]
	if at < 0 || at >= len(s.List) {
		return ""
	}
	return s.List[at]
}

// Ahead is how many tracks are left after the one playing, which is what says
// whether the list needs extending.
func (s State) Ahead() int {
	if len(s.Order) == 0 {
		return 0
	}
	return len(s.Order) - 1 - s.Index
}

// PositionAtTime is where the playhead has reached by then, which is not where
// it was last written down: a playing track has moved on since.
func (s State) PositionAtTime(now time.Time) float64 {
	if !s.Playing || s.PositionAt.IsZero() {
		return s.Position
	}
	elapsed := now.Sub(s.PositionAt).Seconds()
	if elapsed < 0 {
		return s.Position
	}
	return s.Position + elapsed
}

func (s State) at(position float64, now time.Time) State {
	if position < 0 {
		position = 0
	}
	s.Position = position
	s.PositionAt = now
	return s
}

// Start is the one order that begins playback. The tracks handed over become
// the list and the first of them plays, so that "play this, from this" is not
// two orders with a gap between them.
func (s State) Start(tracks []string, now time.Time, shuffle Shuffler) State {
	tracks = only(tracks)
	if len(tracks) == 0 {
		return s.Sound()
	}

	head := tracks[0]
	s.List = tracks
	s.Order = nil
	s.Index = 0
	s = s.Sound()
	if s.Shuffle {
		s = s.reshuffle(0, shuffle)
	}
	s.Track = head
	s.Playing = true
	return s.at(0, now)
}

// Extend adds what the server found to follow, after everything in the list,
// and no more than asked for: the list is meant to stay a list rather than
// become a copy of the library.
func (s State) Extend(tracks []string, most int) State {
	s = s.Sound()
	if most <= 0 {
		return s
	}

	known := make(map[string]bool, len(s.List))
	for _, id := range s.List {
		known[id] = true
	}

	added := 0
	for _, id := range only(tracks) {
		if known[id] {
			continue
		}
		known[id] = true
		s.List = append(s.List, id)
		s.Order = append(s.Order, len(s.List)-1)
		if added++; added == most {
			break
		}
	}
	return s.Sound()
}

// AddNext puts a track straight after the one playing rather than at the end,
// which is what asking for it next means. A track already in the list moves
// there instead of appearing twice.
func (s State) AddNext(trackID string) State {
	s = s.Sound()
	if trackID == "" {
		return s
	}

	playing := s.here()
	add := -1
	for i, id := range s.List {
		if id == trackID {
			add = i
			break
		}
	}
	if add < 0 {
		s.List = append(s.List, trackID)
		add = len(s.List) - 1
	}
	if add == playing {
		return s
	}

	order := make([]int, 0, len(s.List))
	for _, i := range s.Order {
		if i != add {
			order = append(order, i)
		}
	}

	slot := len(order)
	for i, j := range order {
		if j == playing {
			slot = i + 1
			break
		}
	}

	next := make([]int, 0, len(order)+1)
	next = append(next, order[:slot]...)
	next = append(next, add)
	next = append(next, order[slot:]...)
	s.Order = next
	return s.playhead(playing).Sound()
}

// here is the place in the list the playhead sits on, which is what identifies
// it: the track id does not, and the slot in the order moves when the order
// does.
func (s State) here() int {
	if s.Index < 0 || s.Index >= len(s.Order) {
		return -1
	}
	return s.Order[s.Index]
}

// Remove drops a track from the list. Dropping the one being played moves the
// playhead to whatever took its place, which is the next thing to hear.
func (s State) Remove(trackID string, now time.Time) State {
	s = s.Sound()
	drop := -1
	for at, id := range s.List {
		if id == trackID {
			drop = at
			break
		}
	}
	if drop < 0 {
		return s
	}

	playing := s.here() == drop
	list := append([]string(nil), s.List[:drop]...)
	s.List = append(list, s.List[drop+1:]...)

	order := make([]int, 0, len(s.List))
	for slot, at := range s.Order {
		switch {
		case at == drop:
			if slot < s.Index {
				s.Index--
			}
		case at > drop:
			order = append(order, at-1)
		default:
			order = append(order, at)
		}
	}
	s.Order = order

	s = s.Sound()
	if playing {
		s.Track = s.Current()
		if s.Track == "" {
			s.Playing = false
		}
		return s.at(0, now)
	}
	return s
}

// Clear empties the list. What is playing keeps playing; it is simply the last
// thing there is.
func (s State) Clear() State {
	s = s.Sound()
	playing := s.Track
	s.List = nil
	s.Order = nil
	s.Index = 0
	s = s.Sound()
	if playing != "" {
		s.Track = playing
	}
	return s
}

// Resume carries on from where the playhead has reached, which on something
// already playing is further along than what was last written down.
func (s State) Resume(now time.Time) State {
	s = s.Sound()
	if s.Track == "" {
		return s
	}
	position := s.PositionAtTime(now)
	s.Playing = true
	return s.at(position, now)
}

// Pause writes down where the playhead had reached before stopping it.
func (s State) Pause(now time.Time) State {
	s = s.Sound()
	position := s.PositionAtTime(now)
	s.Playing = false
	return s.at(position, now)
}

// Seek moves the playhead within the track being played.
func (s State) Seek(position float64, now time.Time) State {
	return s.Sound().at(position, now)
}

// Next is the listener asking for the track after this one. Repeating one
// track is not an answer to that question, so it is ignored here; it is
// honoured by Ended, where it belongs.
func (s State) Next(now time.Time) State {
	s = s.Sound()
	if len(s.Order) == 0 {
		return s
	}

	// The playhead may already be sitting on something that has not been heard:
	// replacing the list under a track that carries on playing leaves it there,
	// and stepping over it would lose the first of the new list.
	if s.Current() != s.Track {
		s.Track = s.Current()
		s.Playing = true
		return s.at(0, now)
	}

	switch {
	case s.Index+1 < len(s.Order):
		s.Index++
	case s.Repeat == RepeatAll:
		s.Index = 0
	default:
		s.Playing = false
		return s.at(0, now)
	}

	s.Track = s.Current()
	s.Playing = true
	return s.at(0, now)
}

// Skip puts the playhead on a track already in the list, which is what
// clicking one in the queue means. A track that is not in the list is not a
// place to move to, and nothing happens.
func (s State) Skip(trackID string, now time.Time) State {
	s = s.Sound()
	for slot, at := range s.Order {
		if s.List[at] != trackID {
			continue
		}
		s.Index = slot
		s.Track = trackID
		s.Playing = true
		return s.at(0, now)
	}
	return s
}

// Previous steps back, or restarts the track when there is nothing behind it.
func (s State) Previous(now time.Time) State {
	s = s.Sound()
	if len(s.Order) == 0 {
		return s
	}

	switch {
	case s.Index > 0:
		s.Index--
	case s.Repeat == RepeatAll:
		s.Index = len(s.Order) - 1
	}

	s.Track = s.Current()
	s.Playing = true
	return s.at(0, now)
}

// Ended is the track running out on its own.
func (s State) Ended(now time.Time) State {
	s = s.Sound()
	if s.Repeat == RepeatOne && s.Current() != "" {
		s.Playing = true
		return s.at(0, now)
	}
	return s.Next(now)
}

// SetShuffle rearranges the order without disturbing the track being played,
// which stays where the playhead is and is not shuffled away under it.
func (s State) SetShuffle(on bool, shuffle Shuffler) State {
	s = s.Sound()
	if s.Shuffle == on {
		return s
	}

	at := -1
	if s.Index < len(s.Order) {
		at = s.Order[s.Index]
	}

	s.Shuffle = on
	if !on {
		s.Order = nil
		return s.Sound().playhead(at)
	}
	return s.reshuffle(at, shuffle)
}

// SetRepeat says what happens when the list runs out.
func (s State) SetRepeat(repeat Repeat) State {
	s = s.Sound()
	s.Repeat = repeat
	return s.Sound()
}

// On says where the sound comes out, replacing whatever it came out of before.
func (s State) On(devices []string) State {
	s = s.Sound()
	s.Devices = only(devices)
	return s
}

// Join adds a device to the ones already playing, which is how playing in step
// on several of them starts.
func (s State) Join(device string) State {
	s = s.Sound()
	if device == "" {
		return s
	}
	for _, id := range s.Devices {
		if id == device {
			return s
		}
	}
	s.Devices = append(s.Devices, device)
	return s
}

// Leave takes a device out, whether its owner asked or another user took it.
func (s State) Leave(device string) State {
	s = s.Sound()
	kept := make([]string, 0, len(s.Devices))
	for _, id := range s.Devices {
		if id != device {
			kept = append(kept, id)
		}
	}
	s.Devices = kept
	return s
}

// Plays says whether a device is one of the ones the sound comes out of.
func (s State) Plays(device string) bool {
	for _, id := range s.Devices {
		if id == device {
			return true
		}
	}
	return false
}

// reshuffle mixes the list and puts the track being played at the head of it,
// so that shuffling always leaves a whole list ahead rather than sometimes
// landing the playhead on the last of it.
func (s State) reshuffle(at int, shuffle Shuffler) State {
	rest := make([]int, 0, len(s.List))
	for i := range s.List {
		if i != at {
			rest = append(rest, i)
		}
	}
	if shuffle != nil {
		shuffle(len(rest), func(i, j int) { rest[i], rest[j] = rest[j], rest[i] })
	}

	order := make([]int, 0, len(s.List))
	if at >= 0 && at < len(s.List) {
		order = append(order, at)
		if s.Track == "" {
			s.Track = s.List[at]
		}
	}
	s.Order = append(order, rest...)
	s.Index = 0
	return s
}

// playhead puts the cursor back on a place in the list rather than on a track
// id, since a list may hold the same track twice and only one of them is the
// one being played.
func (s State) playhead(at int) State {
	if at < 0 || at >= len(s.List) {
		return s
	}
	for slot, i := range s.Order {
		if i == at {
			s.Index = slot
			// The track being played is not renamed from where the playhead
			// sits: replacing the list under something still playing leaves it
			// outside, and losing that difference would have the record name a
			// track nobody is hearing.
			if s.Track == "" {
				s.Track = s.List[at]
			}
			return s
		}
	}
	return s
}

// only keeps each id once. A list never holds the same track twice, and a
// device cannot be two of the places the sound comes out of.
func only(ids []string) []string {
	seen := make(map[string]bool, len(ids))
	kept := make([]string, 0, len(ids))
	for _, id := range ids {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		kept = append(kept, id)
	}
	return kept
}
