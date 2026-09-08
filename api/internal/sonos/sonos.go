// Package sonos discovers and controls Sonos players over SSDP + UPnP/SOAP
// (replacing the @svrooij/sonos npm lib). Control port is 1400.
package sonos

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Player is a discovered Sonos device.
type Player struct {
	IP   string
	Name string
	UUID string
}

var (
	locationRe = regexp.MustCompile(`(?i)LOCATION:\s*(\S+)`)
	roomRe     = regexp.MustCompile(`(?is)<roomName>(.*?)</roomName>`)
	udnRe      = regexp.MustCompile(`(?is)<UDN>(.*?)</UDN>`)
	tagRe      = func(tag string) *regexp.Regexp { return regexp.MustCompile(`(?is)<` + tag + `>(.*?)</` + tag + `>`) }
)

// Discover broadcasts an SSDP M-SEARCH and returns the Sonos players that reply.
func Discover(ctx context.Context, timeout time.Duration) []Player {
	conn, err := net.ListenPacket("udp4", ":0")
	if err != nil {
		return nil
	}
	defer conn.Close()

	dst, err := net.ResolveUDPAddr("udp4", "239.255.255.250:1900")
	if err != nil {
		return nil
	}
	msg := "M-SEARCH * HTTP/1.1\r\n" +
		"HOST: 239.255.255.250:1900\r\n" +
		"MAN: \"ssdp:discover\"\r\n" +
		"MX: 1\r\n" +
		"ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n"
	if _, err := conn.WriteTo([]byte(msg), dst); err != nil {
		return nil
	}
	_ = conn.SetReadDeadline(time.Now().Add(timeout))

	seen := map[string]bool{}
	var players []Player
	buf := make([]byte, 2048)
	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}
		m := locationRe.FindStringSubmatch(string(buf[:n]))
		if m == nil {
			continue
		}
		loc, err := url.Parse(m[1])
		if err != nil {
			continue
		}
		// [^:/] used to swallow the CRLF and the rest of the SSDP packet, and
		// mangled IPv6 literals, yielding a host that url.Parse then rejected.
		ip := loc.Hostname()
		if ip == "" || seen[ip] {
			continue
		}
		seen[ip] = true
		players = append(players, describe(ctx, ip))
	}
	return players
}

// sonosClient bounds every call to a speaker. A device that answers SSDP and
// then black-holes TCP would otherwise hang the caller forever.
var sonosClient = &http.Client{Timeout: 5 * time.Second}

