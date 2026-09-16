# Configuration

There are three places a setting can live, and each holds a different kind of
thing.

- **`config.json`**, for what the machine needs: addresses, cache limits. A
  file rather than a table, so it stays readable and editable when the server
  will not start.
- **The database**, for what belongs to the installation and to the people using
  it: source credentials, connections, speakers.
- **The environment**, for the five things that have to be known before any of
  the above can be read.

## config.json

The server reads it from `/config/config.json` in the container, and from
`config/config.json` next to the binary otherwise. It is written with the
defaults on first start, so there is nothing to create by hand.

| Key | Default | What it is |
|---|---|---|
| `listenAddr` | empty | Interface and port the server accepts connections on. `0.0.0.0:8090` opens it to the network; empty leaves PocketBase's own default, `127.0.0.1:8090`. An explicit `--http` on the command line wins, which is what the container's entrypoint passes, so this key does nothing there. |
| `publicUrl` | `http://localhost:8090` | The address of this server as seen from outside the browser. Speakers fetch the audio from it themselves, so it has to be one they can reach. |
| `cacheDir` | `cache`, beside the executable | Where audio from remote sources is kept, which in the container is the `/app/cache` volume. |
| `cacheMaxFiles` | `500` | How many files the cache holds before the oldest are dropped. |
| `cacheMaxSize` | `5368709120` (5 GiB) | How large it may grow, in bytes. |
| `registrationAllowed` | `false` | Whether anyone may sign themselves up. The first account is always allowed, so a fresh install can be set up. |

`listenAddr`, `publicUrl` and `registrationAllowed` are also on the
**Admin → Settings** screen, which writes the same file. `publicUrl` has a
**Detect** button there: the server lists the addresses it actually has on the
network and you pick one. A change to `listenAddr` applies at the next restart;
the other two take effect at once.

::: warning
`localhost`, `127.0.0.1` and `::1` mean "this machine" to whatever reads them,
and what reads this one is the speaker. The server refuses to play to a speaker
rather than hand over an address it would resolve to itself, so playback answers
`400` until this is a real address on the network. Leaving the key empty comes to
the same thing: the default, `http://localhost:8090`, takes over. Behind a
reverse proxy, the address to put here is the proxy's.
:::

## Environment variables

Five, and no more. Everything else is in the file above.

| Variable | What it does |
|---|---|
| `CONFIG_FILE` | Where `config.json` lives. The image sets it to `/config/config.json`. |
| `PB_SUPERUSER_EMAIL` | Creates or updates a PocketBase superuser at startup. |
| `PB_SUPERUSER_PASSWORD` | That superuser's password. |
| `PUBLIC_DIR` | A built client to serve instead of the one compiled into the binary. Rarely wanted. |
| `MELODY_AUTOMIGRATE` | `true` writes new migration files as collections change. For development only. |

::: warning
Earlier versions took `SERVER_URL`, `CACHE_DIR`, `CACHE_MAX_FILES` and
`CACHE_MAX_SIZE` from the environment. They are gone. If you are carrying an old
compose file, the values belong in `config.json` now, and the ones left in the
environment do nothing.
:::

## Sources

A source is configured in two halves, which never overlap.

**Server settings**, one row per source type, hold what belongs to the
installation: the local library path, the YouTube download path, the Spotify
application credentials. They also carry a server-wide on/off switch, and only
an administrator can read them.

**Connections**, one per person per source, hold what belongs to that person:
their YouTube cookies, their Spotify token. An empty connection is simply an
opt-in, which is all SoundCloud and Bandcamp need. Nobody reads anyone else's.

| Source | Server settings | Personal connection |
|---|---|---|
| Local | `path`, required | none: it is the server's own library |
| YouTube | `downloadPath` | opt-in, optional cookies |
| SoundCloud | none | opt-in |
| Bandcamp | none | opt-in |
| Spotify | `clientId`, `clientSecret` | opt-in, OAuth token |

A source is usable when it is enabled server-wide and, where a person can
connect to it, when that person has.

### Spotify

Spotify supplies tracks, albums and playlists, but not audio: yt-dlp cannot
extract it. Playback for a Spotify result is resolved through a source that can
stream. Treat it as a catalogue you browse with, not as somewhere music comes
from.

The client ID and secret come from an application you create at
[developer.spotify.com](https://developer.spotify.com/dashboard). An
administrator sets them once, under the Spotify source; each person then
connects their own account to it.

### Local files

The path is the one **inside the container**. Mounting `/srv/music` at `/music`
means the path to give the app is `/music`.

The folder is scanned when you save it, and watched afterwards: a file that
appears is imported on its own. Titles, artists, albums, years, genres and
covers all come from the tags in the files.

## Cache

Audio fetched from YouTube, SoundCloud and Bandcamp is kept on disk so it is
fetched once. When the cache passes `cacheMaxFiles` or `cacheMaxSize`, the
oldest files go first. Deleting the directory costs nothing but a re-fetch.

Transcoded audio is cached the same way: a FLAC sent to a speaker that cannot
decode it is converted once, not on every play.

## Data

`/app/pb_data` holds the database, the uploaded covers and the authentication
keys. It is the one directory that matters. Back it up; everything else can be
rebuilt.

PocketBase runs inside the server binary and provides the database, the
authentication and an admin UI at `/_/` for the raw collections. You should not
need it day to day.
