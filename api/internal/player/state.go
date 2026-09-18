package player

import "time"

// Repeat says what happens when the queue runs out under the playhead.
type Repeat string

const (
	RepeatNone Repeat = "none"
	RepeatAll  Repeat = "all"
	RepeatOne  Repeat = "one"
)

// Shuffler permutes n elements by swapping them, as math/rand.Shuffle does.
type Shuffler func(n int, swap func(i, j int))

// State is what one user is playing, as the server holds it.
//
// Queue is the tracks in the order they were given. Order is a permutation of
// its indices, which is what shuffle rearranges, so turning shuffle off gives
// the original back. Index walks Order, never Queue.
type State struct {
	Track      string
	Position   float64
	PositionAt time.Time
	Playing    bool
	Device     string
	Queue      []string
	Order      []int
	Index      int
	Shuffle    bool
	Repeat     Repeat
}

// Sound is what the state settles to, having been repaired if it was stored
// inconsistent and reconciled with the queue it walks. The track being played
// is left alone: it is not always the one the playhead sits on, since a queue
// can be replaced under something that carries on playing.
func (s State) Sound() State {
	seen := make(map[int]bool, len(s.Queue))
	order := make([]int, 0, len(s.Queue))
	for _, at := range s.Order {
		if at >= 0 && at < len(s.Queue) && !seen[at] {
			seen[at] = true
			order = append(order, at)
		}
	}
	for at := range s.Queue {
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
	return s
}

// Current is the track the playhead sits on, empty when the queue is.
func (s State) Current() string {
	if s.Index < 0 || s.Index >= len(s.Order) {
		return ""
	}
	at := s.Order[s.Index]
	if at < 0 || at >= len(s.Queue) {
		return ""
	}
	return s.Queue[at]
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

// Play puts the playhead on a track. A track already queued is jumped to,
// keeping everything around it; one that is not becomes a queue of its own.
func (s State) Play(trackID string, now time.Time) State {
	s = s.Sound()
	for slot, at := range s.Order {
		if s.Queue[at] == trackID {
			s.Index = slot
			s.Track = trackID
			s.Playing = true
			return s.at(0, now)
		}
	}

	s.Queue = []string{trackID}
	s.Order = []int{0}
	s.Index = 0
	s.Track = trackID
	s.Playing = true
	return s.at(0, now)
}

// PlayFrom replaces the queue and starts on one of its tracks.
func (s State) PlayFrom(queue []string, trackID string, now time.Time, shuffle Shuffler) State {
	s.Queue = append([]string(nil), queue...)
	s.Order = nil
	s = s.Sound()
	if s.Shuffle {
		s = s.reshuffle(shuffle)
	}
	return s.Play(trackID, now)
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

// Seek moves the playhead within the current track.
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

	if s.Index+1 < len(s.Order) {
		s.Index++
		s.Track = s.Current()
		s.Playing = true
		return s.at(0, now)
	}

	if s.Repeat == RepeatAll {
		s.Index = 0
		s.Track = s.Current()
		s.Playing = true
		return s.at(0, now)
	}

	s.Playing = false
	return s.at(0, now)
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

// SetQueue replaces what is queued, keeping the playhead on its track when
// that track is still in it.
func (s State) SetQueue(queue []string, shuffle Shuffler) State {
	playing := s.Current()
	s.Queue = append([]string(nil), queue...)
	s.Order = nil
	s.Index = 0
	s = s.Sound()
	if s.Shuffle {
		s = s.reshuffle(shuffle)
	}
	return s.seek(playing)
}

// Append adds tracks after everything already queued.
func (s State) Append(tracks []string) State {
	s = s.Sound()
	playing := s.Current()
	s.Queue = append(append([]string(nil), s.Queue...), tracks...)
	return s.Sound().seek(playing)
}

// Remove drops a track from the queue. Dropping the one being played moves the
// playhead to whatever took its place.
func (s State) Remove(trackID string, now time.Time) State {
	s = s.Sound()
	removing := -1
	for at, id := range s.Queue {
		if id == trackID {
			removing = at
			break
		}
	}
	if removing < 0 {
		return s
	}

	wasPlaying := s.Index < len(s.Order) && s.Order[s.Index] == removing
	queue := append([]string(nil), s.Queue[:removing]...)
	s.Queue = append(queue, s.Queue[removing+1:]...)

	order := make([]int, 0, len(s.Order))
	for slot, at := range s.Order {
		switch {
		case at == removing:
			if slot < s.Index {
				s.Index--
			}
		case at > removing:
			order = append(order, at-1)
		default:
			order = append(order, at)
		}
	}
	s.Order = order

	s = s.Sound()
	if wasPlaying {
		s.Track = s.Current()
		return s.at(0, now)
	}
	return s
}

// Clear empties the queue. What was playing keeps playing; it is simply the
// last thing there is.
func (s State) Clear() State {
	s = s.Sound()
	playing := s.Current()
	s.Queue = nil
	s.Order = nil
	s.Index = 0
	s = s.Sound()
	if playing != "" {
		s.Track = playing
	}
	return s
}

// SetShuffle rearranges the order without disturbing the track being played,
// which stays where the playhead is and is not shuffled away under it.
func (s State) SetShuffle(on bool, shuffle Shuffler) State {
	s = s.Sound()
	if s.Shuffle == on {
		return s
	}

	playing := s.Current()
	s.Shuffle = on
	if !on {
		s.Order = nil
		return s.Sound().seek(playing)
	}
	return s.reshuffle(shuffle).seek(playing)
}

// SetRepeat says what to do when the queue runs out.
func (s State) SetRepeat(repeat Repeat) State {
	s = s.Sound()
	s.Repeat = repeat
	return s.Sound()
}

// On says which device the sound comes out of.
func (s State) On(device string) State {
	s = s.Sound()
	s.Device = device
	return s
}

func (s State) reshuffle(shuffle Shuffler) State {
	order := make([]int, len(s.Queue))
	for at := range order {
		order[at] = at
	}
	if shuffle != nil {
		shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	}
	s.Order = order
	return s
}

func (s State) seek(trackID string) State {
	if trackID == "" {
		return s
	}
	for slot, at := range s.Order {
		if s.Queue[at] == trackID {
			s.Index = slot
			s.Track = trackID
			return s
		}
	}
	s.Track = trackID
	return s
}
