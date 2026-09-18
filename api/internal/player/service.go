package player

import (
	"context"
	"errors"
	"log/slog"
	"math/rand/v2"
	"sync"
	"time"
)

// ErrNoDevice is the record naming somewhere to play that is not there any
// more. The record forgets it rather than keeping a name every later order
// would fail on.
var ErrNoDevice = errors.New("device not found")

// Output carries an order to whatever the sound comes out of. Resume and Play
// both name the track and the position on purpose: a device that has been
// sitting idle may no longer hold anything it can carry on with, and only the
// caller can tell it what it was supposed to be playing.
type Output interface {
	Play(ctx context.Context, owner, device, trackID string, position float64) error
	Resume(ctx context.Context, owner, device, trackID string, position float64) error
	Pause(ctx context.Context, owner, device string) error
	Seek(ctx context.Context, owner, device string, position float64) error
}

// Records is where the playback record lives.
type Records interface {
	Load(owner string) (State, error)
	Save(owner string, state State) error
}

// Service owns what each user is playing.
type Service struct {
	store   Records
	out     Output
	shuffle Shuffler
	now     func() time.Time

	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func NewService(store Records, out Output) *Service {
	return &Service{
		store:   store,
		out:     out,
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

// Play starts a track. A queue, when given, replaces the one in place, so that
// playing from an album carries the album with it in a single order.
func (s *Service) Play(ctx context.Context, owner, trackID string, queue []string) (State, error) {
	return s.order(ctx, owner, func(state State, now time.Time) State {
		if len(queue) > 0 {
			return state.PlayFrom(queue, trackID, now, s.shuffle)
		}
		return state.Play(trackID, now)
	}, s.playing(owner))
}

// Resume carries on with what was already loaded.
func (s *Service) Resume(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Resume, func(ctx context.Context, _, state State) error {
		return s.out.Resume(ctx, owner, state.Device, state.Track, state.Position)
	})
}

// Pause stops without forgetting where it got to.
func (s *Service) Pause(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Pause, func(ctx context.Context, _, state State) error {
		return s.out.Pause(ctx, owner, state.Device)
	})
}

// Next is the listener asking for the track after this one.
func (s *Service) Next(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Next, s.playing(owner))
}

// Previous steps back through the queue.
func (s *Service) Previous(ctx context.Context, owner string) (State, error) {
	return s.order(ctx, owner, State.Previous, s.playing(owner))
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
	}, func(ctx context.Context, _, state State) error {
		return s.out.Seek(ctx, owner, state.Device, state.Position)
	})
}

// SetQueue replaces what is queued.
func (s *Service) SetQueue(ctx context.Context, owner string, queue []string) (State, error) {
	return s.quiet(owner, func(state State, _ time.Time) State {
		return state.SetQueue(queue, s.shuffle)
	})
}

// Append adds tracks after everything already queued.
func (s *Service) Append(ctx context.Context, owner string, tracks []string) (State, error) {
	return s.quiet(owner, func(state State, _ time.Time) State {
		return state.Append(tracks)
	})
}

// Remove drops a track from the queue, which moves the playhead when the track
// dropped is the one being played.
func (s *Service) Remove(ctx context.Context, owner, trackID string) (State, error) {
	return s.order(ctx, owner, func(state State, now time.Time) State {
		return state.Remove(trackID, now)
	}, func(ctx context.Context, before, after State) error {
		if !after.Playing || after.Track == before.Track {
			return nil
		}
		return s.playing(owner)(ctx, before, after)
	})
}

// Clear empties the queue without stopping what is playing.
func (s *Service) Clear(ctx context.Context, owner string) (State, error) {
	return s.quiet(owner, func(state State, _ time.Time) State { return state.Clear() })
}

// SetShuffle turns shuffling on or off.
func (s *Service) SetShuffle(ctx context.Context, owner string, on bool) (State, error) {
	return s.quiet(owner, func(state State, _ time.Time) State {
		return state.SetShuffle(on, s.shuffle)
	})
}

// SetRepeat says what happens when the queue runs out.
func (s *Service) SetRepeat(ctx context.Context, owner string, repeat Repeat) (State, error) {
	return s.quiet(owner, func(state State, _ time.Time) State {
		return state.SetRepeat(repeat)
	})
}

// On moves playback to a device, picking it up where it was left.
func (s *Service) On(ctx context.Context, owner, device string) (State, error) {
	return s.order(ctx, owner, func(state State, now time.Time) State {
		position := state.PositionAtTime(now)
		return state.On(device).Seek(position, now)
	}, func(ctx context.Context, before, after State) error {
		if before.Device != "" && before.Device != after.Device && before.Playing {
			if err := s.out.Pause(ctx, owner, before.Device); err != nil {
				slog.Warn("the device playback moved off did not stop", "device", before.Device, "error", err)
			}
		}
		if !after.Playing {
			return nil
		}
		return s.playing(owner)(ctx, before, after)
	})
}

func (s *Service) playing(owner string) drive {
	return func(ctx context.Context, _, state State) error {
		if state.Track == "" {
			return nil
		}
		if !state.Playing {
			return s.out.Pause(ctx, owner, state.Device)
		}
		return s.out.Play(ctx, owner, state.Device, state.Track, state.Position)
	}
}

type change func(State, time.Time) State

type drive func(ctx context.Context, before, after State) error

func (s *Service) order(ctx context.Context, owner string, apply change, send drive) (State, error) {
	defer s.hold(owner)()

	state, err := s.store.Load(owner)
	if err != nil {
		return State{}, err
	}

	next := apply(state, s.now())
	if err := s.store.Save(owner, next); err != nil {
		return State{}, err
	}

	if err := send(ctx, state, next); err != nil {
		stopped := next.Pause(s.now())
		if errors.Is(err, ErrNoDevice) {
			stopped = stopped.On("")
		}
		if saveErr := s.store.Save(owner, stopped); saveErr != nil {
			return State{}, saveErr
		}
		return stopped, err
	}
	return next, nil
}

func (s *Service) quiet(owner string, apply change) (State, error) {
	defer s.hold(owner)()

	state, err := s.store.Load(owner)
	if err != nil {
		return State{}, err
	}

	next := apply(state, s.now())
	if err := s.store.Save(owner, next); err != nil {
		return State{}, err
	}
	return next, nil
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

// SavePosition is a device reporting where it has got to. It takes the same
// lock as every order, because a poll landing beside one would otherwise write
// back the queue and the mode it read before that order changed them. A device
// reporting a track the record is not on is stale, and says nothing.
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
