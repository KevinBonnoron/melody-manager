package player

import (
	"context"
	"errors"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"
)

// ErrNoDevice is a device the record names that is not there any more. It
// leaves the set rather than staying as a name every later order fails on.
var ErrNoDevice = errors.New("device not found")

// ErrNowhereToPlay is an order that reached none of the devices it was meant
// to come out of.
var ErrNowhereToPlay = errors.New("nothing could play it")

// keepAhead is how many tracks the server keeps beyond the playhead, so that
// the list stays a list rather than becoming a copy of the library.
const keepAhead = 10

// Records is where the playback record lives.
type Records interface {
	Load(owner string) (State, error)
	Save(owner string, state State) error
}

// Output carries an order to one device. Play and Resume both name the track
// and the position on purpose: a device that has been sitting idle may no
// longer hold anything it can carry on with, and only the caller knows what it
// was supposed to be playing.
type Output interface {
	Play(ctx context.Context, owner, device, trackID string, position float64) error
	Resume(ctx context.Context, owner, device, trackID string, position float64) error
	Pause(ctx context.Context, owner, device string) error
	Seek(ctx context.Context, owner, device string, position float64) error
}

// Continuation chooses what follows the tracks already in a list, so that
// playback does not stop at the end of whatever a client handed over.
type Continuation interface {
	More(ctx context.Context, owner string, list []string, want int) ([]string, error)
}

// Service owns what each user is playing.
type Service struct {
	store   Records
	out     Output
	more    Continuation
	shuffle Shuffler
	now     func() time.Time

	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func NewService(store Records, out Output, more Continuation) *Service {
	return &Service{
		store:   store,
		out:     out,
		more:    more,
		shuffle: rand.Shuffle,
		now:     time.Now,
		locks:   map[string]*sync.Mutex{},
	}
}

// State is what the user is playing, without changing anything.
func (s *Service) State(owner string) (State, error) {
	defer s.hold(owner)()
	return s.store.Load(owner)
}

// Start begins playback on the tracks handed over, the first of them first.
func (s *Service) Start(ctx context.Context, owner string, tracks []string) (State, error) {
	return s.order(ctx, owner, func(state State, now time.Time) State {
		return state.Start(tracks, now, s.shuffle)
	}, s.playing(owner))
}

// Resume carries on with what was already loaded.
func (s *Service) Resume(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Resume, s.reach(owner, func(ctx context.Context, device string, state State) error {
		return s.out.Resume(ctx, owner, device, state.Track, state.Position)
	}))
}

// Pause stops without forgetting where it got to.
func (s *Service) Pause(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Pause, s.reach(owner, func(ctx context.Context, device string, _ State) error {
		return s.out.Pause(ctx, owner, device)
	}))
}

// Next is the listener asking for the track after this one.
func (s *Service) Next(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Next, s.playing(owner))
}

// Previous steps back through the list.
func (s *Service) Previous(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Previous, s.playing(owner))
}

// Skip puts the playhead on a track already in the list.
func (s *Service) Skip(ctx context.Context, owner, trackID string) (State, error) {
	return s.order(ctx, owner, func(state State, now time.Time) State {
		return state.Skip(trackID, now)
	}, s.playing(owner))
}

// Ended is a track running out on its own, which is the only time repeating a
// single track means anything.
func (s *Service) Ended(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Ended, s.playing(owner))
}

// Seek moves the playhead within the track being played.
func (s *Service) Seek(ctx context.Context, owner string, position float64) (State, error) {
	return s.order(ctx, owner, func(state State, now time.Time) State {
		return state.Seek(position, now)
	}, s.reach(owner, func(ctx context.Context, device string, state State) error {
		return s.out.Seek(ctx, owner, device, state.Position)
	}))
}

// AddNext puts a track straight after the one playing.
func (s *Service) AddNext(ctx context.Context, owner, trackID string) (State, error) {
	return s.quiet(ctx, owner, func(state State, _ time.Time) State {
		return state.AddNext(trackID)
	})
}

// SetShuffle turns shuffling on or off.
func (s *Service) SetShuffle(ctx context.Context, owner string, on bool) (State, error) {
	return s.quiet(ctx, owner, func(state State, _ time.Time) State {
		return state.SetShuffle(on, s.shuffle)
	})
}

// SetRepeat says what happens when the list runs out.
func (s *Service) SetRepeat(ctx context.Context, owner string, repeat Repeat) (State, error) {
	return s.quiet(ctx, owner, func(state State, _ time.Time) State {
		return state.SetRepeat(repeat)
	})
}

// On replaces where the sound comes out, keeping the position so that what was
// playing carries on where it was.
func (s *Service) On(ctx context.Context, owner string, devices []string) (State, error) {
	return s.move(ctx, owner, func(state State, now time.Time) State {
		return state.On(devices).Seek(state.PositionAtTime(now), now)
	})
}

// Join adds a device to the ones already playing, which is how playing in step
// on several of them starts.
func (s *Service) Join(ctx context.Context, owner, device string) (State, error) {
	return s.move(ctx, owner, func(state State, now time.Time) State {
		return state.Join(device).Seek(state.PositionAtTime(now), now)
	})
}

