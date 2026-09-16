#!/usr/bin/env bash
#
# Sets up Melody Manager with Docker. It asks four things, writes a compose file
# and a configuration next to it, and starts nothing without being told to.
set -euo pipefail

IMAGE="ghcr.io/kevinbonnoron/melody-manager:latest"
DEFAULT_PORT=8090

target="."
music=""
port=""
public_url=""
discovery=""
assume_yes=""

usage() {
  cat <<'USAGE'
Usage: install.sh [options]

Without options it asks. With them it does not, which is what a script calling
this one wants.

  --dir PATH          where to write docker-compose.yml and config/ (default: .)
  --music PATH        the directory your music is in
  --port N            the port to publish, when speakers are not discovered
  --public-url URL    the address speakers reach this server at
  --discovery yes|no  yes puts the container on the host network, which is what
                      finding Sonos and Chromecast speakers needs
  --yes               overwrite what is already there
  --help              this

USAGE
}

die() {
  echo "install.sh: $*" >&2
  exit 1
}

# The address a speaker on the network would reach, which is never localhost.
# The route to the outside names the interface the LAN is on, and its address is
# the one worth offering.
detect_address() {
  local address=""
  if command -v ip >/dev/null 2>&1; then
    address=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)
  fi
  if [ -z "$address" ] && command -v hostname >/dev/null 2>&1; then
    address=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^127\.' | head -1)
  fi
  printf '%s' "$address"
}

# A path with a space in it, printed for somebody to paste into a shell, has to
# come back as one argument.
quoted() {
  printf '%q' "$1"
}

# The compose file and the configuration both hold these inside double quotes,
# where a backslash and a quote are the two characters that have to be spelled
# out. A directory is allowed to contain either, and written as they came they
# make a file neither docker nor the server can read. Backslashes first, or the
# ones added for the quotes get escaped in turn.
escaped() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# And compose reads a $ in its own file before docker ever sees it, so a
# directory named mu$HOME is mounted as mu/home/you, quietly and with no error.
# A doubled $ is the literal one.
compose_escaped() {
  escaped "$1" | sed -e 's/\$/$$/g'
}

# Escaping is not enough for a tab or a newline: YAML folds a newline into a
# space and mounts a directory nobody named, JSON refuses the file outright, and
# a trailing one is gone before the check below ever sees it, which is why the
# answer is looked at before it is canonicalised as well as after.
controlled() {
  case "$1" in
    *[[:cntrl:]]*) return 0 ;;
    *) return 1 ;;
  esac
}

# The host out of an http address, which is the only part of it that decides
# whether a speaker can reach the server.
host_of() {
  local rest="${1#*://}"
  rest="${rest%%[/?#]*}"
  rest="${rest##*@}"
  case "$rest" in
    \[*) rest="${rest#\[}"; rest="${rest%%\]*}" ;;
    *) rest="${rest%%:*}" ;;
  esac
  printf '%s' "$rest"
}

# The rule the server itself applies before handing a URL to a speaker: an
# address meaning "this machine" is one the speaker resolves to itself. The
# mapped forms are there because net.ParseIP, which is what the server asks,
# unwraps an IPv4 address written inside an IPv6 one and finds the loopback in
# it. Exhausting every spelling IPv6 allows is not something a shell should try;
# one that gets through is refused by the server at the first play, with its own
# message saying where to change it.
loopback() {
  case "$(host_of "$1" | tr '[:upper:]' '[:lower:]')" in
    localhost | 127.*) return 0 ;;
    ::1 | 0:0:0:0:0:0:0:1) return 0 ;;
    ::ffff:127.* | ::ffff:7f??:*) return 0 ;;
    *) return 1 ;;
  esac
}

# Why this address cannot be written, or nothing at all.
url_problem() {
  case "$1" in
    http://* | https://*) ;;
    *) printf '%s is not an http address' "$1"; return ;;
  esac
  if controlled "$1"; then
    printf 'that address has a tab or a newline in it'
    return
  fi
  if [ -z "$(host_of "$1")" ]; then
    printf '%s names no host to reach the server at' "$1"
    return
  fi
  if [ "$discovery" = "yes" ] && loopback "$1"; then
    printf '%s means "this machine" to a speaker, and the server refuses to play to one at an address it cannot reach' "$1"
  fi
}

ask() {
  local prompt="$1" fallback="$2" answer=""
  if [ -n "$fallback" ]; then
    read -r -p "$prompt [$fallback] " answer </dev/tty || true
  else
    read -r -p "$prompt " answer </dev/tty || true
  fi
  printf '%s' "${answer:-$fallback}"
}

ask_yes_no() {
  local prompt="$1" fallback="$2" answer=""
  answer=$(ask "$prompt (yes/no)" "$fallback")
  # Not ${answer,,}: that needs bash 4, and macOS still ships 3.2 as /bin/bash,
  # where it is a syntax error that ends the install at the first question.
  case "$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')" in
    y | yes | o | oui) printf 'yes' ;;
    n | no | non) printf 'no' ;;
    *) printf '%s' "$fallback" ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) target="${2:?--dir needs a path}"; shift 2 ;;
    --music) music="${2:?--music needs a path}"; shift 2 ;;
    --port) port="${2:?--port needs a number}"; shift 2 ;;
    --public-url) public_url="${2:?--public-url needs a URL}"; shift 2 ;;
    --discovery) discovery="${2:?--discovery needs yes or no}"; shift 2 ;;
    --yes) assume_yes=1; shift ;;
    --help | -h) usage; exit 0 ;;
    *) usage >&2; die "unknown option $1" ;;
  esac
done

