package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"

	"github.com/KevinBonnoron/melody-manager/api/internal/netaddr"
)

func init() {
	m.Register(canonicalSessionIPs, func(app core.App) error {
		// Canonicalization is lossless; there is no expanded form to restore.
		return nil
	})
}

func canonicalSessionIPs(app core.App) error {
	sessions, err := app.FindAllRecords("user_sessions")
	if err != nil {
		return err
	}
	for _, session := range sessions {
		raw := session.GetString("ipAddress")
		canonical := netaddr.Canonical(raw)
		if canonical == raw {
			continue
		}
		session.Set("ipAddress", canonical)
		if err := app.Save(session); err != nil {
			return err
		}
	}
	return nil
}
