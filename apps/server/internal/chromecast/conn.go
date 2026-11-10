package chromecast

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"sync"
	"time"
)

var controlPort = "8009"

const (
	dialTimeout    = 5 * time.Second
	replyTimeout   = 5 * time.Second
	heartbeatEvery = 5 * time.Second

	senderID   = "sender-0"
	receiverID = "receiver-0"
)

type conn struct {
	address string
	tls     *tls.Conn

	mu           sync.Mutex
	awaitingPong bool
	nextRequest  int
	pending      map[int]chan json.RawMessage
	transport    string
	mediaSession int
	lastStatus   mediaStatus
	lastVolume   float64
	closed       bool

	done chan struct{}
}

type mediaStatus struct {
	State        string  `json:"playerState"`
	CurrentTime  float64 `json:"currentTime"`
	MediaSession int     `json:"mediaSessionId"`
	Media        struct {
		ContentID string  `json:"contentId"`
		Duration  float64 `json:"duration"`
	} `json:"media"`
}

func dial(ctx context.Context, address string) (*conn, error) {
	ctx, cancel := context.WithTimeout(ctx, dialTimeout)
	defer cancel()

	dialer := &tls.Dialer{Config: &tls.Config{InsecureSkipVerify: true}}
	dialed, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(address, controlPort))
	if err != nil {
		return nil, err
	}
	socket, ok := dialed.(*tls.Conn)
	if !ok {
		_ = dialed.Close()
		return nil, errors.New("chromecast: the dialler returned something other than a TLS connection")
	}

	c := &conn{
		address: address,
		tls:     socket,
		pending: map[int]chan json.RawMessage{},
		done:    make(chan struct{}),
	}

	if err := c.send(nsConnection, receiverID, map[string]any{"type": "CONNECT"}); err != nil {
		_ = socket.Close()
		return nil, err
	}

	go c.read()
	go c.beat()
	return c, nil
}

func (c *conn) Close() {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return
	}
	c.closed = true
	c.mu.Unlock()

	close(c.done)
	_ = c.tls.Close()
}

func (c *conn) send(namespace, destination string, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return errors.New("chromecast: the connection is closed")
	}
	_ = c.tls.SetWriteDeadline(time.Now().Add(replyTimeout))
	return writeFrame(c.tls, message{source: senderID, destination: destination, namespace: namespace, payload: string(body)})
}

func (c *conn) ask(ctx context.Context, namespace, destination string, payload map[string]any) (json.RawMessage, error) {
	c.mu.Lock()
	c.nextRequest++
	id := c.nextRequest
	reply := make(chan json.RawMessage, 1)
	c.pending[id] = reply
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
	}()

	payload["requestId"] = id
	if err := c.send(namespace, destination, payload); err != nil {
		return nil, err
	}

	select {
	case answer := <-reply:
		return answer, castError(answer)
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.done:
		return nil, errors.New("chromecast: the connection closed while waiting")
	case <-time.After(replyTimeout):
		return nil, fmt.Errorf("chromecast: %s did not answer", payload["type"])
	}
}

func castError(payload json.RawMessage) error {
	var answer struct {
		Type   string `json:"type"`
		Reason string `json:"reason"`
	}
	if json.Unmarshal(payload, &answer) != nil {
		return nil
	}

	switch answer.Type {
	case "INVALID_REQUEST", "INVALID_PLAYER_STATE", "LOAD_FAILED", "LOAD_CANCELLED", "ERROR":
		if answer.Reason != "" {
			return fmt.Errorf("chromecast: %s (%s)", answer.Type, answer.Reason)
		}
		return fmt.Errorf("chromecast: %s", answer.Type)
	}
	return nil
}

func (c *conn) read() {
	defer c.Close()
	for {
		_ = c.tls.SetReadDeadline(time.Time{})
		m, err := readFrame(c.tls)
		if err != nil {
			return
		}
		c.dispatch(m)
	}
}

func (c *conn) dispatch(m message) {
	if m.namespace == nsHeartbeat {
		var beat struct {
			Type string `json:"type"`
		}
		if json.Unmarshal([]byte(m.payload), &beat) == nil {
			switch beat.Type {
			case "PING":
				_ = c.send(nsHeartbeat, m.source, map[string]any{"type": "PONG"})
			case "PONG":
				c.mu.Lock()
				c.awaitingPong = false
				c.mu.Unlock()
			}
		}
		return
	}

	var head struct {
		RequestID int    `json:"requestId"`
		Type      string `json:"type"`
	}
	_ = json.Unmarshal([]byte(m.payload), &head)

	switch m.namespace {
	case nsMedia:
		c.rememberMedia(m.payload)
	case nsReceiver:
		c.rememberReceiver(m.payload)
	}

	if head.RequestID == 0 {
		return
	}

	c.mu.Lock()
	reply, waiting := c.pending[head.RequestID]
	c.mu.Unlock()
	if waiting {
		select {
		case reply <- json.RawMessage(m.payload):
		default:
		}
	}
}

func (c *conn) rememberMedia(payload string) {
	var envelope struct {
		Status []mediaStatus `json:"status"`
	}
	if json.Unmarshal([]byte(payload), &envelope) != nil || len(envelope.Status) == 0 {
		return
	}

	status := envelope.Status[0]
	c.mu.Lock()
	c.lastStatus = status
	if status.MediaSession != 0 {
		c.mediaSession = status.MediaSession
	}
	c.mu.Unlock()
}

func (c *conn) rememberReceiver(payload string) {
	var envelope struct {
		Status struct {
			Volume struct {
				Level float64 `json:"level"`
				Muted bool    `json:"muted"`
			} `json:"volume"`
			Applications []struct {
				AppID       string `json:"appId"`
				TransportID string `json:"transportId"`
			} `json:"applications"`
		} `json:"status"`
	}
	if json.Unmarshal([]byte(payload), &envelope) != nil {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastVolume = envelope.Status.Volume.Level
	if envelope.Status.Volume.Muted {
		c.lastVolume = 0
	}
	for _, app := range envelope.Status.Applications {
		if app.AppID == defaultReceiver {
			c.transport = app.TransportID
			return
		}
	}
	c.transport = ""
	c.mediaSession = 0
}

func (c *conn) beatOnce() bool {
	c.mu.Lock()
	unanswered := c.awaitingPong
	c.awaitingPong = true
	c.mu.Unlock()
	if unanswered {
		c.Close()
		return false
	}

	if err := c.send(nsHeartbeat, receiverID, map[string]any{"type": "PING"}); err != nil {
		c.Close()
		return false
	}
	return true
}

func (c *conn) beat() {
	ticker := time.NewTicker(heartbeatEvery)
	defer ticker.Stop()
	for {
		select {
		case <-c.done:
			return
		case <-ticker.C:
			if !c.beatOnce() {
				return
			}
		}
	}
}
