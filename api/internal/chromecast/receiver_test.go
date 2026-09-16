package chromecast

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"math/big"
	"net"
	"sync"
	"testing"
	"time"
)

type fakeReceiver struct {
	t        *testing.T
	listener net.Listener

	mu       sync.Mutex
	senders  []net.Conn
	received []map[string]any
	volume   float64
	state    string
	position float64
	duration float64
	content  string
}

func startReceiver(t *testing.T) *fakeReceiver {
	t.Helper()

	listener, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{selfSigned(t)}})
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	r := &fakeReceiver{t: t, listener: listener, volume: 0.4, state: "IDLE"}

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("SplitHostPort: %v", err)
	}
	previous := controlPort
	controlPort = port
	t.Cleanup(func() {
		controlPort = previous
		_ = listener.Close()
	})

	go r.accept()
	return r
}

func (r *fakeReceiver) accept() {
	for {
		conn, err := r.listener.Accept()
		if err != nil {
			return
		}
		go r.serve(conn)
	}
}

func (r *fakeReceiver) serve(conn net.Conn) {
	defer func() { _ = conn.Close() }()
	r.mu.Lock()
	r.senders = append(r.senders, conn)
	r.mu.Unlock()

	for {
		m, err := readFrame(conn)
		if err != nil {
			return
		}

		var payload map[string]any
		if json.Unmarshal([]byte(m.payload), &payload) != nil {
			continue
		}

		r.mu.Lock()
		r.received = append(r.received, payload)
		r.mu.Unlock()

		reply, namespace := r.answer(m, payload)
		if reply == nil {
			continue
		}
		body, _ := json.Marshal(reply)
		_ = writeFrame(conn, message{source: "receiver-0", destination: m.source, namespace: namespace, payload: string(body)})
	}
}

func (r *fakeReceiver) answer(m message, payload map[string]any) (map[string]any, string) {
	kind, _ := payload["type"].(string)
	request := payload["requestId"]

	r.mu.Lock()
	defer r.mu.Unlock()

	switch {
	case m.namespace == nsHeartbeat && kind == "PING":
		return map[string]any{"type": "PONG"}, nsHeartbeat

	case m.namespace == nsReceiver && kind == "LAUNCH":
		return r.receiverStatus(request), nsReceiver

	case m.namespace == nsReceiver && kind == "GET_STATUS":
		return r.receiverStatus(request), nsReceiver

	case m.namespace == nsReceiver && kind == "SET_VOLUME":
		if volume, ok := payload["volume"].(map[string]any); ok {
			if level, ok := volume["level"].(float64); ok {
				r.volume = level
			}
		}
		return r.receiverStatus(request), nsReceiver

	case m.namespace == nsMedia && kind == "LOAD":
		if media, ok := payload["media"].(map[string]any); ok {
			r.content, _ = media["contentId"].(string)
			r.duration, _ = media["duration"].(float64)
		}
		r.state = "PLAYING"
		return r.mediaStatus(request), nsMedia

	case m.namespace == nsMedia && kind == "PAUSE":
		r.state = "PAUSED"
		return r.mediaStatus(request), nsMedia

	case m.namespace == nsMedia && kind == "PLAY":
		r.state = "PLAYING"
		return r.mediaStatus(request), nsMedia

	case m.namespace == nsMedia && kind == "SEEK":
		if at, ok := payload["currentTime"].(float64); ok {
			r.position = at
		}
		return r.mediaStatus(request), nsMedia

	case m.namespace == nsMedia && kind == "GET_STATUS":
		return r.mediaStatus(request), nsMedia
	}
	return nil, ""
}

func (r *fakeReceiver) receiverStatus(request any) map[string]any {
	return map[string]any{
		"type":      "RECEIVER_STATUS",
		"requestId": request,
		"status": map[string]any{
			"volume":       map[string]any{"level": r.volume, "muted": false},
			"applications": []any{map[string]any{"appId": defaultReceiver, "transportId": "web-1"}},
		},
	}
}

func (r *fakeReceiver) mediaStatus(request any) map[string]any {
	return map[string]any{
		"type":      "MEDIA_STATUS",
		"requestId": request,
		"status": []any{map[string]any{
			"mediaSessionId": 7,
			"playerState":    r.state,
			"currentTime":    r.position,
			"media":          map[string]any{"contentId": r.content, "duration": r.duration},
		}},
	}
}

func (r *fakeReceiver) sent(kind string) map[string]any {
	r.t.Helper()
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, payload := range r.received {
		if payload["type"] == kind {
			return payload
		}
	}
	return nil
}

func (r *fakeReceiver) ping() {
	r.say(nsHeartbeat, map[string]any{"type": "PING"})
}

func (r *fakeReceiver) announceVolume(level float64) {
	r.mu.Lock()
	r.volume = level
	status := r.receiverStatus(nil)
	r.mu.Unlock()
	delete(status, "requestId")
	r.say(nsReceiver, status)
}

func (r *fakeReceiver) say(namespace string, payload map[string]any) {
	body, _ := json.Marshal(payload)
	r.mu.Lock()
	senders := append([]net.Conn(nil), r.senders...)
	r.mu.Unlock()
	for _, conn := range senders {
		_ = writeFrame(conn, message{source: "receiver-0", destination: senderID, namespace: namespace, payload: string(body)})
	}
}

func selfSigned(t *testing.T) tls.Certificate {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "fake chromecast"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("CreateCertificate: %v", err)
	}
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}
}