// Leave takes a device out. The rest carry on without it.
func (s *Service) Leave(ctx context.Context, owner, device string) (State, error) {
	return s.order(ctx, owner, func(state State, _ time.Time) State {
		return state.Leave(device)
	}, func(ctx context.Context, before, after State) ([]string, error) {
		if !before.Plays(device) {
			return nil, nil
		}
		if err := s.out.Pause(ctx, owner, device); err != nil && !errors.Is(err, ErrNoDevice) {
			slog.Warn("the device playback left did not stop", "device", device, "error", err)
		}
		return nil, nil
	})
}

// SavePosition is a device reporting where it has got to. It takes the same
// lock as every order, because a report landing beside one would otherwise
// write back the list and the mode it read before that order changed them. A
// device reporting a track the record is not on is stale and says nothing.
func (s *Service) SavePosition(owner, trackID string, position float64) error {
	defer s.hold(owner)()

	state, err := s.store.Load(owner)
	if err != nil {
		return err
	}
	if state.Track == "" || state.Track != trackID {
		return nil
	}

	state.Position = position
	state.PositionAt = s.now()
	return s.store.Save(owner, state)
}

func (s *Service) playing(owner string) drive {
	return s.reach(owner, func(ctx context.Context, device string, state State) error {
		if !state.Playing {
			return s.out.Pause(ctx, owner, device)
		}
		return s.out.Play(ctx, owner, device, state.Track, state.Position)
	})
}

// reach sends one order to every device the sound comes out of. A device that
// has gone is reported so that it can leave the set; one that refuses for its
// own reasons does not stop the others from playing.
func (s *Service) reach(owner string, send func(context.Context, string, State) error) drive {
	return func(ctx context.Context, _, after State) ([]string, error) {
		if after.Track == "" {
			return nil, nil
		}
		if len(after.Devices) == 0 {
			if after.Playing {
				return nil, ErrNowhereToPlay
			}
			return nil, nil
		}

		var gone []string
		var refused error
		heard := 0
		for _, device := range after.Devices {
			switch err := send(ctx, device, after); {
			case err == nil:
				heard++
			case errors.Is(err, ErrNoDevice):
				gone = append(gone, device)
			default:
				refused = err
			}
		}

		if heard == 0 {
			if refused == nil {
				refused = ErrNowhereToPlay
			}
			return gone, refused
		}
		if refused != nil {
			slog.Warn("a device refused an order the others took", "owner", owner, "error", refused)
		}
		return gone, nil
	}
}

type change func(State, time.Time) State

type drive func(ctx context.Context, before, after State) (gone []string, err error)

func (s *Service) order(ctx context.Context, owner string, apply change, send drive) (State, error) {
	defer s.hold(owner)()

	state, err := s.store.Load(owner)
	if err != nil {
		return State{}, err
	}

	next := s.stock(ctx, owner, apply(state, s.now()))
	if err := s.store.Save(owner, next); err != nil {
		return State{}, err
	}

	sent := next
	gone, sendErr := send(ctx, state, next)
	for _, device := range gone {
		next = next.Leave(device)
	}
	if len(next.Devices) == 0 || sendErr != nil {
		next = next.Pause(s.now())
	}

	if next.Playing != sent.Playing || len(next.Devices) != len(sent.Devices) {
		if err := s.store.Save(owner, next); err != nil {
			return State{}, err
		}
	}
	return next, sendErr
}

// move is an order that changes where the sound comes out. What was playing
// carries on, so the devices that are new to the set are told to play and the
// ones that have left are stopped.
func (s *Service) move(ctx context.Context, owner string, apply change) (State, error) {
	return s.order(ctx, owner, apply, func(ctx context.Context, before, after State) ([]string, error) {
		for _, device := range before.Devices {
			if after.Plays(device) {
				continue
			}
			if err := s.out.Pause(ctx, owner, device); err != nil && !errors.Is(err, ErrNoDevice) {
				slog.Warn("the device playback moved off did not stop", "device", device, "error", err)
			}
		}
		if !after.Playing {
			return nil, nil
		}
		return s.playing(owner)(ctx, before, after)
	})
}

func (s *Service) quiet(ctx context.Context, owner string, apply change) (State, error) {
	defer s.hold(owner)()

	state, err := s.store.Load(owner)
	if err != nil {
		return State{}, err
	}

	next := s.stock(ctx, owner, apply(state, s.now()))
	if err := s.store.Save(owner, next); err != nil {
		return State{}, err
	}
	return next, nil
}

// stock tops the list up when the playhead is running out of it. A list that
// repeats never runs out, so it is left alone.
func (s *Service) stock(ctx context.Context, owner string, state State) State {
	if s.more == nil || state.Track == "" || state.Repeat == RepeatAll {
		return state
	}
	short := keepAhead - state.Ahead()
	if short <= 0 {
		return state
	}

	found, err := s.more.More(ctx, owner, state.List, short)
	if err != nil {
		slog.Warn("the list could not be extended", "owner", owner, "error", err)
		return state
	}
	return state.Extend(found, short)
}

// hold serialises the orders of one user, so that two arriving together do not
// each read the record before the other writes it.
func (s *Service) hold(owner string) func() {
	s.mu.Lock()
	lock, ok := s.locks[owner]
	if !ok {
		lock = &sync.Mutex{}
		s.locks[owner] = lock
	}
	s.mu.Unlock()

	lock.Lock()
	return lock.Unlock
}
