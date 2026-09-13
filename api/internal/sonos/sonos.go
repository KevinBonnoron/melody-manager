// Package sonos discovers and controls Sonos players over SSDP + UPnP/SOAP
// (replacing the @svrooij/sonos npm lib). Control port is 1400.
package sonos

import (
	"context"
	"errors"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
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
		if player, ok := Describe(ctx, ip); ok {
			players = append(players, player)
		}
	}
	return players
}

// sonosClient bounds every call to a speaker. A device that answers SSDP and
// then black-holes TCP would otherwise hang the caller forever.
var sonosClient = &http.Client{Timeout: 5 * time.Second}

// Describe asks a speaker who it is. A Sonos that has stopped answering
// M-SEARCH, which they do, without warning, still serves this, so a known
// address can be confirmed without depending on discovery answering again.
func Describe(ctx context.Context, ip string) (Player, bool) {
	p := Player{IP: ip, Name: "Sonos"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+ip+":1400/xml/device_description.xml", nil)
	if err != nil {
		return p, false
	}
	res, err := sonosClient.Do(req)
	if err != nil {
		return p, false
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return p, false
	}

	body, _ := io.ReadAll(res.Body)
	if m := roomRe.FindStringSubmatch(string(body)); m != nil {
		p.Name = strings.TrimSpace(m[1])
	}
	if m := udnRe.FindStringSubmatch(string(body)); m != nil {
		p.UUID = strings.TrimSpace(m[1])
	}
	return p, p.UUID != ""
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
		return "", faultFrom(action, string(body), res.StatusCode)
	}
	return string(body), nil
}

// Fault is a refusal from the speaker itself, as opposed to a network failure.
// It carries the UPnP code so a caller can tell "nothing to resume" from "the
// speaker is unreachable" instead of reporting one opaque failure for both.
type Fault struct {
	Action      string
	Code        int
	Description string
}

func (f *Fault) Error() string {
	if f.Description != "" {
		return fmt.Sprintf("sonos %s: %s (UPnP %d)", f.Action, f.Description, f.Code)
	}
	return fmt.Sprintf("sonos %s: UPnP error %d", f.Action, f.Code)
}

// TransitionNotAvailable is what a speaker answers when asked to play with
// nothing loaded on it.
const TransitionNotAvailable = 701

var (
	faultCodePattern = regexp.MustCompile(`<errorCode>\s*(\d+)\s*</errorCode>`)
	faultDescPattern = regexp.MustCompile(`<errorDescription>([^<]*)</errorDescription>`)
)

// faultFrom pulls the UPnP error out of the SOAP body, which is where the
// speaker says what it actually objected to.
func faultFrom(action, body string, status int) error {
	fault := &Fault{Action: action}
	if m := faultCodePattern.FindStringSubmatch(body); m != nil {
		fault.Code, _ = strconv.Atoi(m[1])
	}
	if m := faultDescPattern.FindStringSubmatch(body); m != nil {
		fault.Description = strings.TrimSpace(m[1])
	}
	if fault.Code == 0 && fault.Description == "" {
		return fmt.Errorf("sonos %s: status %d", action, status)
	}
	return fault
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

// acceptedMimes caches what each speaker said it accepts. A player's codec
// support is fixed for as long as it is on the network, and asking costs a SOAP
// round trip on the path that starts playback.
var acceptedMimes sync.Map

// Accepts reports whether a speaker can be handed this MIME type over plain
// HTTP. The list comes from the player itself rather than from a table here:
// models differ, and a wrong guess either wastes a transcode or plays nothing.
// A speaker that cannot be asked accepts nothing, which leaves the caller on
// its safe default.
func Accepts(ctx context.Context, ip, mime string) bool {
	mimes, ok := acceptedMimes.Load(ip)
	if !ok {
		fetched, err := protocolInfo(ctx, ip)
		if err != nil {
			return false
		}
		acceptedMimes.Store(ip, fetched)
		mimes = fetched
	}
	return mimes.(map[string]bool)[strings.ToLower(mime)]
}

// protocolInfo asks a speaker what it can be sent. Entries read
// "http-get:*:audio/flac:*"; only the HTTP ones concern us, the rest describe
// transports we do not use.
func protocolInfo(ctx context.Context, ip string) (map[string]bool, error) {
	body, err := soap(ctx, ip, "ConnectionManager", "GetProtocolInfo", ``)
	if err != nil {
		return nil, err
	}

	mimes := parseSink(body)
	if len(mimes) == 0 {
		return nil, errors.New("sonos: empty protocol info")
	}
	return mimes, nil
}

func parseSink(body string) map[string]bool {
	mimes := map[string]bool{}
	for _, entry := range strings.Split(matchTag(body, "Sink"), ",") {
		parts := strings.Split(strings.TrimSpace(entry), ":")
		if len(parts) == 4 && parts[0] == "http-get" {
			mimes[strings.ToLower(parts[2])] = true
		}
	}
	return mimes
}

// Seek to position (seconds). A speaker still loading the stream answers UPnP
// 701, "transition not available", so the first attempt right after handing it
// a new URI is expected to fail; it accepts the seek once buffering settles.
func Seek(ctx context.Context, ip string, seconds int) error {
	var err error
	for attempt := range seekAttempts {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(seekRetryDelay):
			}
		}

		err = av(ctx, ip, "Seek", `<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>`+hms(seconds)+`</Target>`)
		var fault *Fault
		if err == nil || !errors.As(err, &fault) || fault.Code != TransitionNotAvailable {
			return err
		}
	}
	return err
}

