package chromecast

import (
	"net"
	"testing"

	"golang.org/x/net/dns/dnsmessage"
)

func replyPacket(t *testing.T) []byte {
	t.Helper()

	name := func(s string) dnsmessage.Name {
		n, err := dnsmessage.NewName(s)
		if err != nil {
			t.Fatalf("NewName(%q): %v", s, err)
		}
		return n
	}

	instance := "Chromecast-abc123." + service
	host := "abc123.local."
	msg := dnsmessage.Message{
		Header: dnsmessage.Header{Response: true, Authoritative: true},
		Answers: []dnsmessage.Resource{{
			Header: dnsmessage.ResourceHeader{Name: name(service), Type: dnsmessage.TypePTR, Class: dnsmessage.ClassINET},
			Body:   &dnsmessage.PTRResource{PTR: name(instance)},
		}},
		Additionals: []dnsmessage.Resource{
			{
				Header: dnsmessage.ResourceHeader{Name: name(instance), Type: dnsmessage.TypeSRV, Class: dnsmessage.ClassINET},
				Body:   &dnsmessage.SRVResource{Port: 8009, Target: name(host)},
			},
			{
				Header: dnsmessage.ResourceHeader{Name: name(instance), Type: dnsmessage.TypeTXT, Class: dnsmessage.ClassINET},
				Body:   &dnsmessage.TXTResource{TXT: []string{"id=abc123", "fn=Salon", "md=Chromecast Audio"}},
			},
			{
				Header: dnsmessage.ResourceHeader{Name: name(host), Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET},
				Body:   &dnsmessage.AResource{A: [4]byte{192, 168, 10, 42}},
			},
		},
	}

	packed, err := msg.Pack()
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	return packed
}

func TestReadAssemblesADeviceFromItsRecords(t *testing.T) {
	instances := map[string]*instance{}
	hosts := map[string]string{}
	read(replyPacket(t), instances, hosts)

	found := assemble(instances, hosts)
	if len(found) != 1 {
		t.Fatalf("found %d devices, want 1: %+v", len(found), found)
	}
	if found[0].Address != "192.168.10.42" {
		t.Errorf("address = %q, want 192.168.10.42", found[0].Address)
	}
	if found[0].Name != "Salon" {
		t.Errorf("name = %q, want the one from the TXT record", found[0].Name)
	}
	if found[0].ID != "abc123" {
		t.Errorf("id = %q, want abc123", found[0].ID)
	}
}

// Devices answer across several packets, and the records arrive in no particular order.
func TestReadWaitsForAnAddress(t *testing.T) {
	instances := map[string]*instance{}
	hosts := map[string]string{}
	instances["Chromecast-abc123."+service] = &instance{name: "Salon", host: "abc123.local."}

	if got := assemble(instances, hosts); len(got) != 0 {
		t.Fatalf("listed a device with no address: %+v", got)
	}

	hosts["abc123.local."] = "192.168.10.42"
	got := assemble(instances, hosts)
	if len(got) != 1 || got[0].Address != "192.168.10.42" {
		t.Fatalf("unexpected: %+v", got)
	}
}

func TestReadIgnoresWhatIsNotOurs(t *testing.T) {
	instances := map[string]*instance{}
	hosts := map[string]string{}

	read([]byte("not a dns packet at all"), instances, hosts)
	read(nil, instances, hosts)

	if len(instances) != 0 {
		t.Errorf("rubbish was taken for a device: %+v", instances)
	}
}

func TestQuestionAsksForTheCastService(t *testing.T) {
	packed, err := question(service)
	if err != nil {
		t.Fatalf("question: %v", err)
	}

	var msg dnsmessage.Message
	if err := msg.Unpack(packed); err != nil {
		t.Fatalf("Unpack: %v", err)
	}
	if len(msg.Questions) != 1 || msg.Questions[0].Name.String() != service || msg.Questions[0].Type != dnsmessage.TypePTR {
		t.Errorf("unexpected question: %+v", msg.Questions)
	}
}

func TestMulticastGroupIsTheMDNSOne(t *testing.T) {
	if !mdnsGroup.IP.Equal(net.IPv4(224, 0, 0, 251)) || mdnsGroup.Port != 5353 {
		t.Errorf("mdnsGroup = %v, want 224.0.0.251:5353", mdnsGroup)
	}
}

// DNS names are case insensitive and a device answers in whatever case it likes.
func TestCaseDoesNotSplitADeviceInTwo(t *testing.T) {
	name := func(s string) dnsmessage.Name {
		n, err := dnsmessage.NewName(s)
		if err != nil {
			t.Fatalf("NewName(%q): %v", s, err)
		}
		return n
	}

	named := "Chromecast-ABC." + service
	msg := dnsmessage.Message{
		Header: dnsmessage.Header{Response: true, Authoritative: true},
		Answers: []dnsmessage.Resource{{
			Header: dnsmessage.ResourceHeader{Name: name("_GoogleCast._TCP.local."), Type: dnsmessage.TypePTR, Class: dnsmessage.ClassINET},
			Body:   &dnsmessage.PTRResource{PTR: name(named)},
		}},
		Additionals: []dnsmessage.Resource{
			{
				Header: dnsmessage.ResourceHeader{Name: name("Chromecast-ABC._googlecast._tcp.local."), Type: dnsmessage.TypeSRV, Class: dnsmessage.ClassINET},
				Body:   &dnsmessage.SRVResource{Port: 8009, Target: name("ABC.Local.")},
			},
			{
				Header: dnsmessage.ResourceHeader{Name: name("chromecast-abc._googlecast._tcp.local."), Type: dnsmessage.TypeTXT, Class: dnsmessage.ClassINET},
				Body:   &dnsmessage.TXTResource{TXT: []string{"ID=abc", "FN=Salon"}},
			},
			{
				Header: dnsmessage.ResourceHeader{Name: name("abc.local."), Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET},
				Body:   &dnsmessage.AResource{A: [4]byte{192, 168, 10, 42}},
			},
		},
	}

	packed, err := msg.Pack()
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}

	instances := map[string]*instance{}
	hosts := map[string]string{}
	read(packed, instances, hosts)

	found := assemble(instances, hosts)
	if len(found) != 1 {
		t.Fatalf("found %d devices, want 1: %+v", len(found), found)
	}
	if found[0].Address != "192.168.10.42" || found[0].Name != "Salon" || found[0].ID != "abc" {
		t.Errorf("unexpected device: %+v", found[0])
	}
}
