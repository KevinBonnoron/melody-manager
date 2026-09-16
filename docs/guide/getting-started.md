# Getting Started

Melody Manager is one music library made out of the files on your server and the
sources you follow elsewhere. It runs in a single container, listens on one
port, and keeps everything on your own machine.

This page takes you from nothing to listening.

## What you need

- Docker, and a folder with some music in it.
- A machine reachable on your network, if you want to play on a Sonos speaker or
  a Chromecast. Anything else works on a laptop.

## Run it

The installer asks four questions and writes the two files the answers belong
in, and starts nothing by itself:

```bash
curl -fsSLO https://raw.githubusercontent.com/KevinBonnoron/melody-manager/main/install.sh &&
  bash install.sh
```

Where your music is, whether you want to play to speakers on your network, which
port, and the address those speakers reach the server at. It takes the same
answers as flags (`./install.sh --help`) for anyone scripting it.

The rest of this page is what it writes, for anyone who would rather do it by
hand. Make a folder for the install and put this in `docker-compose.yml`:

```yaml
services:
  melody-manager:
    image: ghcr.io/kevinbonnoron/melody-manager:latest
    container_name: melody-manager
    ports:
      - "8090:8090"
    volumes:
      - melody-manager-data:/app/pb_data
      - melody-manager-cache:/app/cache
      - ./config:/config
      # Your music, read-only. The path on the right is what you give the app.
      - /path/to/your/music:/music:ro
    restart: unless-stopped

volumes:
  melody-manager-data:
  melody-manager-cache:
```

Replace `/path/to/your/music` with wherever your files are, then:

```bash
docker compose up -d
```

Open <http://localhost:8090>.

### What the volumes are for

| Mount | Why |
|---|---|
| `/app/pb_data` | The database, the covers, the authentication keys. Lose it and you lose the library. |
| `/app/cache` | Audio fetched from remote sources, kept so it is fetched once. Safe to delete. |
| `/config` | `config.json`, the operator settings. Readable and editable with the server down. |
| `/music` | Your own files. Read-only is enough. |

## Create your account

The first account is the administrator, and sign-ups close behind it: nobody
else can create one until an administrator opens them again under
**Admin → Settings**.

::: warning
Until that first account exists, anyone who reaches the server can claim it. On
a machine others can reach, create yours before you do anything else.
:::

`PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD`, set in the environment before
the first start, create a PocketBase superuser instead. That account is for the
database admin UI at `/_/`, not for listening, and it does not close the window
above.

## Point it at your music

The welcome screen lists every source. Open **Local**, and give it the path
**inside the container**, which is `/music` if you used the compose file above.

The folder is scanned as soon as you save it: files are read for their tags,
albums and artists are created, and covers come from the artwork in the files
themselves. Anything that appears in the folder afterwards is picked up on its
own.

Titles, artists and covers all come from the tags. Files with nothing in them
land under "Unknown Artist", which is worth knowing before you go looking for a
bug.

## Connect the other sources

| Source | What it needs |
|---|---|
| YouTube | Switch it on. Optionally your cookies, for anything age-restricted or private. |
| SoundCloud | Switch it on. |
| Bandcamp | Switch it on. |
| Spotify | A Spotify application of your own: its client ID and secret, set once by an administrator. |

Spotify is a catalogue, not a source of audio: it supplies tracks, albums and
playlists, and playback for a Spotify result is resolved through one of the
others. The [configuration guide](/guide/configuration) has the detail.

## Play somewhere else

Speakers need one thing first: an address they can reach the server at. See
[Speakers and devices](/guide/devices).

## Mobile

The client is a progressive web app, so a phone can install it from the browser
and it behaves like an application from then on.

An Android APK is attached to each
[release](https://github.com/KevinBonnoron/melody-manager/releases). The iOS
project is in the repository for anyone who wants to build and sign it
themselves; there is no published build, because there is no Apple developer
account behind it.
