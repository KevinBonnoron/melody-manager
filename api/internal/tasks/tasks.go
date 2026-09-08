// Package tasks is the in-memory background-job tracker (import, download,
// enrich, scan), surfaced over SSE. Not persisted — lost on restart, matching
// the original server's behaviour.
package tasks

import (
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

type Status string

const (
	Pending   Status = "pending"
	Running   Status = "running"
	Completed Status = "completed"
	Failed    Status = "failed"
)

// Task is a tracked background job.
type Task struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Status   Status `json:"status"`
	Progress int    `json:"progress"`
	Error    string `json:"error,omitempty"`
	Created  int64  `json:"created"`
}

// Service tracks tasks and notifies subscribers of changes.
type Service struct {
	mu      sync.RWMutex
	tasks   map[string]*Task
	subs    map[int]chan Task
	nextSub int
	counter atomic.Uint64
}

// New creates an empty task service.
func New() *Service {
	return &Service{tasks: map[string]*Task{}, subs: map[int]chan Task{}}
}

// Create registers a new pending task and returns it.
func (s *Service) Create(typ, name string) *Task {
	id := fmt.Sprintf("task_%d_%d", time.Now().UnixNano(), s.counter.Add(1))
	t := &Task{ID: id, Type: typ, Name: name, Status: Pending, Created: time.Now().UnixMilli()}
	s.mu.Lock()
	s.tasks[id] = t
	s.mu.Unlock()
	s.notify(*t)
	return t
}

// Update mutates a task under lock and notifies subscribers.
func (s *Service) Update(id string, fn func(*Task)) {
	s.mu.Lock()
	t, ok := s.tasks[id]
	if ok {
		fn(t)
	}
	var snap Task
	if ok {
		snap = *t
	}
	s.mu.Unlock()
	if ok {
		s.notify(snap)
	}
}

// List returns a snapshot of all tasks.
func (s *Service) List() []Task {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Task, 0, len(s.tasks))
	for _, t := range s.tasks {
		out = append(out, *t)
	}
	return out
}

// ClearCompleted removes completed/failed tasks.
func (s *Service) ClearCompleted() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, t := range s.tasks {
		if t.Status == Completed || t.Status == Failed {
			delete(s.tasks, id)
		}
	}
}

// Subscribe returns a channel of task updates and an unsubscribe func.
func (s *Service) Subscribe() (<-chan Task, func()) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.nextSub
	s.nextSub++
	ch := make(chan Task, 32)
	s.subs[id] = ch
	return ch, func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if c, ok := s.subs[id]; ok {
			close(c)
			delete(s.subs, id)
		}
	}
}

func (s *Service) notify(t Task) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, ch := range s.subs {
		select {
		case ch <- t:
		default:
		}
	}
}