func describe(ctx context.Context, ip string) Player {
	p := Player{IP: ip, Name: "Sonos"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+ip+":1400/xml/device_description.xml", nil)
	if err != nil {
		return p
	}
	res, err := sonosClient.Do(req)
	if err != nil {
		return p
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if m := roomRe.FindStringSubmatch(string(body)); m != nil {
		p.Name = strings.TrimSpace(m[1])
	}
	if m := udnRe.FindStringSubmatch(string(body)); m != nil {
		p.UUID = strings.TrimSpace(m[1])
	}
	return p
}

func soap(ctx context.Context, ip, service, action, inner string) (string, error) {
	serviceType := "urn:schemas-upnp-org:service:" + service + ":1"
	envelope := `<?xml version="1.0" encoding="utf-8"?>` +
		`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
		`<s:Body><u:` + action + ` xmlns:u="` + serviceType + `">` + inner + `</u:` + action + `></s:Body></s:Envelope>`

	url := "http://" + ip + ":1400/MediaRenderer/" + service + "/Control"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(envelope))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", `text/xml; charset="utf-8"`)
	req.Header.Set("SOAPACTION", `"`+serviceType+`#`+action+`"`)
	res, err := sonosClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("sonos %s.%s: status %d", service, action, res.StatusCode)
	}
	return string(body), nil
}

func av(ctx context.Context, ip, action, inner string) error {
	_, err := soap(ctx, ip, "AVTransport", action, inner)
	return err
}

// Play / Pause / Stop / Next / Previous.
func Play(ctx context.Context, ip string) error {
	return av(ctx, ip, "Play", `<InstanceID>0</InstanceID><Speed>1</Speed>`)
}
func Pause(ctx context.Context, ip string) error {
	return av(ctx, ip, "Pause", `<InstanceID>0</InstanceID>`)
}
func Stop(ctx context.Context, ip string) error {
	return av(ctx, ip, "Stop", `<InstanceID>0</InstanceID>`)
}
func Next(ctx context.Context, ip string) error {
	return av(ctx, ip, "Next", `<InstanceID>0</InstanceID>`)
}
func Previous(ctx context.Context, ip string) error {
	return av(ctx, ip, "Previous", `<InstanceID>0</InstanceID>`)
}

// Seek to position (seconds).
func Seek(ctx context.Context, ip string, seconds int) error {
	return av(ctx, ip, "Seek", `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>`+hms(seconds)+`</Target>`)
}

// SetVolume (0-100).
func SetVolume(ctx context.Context, ip string, volume int) error {
	if volume < 0 {
		volume = 0
	} else if volume > 100 {
		volume = 100
	}
	_, err := soap(ctx, ip, "RenderingControl", "SetVolume",
		fmt.Sprintf(`<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>%d</DesiredVolume>`, volume))
	return err
}

// GetVolume returns the current master volume.
func GetVolume(ctx context.Context, ip string) int {
	body, err := soap(ctx, ip, "RenderingControl", "GetVolume", `<InstanceID>0</InstanceID><Channel>Master</Channel>`)
	if err != nil {
		return 0
	}
	if m := tagRe("CurrentVolume").FindStringSubmatch(body); m != nil {
		return atoiSafe(m[1])
	}
	return 0
}

// GetState returns the transport state (PLAYING, PAUSED_PLAYBACK, STOPPED…).
func GetState(ctx context.Context, ip string) string {
	body, err := soap(ctx, ip, "AVTransport", "GetTransportInfo", `<InstanceID>0</InstanceID>`)
	if err != nil {
		return "UNKNOWN"
	}
	if m := tagRe("CurrentTransportState").FindStringSubmatch(body); m != nil {
		return strings.TrimSpace(m[1])
	}
	return "UNKNOWN"
}

// PlayURL sets the transport URI (with DIDL metadata) and starts playback.
func PlayURL(ctx context.Context, ip, trackURL, mimeType, title, artist, album string, duration int) error {
	didl := didlLite(trackURL, mimeType, title, artist, album, duration)
	inner := `<InstanceID>0</InstanceID><CurrentURI>` + xmlEscape(trackURL) + `</CurrentURI><CurrentURIMetaData>` + xmlEscape(didl) + `</CurrentURIMetaData>`
	if err := av(ctx, ip, "SetAVTransportURI", inner); err != nil {
		return err
	}
	return Play(ctx, ip)
}

// AddToQueue / ClearQueue.
func AddToQueue(ctx context.Context, ip, trackURL string) error {
	return av(ctx, ip, "AddURIToQueue", `<InstanceID>0</InstanceID><EnqueuedURI>`+xmlEscape(trackURL)+`</EnqueuedURI><EnqueuedURIMetaData></EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext>`)
}
func ClearQueue(ctx context.Context, ip string) error {
	return av(ctx, ip, "RemoveAllTracksFromQueue", `<InstanceID>0</InstanceID>`)
}

func didlLite(url, mime, title, artist, album string, duration int) string {
	dur := ""
	if duration > 0 {
		dur = ` duration="` + hms(duration) + `"`
	}
	return `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">` +
		`<item id="-1" parentID="-1" restricted="true">` +
		`<dc:title>` + xmlEscape(title) + `</dc:title>` +
		`<dc:creator>` + xmlEscape(artist) + `</dc:creator>` +
		`<upnp:album>` + xmlEscape(album) + `</upnp:album>` +
		`<upnp:class>object.item.audioItem.musicTrack</upnp:class>` +
		`<res protocolInfo="http-get:*:` + mime + `:*"` + dur + `>` + xmlEscape(url) + `</res>` +
		`</item></DIDL-Lite>`
}

func hms(seconds int) string {
	return fmt.Sprintf("%02d:%02d:%02d", seconds/3600, (seconds%3600)/60, seconds%60)
}

func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;")
	return r.Replace(s)
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range strings.TrimSpace(s) {
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
}
