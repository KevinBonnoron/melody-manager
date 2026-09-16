// Package netaddr lists the addresses other machines on the network can reach this one at, so
// an operator does not have to go looking for them.
package netaddr

import "net"

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