const (
	seekAttempts   = 4
	seekRetryDelay = 400 * time.Millisecond
)

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

// Position reports where playback is, in seconds, and how long the track is.
// A speaker that is not playing anything answers zeroes.
func Position(ctx context.Context, ip string) (elapsed int, duration int) {
	body, err := soap(ctx, ip, "AVTransport", "GetPositionInfo", `<InstanceID>0</InstanceID>`)
	if err != nil {
		return 0, 0
	}
	return hmsToSeconds(matchTag(body, "RelTime")), hmsToSeconds(matchTag(body, "TrackDuration"))
}

// CurrentURI reports what a speaker is playing, empty when it is playing
// nothing. A speaker outlives the server that told it what to play, so this is
// the only way back to which track that was.
func CurrentURI(ctx context.Context, ip string) string {
	body, err := soap(ctx, ip, "AVTransport", "GetPositionInfo", `<InstanceID>0</InstanceID>`)
	if err != nil {
		return ""
	}
	return html.UnescapeString(matchTag(body, "TrackURI"))
}

func matchTag(body, tag string) string {
	if m := tagRe(tag).FindStringSubmatch(body); m != nil {
		return strings.TrimSpace(m[1])
	}
	return ""
}

// hmsToSeconds reads the "H:MM:SS" form UPnP reports positions in. Sonos
// answers "NOT_IMPLEMENTED" for streams it cannot seek, which reads as zero.
func hmsToSeconds(raw string) int {
	parts := strings.Split(raw, ":")
	if len(parts) != 3 {
		return 0
	}

	total := 0
	for _, part := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil {
			return 0
		}
		total = total*60 + n
	}
	return total
}

// Track is what a speaker is told about what it is being handed. The speaker
// fetches the artwork itself, so ArtURL has to be an address it can reach.
type Track struct {
	URL      string
	MimeType string
	Title    string
	Artist   string
	Album    string
	ArtURL   string
	Duration int
}

// PlayURL hands a speaker one track, through its queue.
//
// Pointing the transport straight at the URL also plays it, but a speaker then
// treats it as a stream: no duration, no progress, and the controller shows a
// bare title. Queueing the same URL with the same metadata makes it a track,
// which is what it is.
func PlayURL(ctx context.Context, ip string, track Track) error {
	uuid, err := playerUUID(ctx, ip)
	if err != nil {
		return err
	}

	if err := av(ctx, ip, "RemoveAllTracksFromQueue", `<InstanceID>0</InstanceID>`); err != nil {
		return err
	}

	enqueue := `<InstanceID>0</InstanceID>` +
		`<EnqueuedURI>` + xmlEscape(track.URL) + `</EnqueuedURI>` +
		`<EnqueuedURIMetaData>` + xmlEscape(didlLite(track)) + `</EnqueuedURIMetaData>` +
		`<DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued>` +
		`<EnqueueAsNext>0</EnqueueAsNext>`
	if err := av(ctx, ip, "AddURIToQueue", enqueue); err != nil {
		return err
	}

	// The transport plays the queue rather than the track: the track is what the
	// queue now holds.
	transport := `<InstanceID>0</InstanceID><CurrentURI>x-rincon-queue:` + uuid + `#0</CurrentURI><CurrentURIMetaData></CurrentURIMetaData>`
	if err := av(ctx, ip, "SetAVTransportURI", transport); err != nil {
		return err
	}
	if err := av(ctx, ip, "Seek", `<InstanceID>0</InstanceID><Unit>TRACK_NR</Unit><Target>1</Target>`); err != nil {
		return err
	}
	return Play(ctx, ip)
}

// playerUUID is the identity a speaker's own queue is addressed by. It is fixed
// for as long as the speaker is on the network, so it is asked for once.
var playerUUIDs sync.Map

func playerUUID(ctx context.Context, ip string) (string, error) {
	if cached, ok := playerUUIDs.Load(ip); ok {
		return cached.(string), nil
	}

	player, ok := Describe(ctx, ip)
	if !ok {
		return "", errors.New("sonos: the speaker did not answer with an identity")
	}

	// The description carries it as "uuid:RINCON_…"; the queue address does not.
	uuid := strings.TrimPrefix(player.UUID, "uuid:")
	playerUUIDs.Store(ip, uuid)
	return uuid, nil
}

func didlLite(track Track) string {
	dur := ""
	if track.Duration > 0 {
		dur = ` duration="` + hms(track.Duration) + `"`
	}

	art := ""
	if track.ArtURL != "" {
		art = `<upnp:albumArtURI>` + xmlEscape(track.ArtURL) + `</upnp:albumArtURI>`
	}

	return `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">` +
		`<item id="-1" parentID="-1" restricted="true">` +
		`<dc:title>` + xmlEscape(track.Title) + `</dc:title>` +
		`<dc:creator>` + xmlEscape(track.Artist) + `</dc:creator>` +
		`<upnp:album>` + xmlEscape(track.Album) + `</upnp:album>` +
		art +
		`<upnp:class>object.item.audioItem.musicTrack</upnp:class>` +
		`<res protocolInfo="http-get:*:` + track.MimeType + `:*"` + dur + `>` + xmlEscape(track.URL) + `</res>` +
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
