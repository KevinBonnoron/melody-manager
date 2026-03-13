# Sonos Integration

Melody Manager can stream audio to Sonos speakers on your local network.

## How It Works

The server discovers Sonos devices on the local network using UPnP/SSDP. When you select a Sonos speaker as the output device in the UI, audio is streamed via the server using UPnP/SOAP with DIDL-Lite metadata.

FLAC files are automatically transcoded to MP3 320kbps on-the-fly for Sonos compatibility. Other formats (MP3, WAV, AAC, M4A) are streamed directly without transcoding.

## Requirements

- Sonos speakers must be on the **same network** as the server
- The server must be accessible from the Sonos speakers (they connect back to the server to fetch the audio stream)
- FFmpeg must be installed (included in the Docker image)

## Docker Setup

Sonos discovery relies on UPnP/SSDP multicast, which doesn't work out of the box with Docker's default bridge networking. The recommended approach is to run a **multicast relay** container alongside Melody Manager:

```yaml
services:
  melody-manager:
    image: ghcr.io/kevinbonnoron/melody-manager:latest
    container_name: melody-manager
    ports:
      - "80:80"
    volumes:
      - melody-manager-db:/app/db/pb_data
    environment:
      - PB_SUPERUSER_EMAIL=admin@example.com
      - PB_SUPERUSER_PASSWORD=your-secure-password
    restart: unless-stopped

  multicast-relay:
    image: scyto/multicast-relay
    container_name: multicast-relay
    network_mode: host
    restart: unless-stopped

volumes:
  melody-manager-db:
    driver: local
```

The multicast relay forwards SSDP/UPnP multicast traffic between the Docker bridge network and your LAN, allowing Melody Manager to discover Sonos speakers. [scyto/multicast-relay](https://github.com/scyto/multicast-relay) is one option, but any multicast relay will work.

::: tip
If you don't need Sonos and only want browser streaming, you can skip the multicast relay entirely.
:::

## Usage

1. Open Melody Manager in your browser
2. Click the device selector icon in the music player
3. Available Sonos speakers on the network will appear in the list
4. Select a speaker to route audio to it

::: tip
Access the app via your machine's **local IP address** (e.g. `http://192.168.1.x`) rather than `localhost`, so the Sonos speakers can reach the server to fetch audio streams.
:::
