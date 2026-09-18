# 3. The server owns what is playing

- Status: accepted
- Date: 2026-09-18

## Context

The server learns what a speaker is doing by looking at it. A track is recorded against a speaker
only while that speaker is seen playing, so a stopped one tells it nothing and there is nothing of
its own to fall back on.

Six consecutive polls of a real Sonos, with the transport stopped throughout, no track ever
recorded, and the speaker still holding a stream URL whose token had expired an hour and twenty
minutes earlier. The controls could only ask it to resume, which it could not do, and the player
had no track to draw, so it showed the speaker's name where a title belongs.

The queue lives in React state in one browser tab. Closing the tab loses it; handing playback to a
speaker leaves the speaker with no idea what comes next; shuffle picks from a list only that tab
can see.

These are one problem with four faces: nobody owns the answer to "what should be playing".

## Decision

The server owns it. Clients draw it and ask for changes.

- **One playback record per user.** An account plays one thing, wherever it comes out. Several
  people hearing the same thing at once is a session over several records, not a second record for
  one person.
- **Position is a timeline**, `position` plus the server time it was true at, not a number pushed
  repeatedly. A client computes where playback is now.
- **A speaker plays for whoever is playing on it.** The stream URL is signed for the user who owns
  the record and expires with their token. If someone else takes the speaker it is their music from
  then on, under their name. No credentials are ever borrowed.
- **One route per order**, all `POST` under `/api/player`, each validating the body it needs. Not
  one route taking a bag of optional fields, which is a second way of writing "do something" and
  cannot be validated, authorised or read back in a log. So `play` always carries the track to
  play, and carrying on with the one already there is `resume`, which pairs with `pause`; a route
  whose body is entirely optional is a route doing two jobs, with the caller saying which by what
  it leaves out. `/tracks/{id}/play` was considered and dropped: `stop` does not belong to a track.
- **The clock offset is measured at connect**, a few round trips keeping the shortest. A progress
  bar does not need it; two devices agreeing on a beat do, and retrofitting it into a working
  player is worse than having it.

## Consequences

`/api/devices/{id}/play` with no track stops being how playback starts. Asking a device to play is
asking it to play something, and only the playback record knows what that is; answering it means
looking up the record anyway. The transport operations that are genuinely about the device, pausing
it, stopping it, its volume, keep their meaning and are left alone.

Whether the rest of those routes survive is not settled here. Two ways to drive the same thing do
drift apart, which is worth weighing, but it is a separate decision and this one does not require
it.

The local player stops being a special case and becomes one device among others obeying the same
record, which is what stops playback being implemented twice.

`playback_state` grows from a resume point into the truth, and the queue leaves
`music-player-context`.

Playing the same thing to several people at once becomes a list of listeners over this timeline,
rather than a second playback system.

Until this exists, a speaker that has lost its URL cannot be restarted, and no amount of work in
the client can fix that.
