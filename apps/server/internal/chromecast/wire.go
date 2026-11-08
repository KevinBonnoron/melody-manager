// Package chromecast discovers and controls Chromecast devices over mDNS and CASTV2.
package chromecast

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	nsConnection = "urn:x-cast:com.google.cast.tp.connection"
	nsHeartbeat  = "urn:x-cast:com.google.cast.tp.heartbeat"
	nsReceiver   = "urn:x-cast:com.google.cast.receiver"
	nsMedia      = "urn:x-cast:com.google.cast.media"
)

const defaultReceiver = "CC1AD845"

type message struct {
	source      string
	destination string
	namespace   string
	payload     string
}

const (
	fieldProtocolVersion = 1
	fieldSource          = 2
	fieldDestination     = 3
	fieldNamespace       = 4
	fieldPayloadType     = 5
	fieldPayloadUTF8     = 6

	wireVarint = 0
	wireBytes  = 2
)

func (m message) encode() []byte {
	var out []byte
	out = appendVarintField(out, fieldProtocolVersion, 0)
	out = appendStringField(out, fieldSource, m.source)
	out = appendStringField(out, fieldDestination, m.destination)
	out = appendStringField(out, fieldNamespace, m.namespace)
	out = appendVarintField(out, fieldPayloadType, 0)
	out = appendStringField(out, fieldPayloadUTF8, m.payload)
	return out
}

func appendVarintField(dst []byte, field int, value uint64) []byte {
	dst = binary.AppendUvarint(dst, uint64(field)<<3|wireVarint)
	return binary.AppendUvarint(dst, value)
}

func appendStringField(dst []byte, field int, value string) []byte {
	dst = binary.AppendUvarint(dst, uint64(field)<<3|wireBytes)
	dst = binary.AppendUvarint(dst, uint64(len(value)))
	return append(dst, value...)
}

var errMalformed = errors.New("chromecast: malformed message")

func decode(buf []byte) (message, error) {
	var m message
	for len(buf) > 0 {
		tag, n := binary.Uvarint(buf)
		if n <= 0 {
			return message{}, errMalformed
		}
		buf = buf[n:]

		field, wire := int(tag>>3), int(tag&7)
		switch wire {
		case wireVarint:
			_, n := binary.Uvarint(buf)
			if n <= 0 {
				return message{}, errMalformed
			}
			buf = buf[n:]
		case wireBytes:
			size, n := binary.Uvarint(buf)
			if n <= 0 || uint64(len(buf[n:])) < size {
				return message{}, errMalformed
			}
			value := string(buf[n : n+int(size)])
			buf = buf[n+int(size):]
			switch field {
			case fieldSource:
				m.source = value
			case fieldDestination:
				m.destination = value
			case fieldNamespace:
				m.namespace = value
			case fieldPayloadUTF8:
				m.payload = value
			}
		default:
			return message{}, fmt.Errorf("%w: wire type %d", errMalformed, wire)
		}
	}
	return m, nil
}

const maxFrame = 1 << 20

func writeFrame(w io.Writer, m message) error {
	body := m.encode()
	frame := make([]byte, 4, 4+len(body))
	binary.BigEndian.PutUint32(frame, uint32(len(body)))
	frame = append(frame, body...)
	_, err := w.Write(frame)
	return err
}

func readFrame(r io.Reader) (message, error) {
	var header [4]byte
	if _, err := io.ReadFull(r, header[:]); err != nil {
		return message{}, err
	}

	size := binary.BigEndian.Uint32(header[:])
	if size > maxFrame {
		return message{}, fmt.Errorf("%w: frame of %d bytes", errMalformed, size)
	}

	body := make([]byte, size)
	if _, err := io.ReadFull(r, body); err != nil {
		return message{}, err
	}
	return decode(body)
}
