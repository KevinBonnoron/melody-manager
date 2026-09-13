package sonos

import (
	"strings"
	"testing"
)

// A Sonos Beam's own answer: only the http-get entries describe the transport
// we hand it a URL over, and x-file-cifs or sonos.com-http must not be read as
// support for a stream we serve ourselves.
const beamProtocolInfo = `<Sink>http-get:*:audio/mpeg:*,http-get:*:audio/mp3:*,x-file-cifs:*:audio/mpeg:*,` +
	`http-get:*:audio/flac:*,x-file-cifs:*:audio/flac:*,sonos.com-http:*:audio/mp4:*,` +
	`http-get:*:audio/wav:*,x-file-cifs:*:audio/x-ms-wma:*,http-get:*:application/ogg:*</Sink>`

func TestParseSink(t *testing.T) {
	mimes := parseSink(beamProtocolInfo)

	for _, want := range []string{"audio/mpeg", "audio/flac", "audio/wav", "application/ogg"} {
		if !mimes[want] {
			t.Errorf("parseSink did not report %q as accepted", want)
		}
	}
	if mimes["audio/x-ms-wma"] {
		t.Error("parseSink reported a x-file-cifs only type as accepted over http")
	}
	if mimes["audio/mp4"] {
		t.Error("parseSink reported a sonos.com-http only type as accepted over http")
	}
}

func TestParseSinkEmpty(t *testing.T) {
	if got := parseSink("<Sink></Sink>"); len(got) != 0 {
		t.Errorf("parseSink on an empty sink = %v, want nothing", got)
	}
}

// The speaker fetches the artwork itself from what the metadata names, so an
// absent cover has to leave the element out rather than name nothing.
func TestDidlLiteArtwork(t *testing.T) {
	with := didlLite(Track{URL: "http://host/s", MimeType: "audio/mpeg", Title: "T", ArtURL: "http://host/c.jpg?thumb=500x500"})
	if !strings.Contains(with, "<upnp:albumArtURI>http://host/c.jpg?thumb=500x500</upnp:albumArtURI>") {
		t.Errorf("artwork missing or unescaped: %s", with)
	}

	without := didlLite(Track{URL: "http://host/s", MimeType: "audio/mpeg", Title: "T"})
	if strings.Contains(without, "albumArtURI") {
		t.Errorf("an empty cover should name no element: %s", without)
	}
}
