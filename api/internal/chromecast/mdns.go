package chromecast

import (
	"context"
	"errors"
	"net"
	"strings"
	"time"

	"golang.org/x/net/dns/dnsmessage"

	"github.com/KevinBonnoron/melody-manager/api/internal/players"
)

// service is the name a Chromecast answers to on multicast DNS.
const service = "_googlecast._tcp.local."

var mdnsGroup = &net.UDPAddr{IP: net.IPv4(224, 0, 0, 251), Port: 5353}

// instance is one device, assembled from the several records it answers with.
type instance struct {
	name    string
	id      string
	host    string
	address string
}

// Discover asks the local network who is listening. Multicast, so it does not
// cross a bridged network, which is why an address can also be typed in.
//
// One question, many answers, and each device answers in pieces: a PTR naming
// the instance, an SRV pointing at a host, a TXT holding the name somebody gave
// it in the app, and an A record with the address. They arrive in any order and
// across any number of packets, so they are collected and read at the end.
func (d *Devices) Discover(_ context.Context, timeout time.Duration) []players.Found {
	conn, err := net.ListenPacket("udp4", ":0")
	if err != nil {
		return nil
	}
	defer func() { _ = conn.Close() }()

	query, err := question(service)
	if err != nil {
		return nil
	}
	if _, err := conn.WriteTo(query, mdnsGroup); err != nil {
		return nil
	}
	_ = conn.SetReadDeadline(time.Now().Add(timeout))

	instances := map[string]*instance{}
	hosts := map[string]string{}

	// Big enough for an mDNS packet, which may not be fragmented.
	buf := make([]byte, 9000)
	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}
		read(buf[:n], instances, hosts)
	}

	return assemble(instances, hosts)
}

func question(name string) ([]byte, error) {
	target, err := dnsmessage.NewName(name)
	if err != nil {
		return nil, err
	}

	msg := dnsmessage.Message{
		Questions: []dnsmessage.Question{{
			Name:  target,
			Type:  dnsmessage.TypePTR,
			Class: dnsmessage.ClassINET,
		}},
	}
	return msg.Pack()
}

func assemble(instances map[string]*instance, hosts map[string]string) []players.Found {
	var found []players.Found
	for key, entry := range instances {
		address := entry.address
		if address == "" {
			address = hosts[entry.host]
		}
		if address == "" {
			// A device that named itself and never said where it is. The next pass
			// will have the rest of it.
			continue
		}

		name := entry.name
		if name == "" {
			// The instance is named after the device's own id, which nobody chose.
			// Better the address than a hex string.
			name = address
		}
		id := entry.id
		if id == "" {
			id = strings.TrimSuffix(key, "."+service)
		}
		found = append(found, players.Found{Address: address, Name: name, ID: normaliseID(id)})
	}
	return found
}

// read folds one packet into what is known so far. Anything that will not parse
// is dropped: a network carries mDNS for printers and speakers alike, and a
// packet that is not ours is not a failure.
func read(packet []byte, instances map[string]*instance, hosts map[string]string) {
	var parser dnsmessage.Parser
	if _, err := parser.Start(packet); err != nil {
		return
	}
	if err := parser.SkipAllQuestions(); err != nil {
		return
	}

	// The answer section carries the PTR, and most devices put the SRV, the TXT
	// and the A record in the additional section of the same packet. Some send
	// them separately, which is why nothing here needs them together.
	if !section(&parser, parser.AnswerHeader, parser.SkipAnswer, instances, hosts) {
		return
	}
	if err := parser.SkipAllAuthorities(); err != nil {
		return
	}
	section(&parser, parser.AdditionalHeader, parser.SkipAdditional, instances, hosts)
}

func section(parser *dnsmessage.Parser, header func() (dnsmessage.ResourceHeader, error), skip func() error, instances map[string]*instance, hosts map[string]string) bool {
	for {
		h, err := header()
		if errors.Is(err, dnsmessage.ErrSectionDone) {
			return true
		}
		if err != nil {
			return false
		}
		if !resource(parser, h, skip, instances, hosts) {
			return false
		}
	}
}

func at(instances map[string]*instance, key string) *instance {
	if instances[key] == nil {
		instances[key] = &instance{}
	}
	return instances[key]
}

func resource(parser *dnsmessage.Parser, h dnsmessage.ResourceHeader, skip func() error, instances map[string]*instance, hosts map[string]string) bool {
	// DNS names are case insensitive and a device is free to answer in whatever
	// case it likes. Compared as they arrive, a PTR naming _GoogleCast and an SRV
	// naming _googlecast are two different services, and the device assembles
	// into nothing.
	name := strings.ToLower(h.Name.String())
	switch h.Type {
	case dnsmessage.TypePTR:
		body, err := parser.PTRResource()
		if err != nil {
			return false
		}
		if name == service {
			at(instances, strings.ToLower(body.PTR.String()))
		}

	case dnsmessage.TypeSRV:
		body, err := parser.SRVResource()
		if err != nil {
			return false
		}
		if strings.HasSuffix(name, "."+service) {
			at(instances, name).host = strings.ToLower(body.Target.String())
		}

	case dnsmessage.TypeTXT:
		body, err := parser.TXTResource()
		if err != nil {
			return false
		}
		if strings.HasSuffix(name, "."+service) {
			entry := at(instances, name)
			for _, pair := range body.TXT {
				key, value, found := strings.Cut(pair, "=")
				if !found {
					continue
				}
				// The keys of a DNS-SD record are case insensitive too.
				switch strings.ToLower(key) {
				case "fn":
					entry.name = value
				case "id":
					entry.id = value
				}
			}
		}

	case dnsmessage.TypeA:
		body, err := parser.AResource()
		if err != nil {
			return false
		}
		hosts[name] = net.IP(body.A[:]).String()

	default:
		if err := skip(); err != nil {
			return false
		}
	}
	return true
}
