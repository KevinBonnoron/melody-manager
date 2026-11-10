# Speakers and devices

Music can come out of the browser you are reading in, out of another browser
signed in to the same server, or out of a speaker on the network. Sonos and
Chromecast are both supported, and both are found on their own.

![The devices screen](/screenshots/devices.jpg)

## The one thing to set first

A speaker does not play what your browser sends it. It is given a URL and
fetches the audio from the server itself, which means the server has to be
reachable from the speaker, at an address that is not `localhost`.

Go to **Admin → Settings**, find **Server public URL**, and press **Detect**:
the server lists the addresses it actually has on the network. Pick the one on
the same network as your speakers, `http://192.168.1.20:8090` or thereabouts.

Get this wrong and everything looks right until you press play: the speaker is
found, it accepts the track, and nothing comes out.

## Discovery

Both kinds announce themselves over multicast, and the server listens every ten
seconds.

| | Sonos | Chromecast |
|---|---|---|
| Found by | SSDP, the UPnP discovery protocol | mDNS, `_googlecast._tcp.local.` |
| Controlled over | UPnP/SOAP on port 1400 | CASTV2 over TLS on port 8009 |
| Named by | the speaker's own room name | the name given in the Google Home app |

Whatever answers appears on the **Devices** screen. A speaker found for the
first time is announced with a notice at the top, which you can either configure
or dismiss.

### When nothing is found

Multicast does not cross a router, and a Docker bridge network is routed despite
what the name suggests. A container on the default network therefore hears
nothing at all.

Two ways out.

**Host networking**, the simple one. Drop the port mapping, which host mode makes
meaningless:

```yaml
services:
  melody-manager:
    image: ghcr.io/kevinbonnoron/melody-manager:latest
    network_mode: host
    volumes:
      - melody-manager-data:/app/pb_data
      - melody-manager-cache:/app/cache
      - ./config:/config
      - /path/to/your/music:/music:ro
    restart: unless-stopped
```

The server then listens on the host's own addresses, and discovery works as it
would outside a container.

**A multicast relay**, if you would rather keep the container on its own
network. [scyto/multicast-relay](https://github.com/scyto/multicast-relay) run
with `network_mode: host` forwards SSDP and mDNS between the bridge and the LAN.
Any relay will do.

**Or type the address in.** Open the kind's own page from the sidebar, under
**Devices**, and add the address in the **Addresses** section. The server asks
that address what it is and lists the speaker under its own name. This one
always works, including across subnets where no amount of relaying will help.

## Formats

A speaker is only sent what it can play.

Sonos is asked what it accepts and answers with a list. Chromecast is not asked;
it takes MP3, AAC, MP4, FLAC, WAV, Ogg and WebM.

Container is not the whole question, though. Both cap out at **48 kHz and
24-bit**, and a file above that is transcoded even though its format is on the
list. This is not pedantry: a 24-bit 192 kHz FLAC is accepted by a Sonos, starts
playing, and stops after three or four seconds with no error anywhere.

Anything that has to be converted becomes **MP3 at 320 kbps**, on the way out,
and the result is cached so the next play costs nothing. Cover art is carried
through the conversion.

::: tip
A Chromecast Audio really does take 96 kHz. The cap is the same for every model
all the same, because a video dongle handed a 96 kHz file takes it and then
stops partway through, silently. The cost of being careful is a conversion
nobody can hear.
:::

## Playing

Press the device button in the player, to the right of the transport controls.
It lists this browser, any other browser signed in to the same account, and
every configured speaker grouped by kind.

Picking one moves the music to it: what is playing carries over, at the position
it had reached. Volume belongs to the device, so each one keeps its own, and the
server polls the speaker so a change made from the Sonos or Google Home app
shows up here too.

Sending the music elsewhere does not tie your browser to the page. The transport
controls, the position and the volume all keep working, and closing the tab does
not stop the speaker.

## A window of its own

The button beside the device selector opens the player in a window of its own,
outside the browser. Playback is not interrupted: only the controls move, and
closing the window puts them back in the page.

This uses the Document Picture-in-Picture API, which today means Chrome, Edge
and other Chromium browsers, over HTTPS or on `localhost`. The button is absent
where the API is not. Whether the window then stays above the others is the
desktop's decision rather than the browser's: it does on Windows, macOS and X11,
and Wayland has no protocol for a window to ask.
