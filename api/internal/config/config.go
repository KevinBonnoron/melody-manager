package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds runtime configuration sourced from the environment. With
// embedded PocketBase there is no PB_URL/superuser hop anymore — the DB lives
// in-process. SERVER_URL is still needed so devices (Sonos) can reach the
// stream endpoints.
type Config struct {
	ServerURL    string
	CacheDir     string
	CacheMaxFile int
	CacheMaxSize int64
}

func Load() Config {
	return Config{
		ServerURL:    env("SERVER_URL", "http://localhost:8090"),
		CacheDir:     env("CACHE_DIR", "/tmp/melody-manager-cache"),
		CacheMaxFile: envInt("CACHE_MAX_FILES", 500),
		CacheMaxSize: envSize("CACHE_MAX_SIZE", 5*1024*1024*1024),
	}
}

func env(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

// envSize reads a byte size, accepting the documented human forms ("512MB",
// "5GB") as well as a plain byte count.
func envSize(key string, fallback int64) int64 {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return fallback
	}
	v := strings.TrimSpace(strings.ToUpper(raw))
	mult := int64(1)
	for _, unit := range []struct {
		suffix string
		factor int64
	}{
		{"KB", 1 << 10}, {"MB", 1 << 20}, {"GB", 1 << 30}, {"TB", 1 << 40},
		{"K", 1 << 10}, {"M", 1 << 20}, {"G", 1 << 30}, {"T", 1 << 40},
		{"B", 1},
	} {
		if strings.HasSuffix(v, unit.suffix) {
			v = strings.TrimSpace(strings.TrimSuffix(v, unit.suffix))
			mult = unit.factor
			break
		}
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n < 0 {
		return fallback
	}
	return n * mult
}
