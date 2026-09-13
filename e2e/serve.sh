#!/usr/bin/env bash
# Boots a Melody Manager entirely of its own: its own database, its own
# configuration file, its own port. Nothing here may reach the development
# server on :8090 or the data behind it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data="${E2E_DATA_DIR:-$root/e2e/.data}"
addr="${E2E_ADDR:-127.0.0.1:8099}"

rm -rf "$data"
mkdir -p "$data"

if [ "${E2E_SKIP_BUILD:-}" != "1" ]; then
  (cd "$root" && bun run build >/dev/null)
fi

cd "$root/api"
export CONFIG_FILE="$data/config.json"
export PUBLIC_DIR="$root/dist"

go run . superuser upsert "$E2E_SUPERUSER_EMAIL" "$E2E_SUPERUSER_PASSWORD" --dir "$data/pb_data" >/dev/null
exec go run . serve --dir "$data/pb_data" --http "$addr"
