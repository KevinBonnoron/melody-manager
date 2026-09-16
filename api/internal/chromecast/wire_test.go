package chromecast

import (
	"bytes"
	"strings"
	"testing"
)

func TestFrameRoundTrip(t *testing.T) {
	sent := message{
		source:      "sender-0",
		destination: "receiver-0",
		namespace:   nsReceiver,
		payload:     `{"type":"LAUNCH","appId":"CC1AD845","requestId":1}`,
	}

	var buf bytes.Buffer
	if err := writeFrame(&buf, sent); err != nil {
		t.Fatalf("writeFrame: %v", err)
	}

	got, err := readFrame(&buf)
	if err != nil {
		t.Fatalf("readFrame: %v", err)
	}
	if got != sent {
		t.Errorf("round trip lost something:\n got %+v\nwant %+v", got, sent)
	}
}

// The length prefix is four bytes big-endian, and everything after it is the message.
func TestFrameIsLengthPrefixedBigEndian(t *testing.T) {
	var buf bytes.Buffer
	if err := writeFrame(&buf, message{source: "a", destination: "b", namespace: "c", payload: "d"}); err != nil {
		t.Fatalf("writeFrame: %v", err)
	}

	frame := buf.Bytes()
	body := len(frame) - 4
	want := []byte{byte(body >> 24), byte(body >> 16), byte(body >> 8), byte(body)}
	if !bytes.Equal(frame[:4], want) {
		t.Errorf("length prefix = %v, want %v", frame[:4], want)
	}
}

func TestReadFrameRefusesAnAbsurdLength(t *testing.T) {
	_, err := readFrame(bytes.NewReader([]byte{0xff, 0xff, 0xff, 0xff}))
	if err == nil {
		t.Fatal("a frame claiming four gigabytes was accepted")
	}
	if !strings.Contains(err.Error(), "frame of") {
		t.Errorf("unhelpful error: %v", err)
	}
}

// Fields this sender never writes still arrive: a device answers with the binary payload field
// present and empty, and with fields added since.
func TestDecodeSkipsFieldsItDoesNotKnow(t *testing.T) {
	body := message{source: "sender-0", destination: "receiver-0", namespace: nsMedia, payload: "{}"}.encode()
	body = appendVarintField(body, 15, 42)
	body = appendStringField(body, 16, "something later")

	got, err := decode(body)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.namespace != nsMedia || got.payload != "{}" {
		t.Errorf("unexpected message: %+v", got)
	}
}

func TestDecodeRefusesATruncatedString(t *testing.T) {
	body := appendStringField(nil, fieldPayloadUTF8, "hello")
	if _, err := decode(body[:len(body)-2]); err == nil {
		t.Fatal("a truncated string was accepted")
	}
}
