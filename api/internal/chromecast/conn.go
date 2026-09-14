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

// controlPort is a var, not a const, only so a test can point the client at a
// receiver of its own on a port the operating system picked. Nothing else moves
// it: every Chromecast listens on 8009.
var controlPort = "8009"

const (
	dialTimeout  = 5 * time.Second
	replyTimeout = 5 * time.Second
	// A device drops a sender that stops pinging. Five seconds is what Google's
	// own senders use.
	heartbeatEvery = 5 * time.Second

	senderID   = "sender-0"
	receiverID = "receiver-0"
)

// conn is one open session with one device. A Sonos is asked a question over a
// fresh HTTP request every time; a Chromecast expects a connection that is
// opened, greeted, kept alive, and remembered, because the app it launches and
// the media session inside that app are both identified by ids it hands back
// only once.
type conn struct {
	address string
	tls     *tls.Conn

	mu           sync.Mutex
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
	dialer := &net.Dialer{Timeout: dialTimeout}
	// A Chromecast presents a certificate signed by Google's device authority,
	// for a name that is not its address. There is nothing here to verify it
	// against, and the link carries a URL to a track, not a secret: the check
	// that matters is whether an admin agreed to this address at all, and that
	// one happens before we get here.
	socket, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(address, controlPort), &tls.Config{InsecureSkipVerify: true})
	if err != nil {
		return nil, err
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

// ask sends a request and waits for the answer carrying the same requestId. A
// device answers out of order and also volunteers status nobody asked for, so
// the id is the only thing tying a reply to its question.
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
		return answer, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.done:
		return nil, errors.New("chromecast: the connection closed while waiting")
	case <-time.After(replyTimeout):
		return nil, fmt.Errorf("chromecast: %s did not answer", payload["type"])
	}
}

func (c *conn) read() {
	defer c.Close()
	for {
		// No read deadline: between two commands a device says nothing for
		// minutes at a time, and the heartbeat is what notices a dead link.
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
		if json.Unmarshal([]byte(m.payload), &beat) == nil && beat.Type == "PING" {
			_ = c.send(nsHeartbeat, m.source, map[string]any{"type": "PONG"})
		}
		return
	}

	var head struct {
		RequestID int    `json:"requestId"`
		Type      string `json:"type"`
	}
	_ = json.Unmarshal([]byte(m.payload), &head)

	// Status arrives both as an answer and unprompted, whenever somebody else
	// touches the device. Both are worth keeping: it is where the position, the
	// transport state and the volume come from.
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
	// The receiver we launched is gone, so the media session inside it is too.
	// Holding the ids would have the next command addressed to an app that has
	// closed, which a device answers by saying nothing at all.
	c.transport = ""
	c.mediaSession = 0
}

func (c *conn) beat() {
	ticker := time.NewTicker(heartbeatEvery)
	defer ticker.Stop()
	for {
		select {
		case <-c.done:
			return
		case <-ticker.C:
			if err := c.send(nsHeartbeat, receiverID, map[string]any{"type": "PING"}); err != nil {
				c.Close()
				return
			}
		}
	}
}
