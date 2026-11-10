// Package netaddr lists the addresses other machines on the network can reach this one at, so
// an operator does not have to go looking for them.
package netaddr

import (
	"net"
	"net/netip"
)

// Canonical formats an address for people: IPv6 is compressed and an IPv4
// mapped into IPv6 is shown as the IPv4 it represents. Unknown values are kept
// verbatim rather than being replaced with a misleading placeholder.
func Canonical(raw string) string {
	addr, err := netip.ParseAddr(raw)
	if err != nil {
		return raw
	}
	return addr.Unmap().String()
}

// Candidates lists the addresses this machine could plausibly be reached at, private ranges
// first.
func Candidates() []string {
	var private, other []string
	for _, addr := range usableAddresses() {
		if addr.IP.IsPrivate() {
			private = append(private, addr.IP.String())
			continue
		}
		other = append(other, addr.IP.String())
	}

	return append(private, other...)
}

func usableAddresses() []*net.IPNet {
	interfaces, err := net.Interfaces()
	if err != nil {
		return nil
	}

	var out []*net.IPNet
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok || ipnet.IP.To4() == nil || ipnet.IP.IsLinkLocalUnicast() {
				continue
			}
			out = append(out, ipnet)
		}
	}

	return out
}
