---
layout: home

hero:
  name: Melody Manager
  text: Your music, wherever it lives
  tagline: One self-hosted library from your own files, YouTube, Spotify, SoundCloud and Bandcamp. Play it in the browser, or out loud on a Sonos speaker or a Chromecast.
  image:
    src: /screenshots/home.jpg
    alt: The Melody Manager home screen
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/KevinBonnoron/melody-manager

features:
  - title: One library, several sources
    details: Local files are scanned and tagged from the folder you point at. YouTube, Spotify, SoundCloud and Bandcamp are searched and imported alongside them, and a track from any of them plays the same way.
  - title: Plays where you are
    details: In the browser, in a window of its own outside it, or on a speaker on the network. Sonos and Chromecast are discovered on their own, and what a speaker cannot decode is transcoded on the way to it.
  - title: Several people, one server
    details: Each account has its own library, playlists, likes, history and connections to the sources it uses. Nothing about your music leaves the machine it runs on.
  - title: One container
    details: A single Go binary embedding PocketBase, the API and the client. No reverse proxy, no separate database, on x86 and on ARM alike.
---
