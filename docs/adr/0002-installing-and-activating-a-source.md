# 2. Installing and activating a source are two steps

- Status: accepted, partly built
- Date: 2026-09

## Context

The screens say *Connect* and *Disconnect*, and "enabled" appears as a user-facing word, but a
source can be feeding the library while still showing as not connected: importing from YouTube
creates nothing, so nothing marks it as used. The lifecycle has two actors and one verb.

## Decision

Two ordered steps, with the words to match.

- **Install**, by an admin: the source exists on this server and has what the server owes it, paths
  and application credentials.
- **Activate**, by any user: I use this source, with my own credentials if it needs them.

A source is usable by a user when it is installed *and* they have activated it, or it needs no
activation. *Connect* and *disconnect* are removed from the interface.

**Importing from a source activates it.** The import creates the connection, which removes the
state YouTube is in today, feeding the library without being activated, without adding a step to
the add flow.

The cost is a source that is active and broken at once: an implicit activation starts empty, and a
source that needs credentials is then activated with none. So a blocked source has to say so rather
than fail vaguely. `services.authErrorCode` already classifies this for search and returns
`COOKIES_REQUIRED`; streaming resolves through yt-dlp without classifying anything, so a blocked
playback surfaces as a generic error. Streaming runs the same classifier and returns the same code,
and the player points at the source page to finish activating.

**Secrets move to a separate admin-only collection.** `provider_settings` is readable by any
authenticated user, so an application secret in it leaks to every account; but the sources screens
need part of that collection for every user, so locking the whole thing breaks them. Splitting
keeps enforcement in PocketBase's own rules, which also cover realtime subscriptions. A hook that
stripped fields from reads would not, since realtime events carry record data.

One shared application per server is accepted: rate limits are per client id, so everyone shares
one budget, and a development-mode app is capped at 25 users the admin adds by hand. Still
preferable to 25 applications for one server.

**Personal uploads are a separate source**, not a per-user mode of `local`. `local` is server
content, uploads are user content, and one source whose rows mean different things depending on who
wrote them is worse than two sources.

## Consequences

Splitting the secrets is done: they live in their own collection, admin-only to list and to view,
while the one every user reads keeps the metadata.

The rest is not. The screens still say *Connect* and *Disconnect*, and *Activate* appears nowhere.
Importing creates no connection, so the state this was meant to remove is still the one YouTube is
in. Only search classifies an authentication failure, so a playback blocked for want of cookies
comes out as a generic error. The sources screen has no state for a source that needs attention.

Ownership of uploaded content is not settled: tracks, albums and artists are global, readable by
any authenticated user, so user content has nowhere to live yet. Uploads cannot ship before that
does.