! controlled "$target" || die "the installation directory has a tab or a newline in its name"

interactive=""
if [ -z "$music" ] && [ -t 0 ]; then
  interactive=1
fi

command -v docker >/dev/null 2>&1 || die "docker is not installed, and this installs with Docker. See https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "this needs the docker compose plugin (docker compose version)"

if [ -n "$interactive" ]; then
  echo
  echo "Melody Manager"
  echo
fi

# 1. The music.
if [ -z "$music" ]; then
  [ -n "$interactive" ] || die "--music is required when there is nobody to ask"
  music=$(ask "Where is your music?" "$HOME/Music")
fi
[ -d "$music" ] || die "no directory at $music"
! controlled "$music" || die "the music directory has a tab or a newline in its name"
music=$(cd "$music" && pwd)
! controlled "$music" || die "the music directory has a tab or a newline in its name"

# 2. Discovery, which decides whether a port is published at all: on the host
# network there is nothing to map, and multicast is the whole reason to be there.
if [ -z "$discovery" ]; then
  if [ -n "$interactive" ]; then
    echo
    echo "Sonos and Chromecast speakers announce themselves over multicast, which"
    echo "does not cross a Docker network. Reaching them means putting the"
    echo "container on the host's own network."
    discovery=$(ask_yes_no "Play to speakers on your network?" "yes")
  else
    discovery="no"
  fi
fi
case "$discovery" in
  yes | no) ;;
  *) die "--discovery takes yes or no, not $discovery" ;;
esac

# 3. The port, which only means anything on a Docker network of its own.
if [ "$discovery" = "yes" ]; then
  port="$DEFAULT_PORT"
elif [ -z "$port" ]; then
  port=$([ -n "$interactive" ] && ask "Which port should it listen on?" "$DEFAULT_PORT" || printf '%s' "$DEFAULT_PORT")
fi
case "$port" in
  '' | *[!0-9]*) die "$port is not a port number" ;;
esac
# Numeric is not enough: 70000 would be accepted here and refused by Docker much
# later, with an error about the port rather than about the answer that set it.
# The length is what decides, before any comparison: a number too long for bash
# to hold makes [ -gt ] an error rather than a refusal, and the answer would go
# into the compose file unexamined.
port=$(printf '%s' "$port" | sed 's/^0*//')
[ -n "$port" ] || port=0
if [ "${#port}" -gt 5 ] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
  die "$port is outside the range a port can be, 1 to 65535"
fi

# 4. The address speakers fetch the audio from, which is the one thing nobody
# gets right on their own: a speaker is handed a URL and goes and reads it, so
# localhost is the one answer that cannot work.
question="What address will speakers reach it at?"
if [ -z "$public_url" ]; then
  suggested="http://localhost:$port"
  if address=$(detect_address) && [ -n "$address" ]; then
    case "$address" in
      *:*) suggested="http://[$address]:$port" ;;
      *) suggested="http://$address:$port" ;;
    esac
  fi
  # Offering an address the check below refuses only invites pressing enter on it.
  [ -z "$(url_problem "$suggested")" ] || suggested=""
  if [ -n "$interactive" ]; then
    echo
    echo "A speaker fetches the audio from this server itself, so it needs an"
    echo "address it can reach. Not localhost."
    public_url=$(ask "$question" "$suggested")
  else
    public_url="$suggested"
  fi
fi
problem=$(url_problem "$public_url")
# Asked once more rather than exited on: the answers to the other three are not
# worth throwing away over this one.
if [ -n "$problem" ] && [ -n "$interactive" ]; then
  echo "install.sh: $problem" >&2
  public_url=$(ask "$question" "")
  problem=$(url_problem "$public_url")
fi
[ -z "$problem" ] || die "$problem"
if [ "$discovery" = "no" ] && loopback "$public_url"; then
  echo "install.sh: $public_url means \"this machine\" to whatever reads it, so no" >&2
  echo "            speaker will reach the server. Change it under Admin → Settings" >&2
  echo "            once it is running." >&2
fi

mkdir -p "$target/config"
target=$(cd "$target" && pwd)
! controlled "$target" || die "the installation directory has a tab or a newline in its name"
compose="$target/docker-compose.yml"
config="$target/config/config.json"

for existing in "$compose" "$config"; do
  if [ -e "$existing" ] && [ -z "$assume_yes" ]; then
    [ -n "$interactive" ] || die "$existing is already there; pass --yes to replace it"
    [ "$(ask_yes_no "Replace $existing?" "no")" = "yes" ] || die "leaving $existing alone"
  fi
done

if [ "$discovery" = "yes" ]; then
  network=$'    network_mode: host\n'
else
  network=$'    ports:\n      - "'"$port"$':8090"\n'
fi

cat > "$compose" <<COMPOSE
services:
  melody-manager:
    image: $IMAGE
    container_name: melody-manager
$network    volumes:
      - melody-manager-data:/app/pb_data
      - melody-manager-cache:/app/cache
      - ./config:/config
      - "$(compose_escaped "$music"):/music:ro"
    restart: unless-stopped

volumes:
  melody-manager-data:
  melody-manager-cache:
COMPOSE

cat > "$config" <<CONFIG
{
  "publicUrl": "$(escaped "$public_url")",
  "cacheMaxFiles": 500,
  "cacheMaxSize": 5368709120,
  "registrationAllowed": false
}
CONFIG

cat <<DONE

Written:
  $compose
  $config

Start it with:
  cd $(quoted "$target") && docker compose up -d

Then open ${public_url} and create your account, the first one administers the
server. Point the Local source at /music, which is $(quoted "$music") seen from
inside.
DONE
