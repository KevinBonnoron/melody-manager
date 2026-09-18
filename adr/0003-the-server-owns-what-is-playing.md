# 3. The server owns what is playing

- Status: accepted
- Date: 2026-09-19

## Context

Nobody owns the answer to "what should be playing".

The queue lives in one browser tab. Closing the tab loses it, handing playback to a speaker leaves
the speaker with no idea what comes next, and shuffle draws from a list only that tab can see.

A speaker is asked what it is doing rather than told. A stopped one has nothing to say, and there is
nothing of the server's own to fall back on, so the controls can only ask it to carry on with
something it may no longer be holding.

Nothing can be chosen before the first track, because before the first track there is nothing to
choose it on. And the same music playing on several devices at once has nowhere to live, since what
is playing is a property of whichever tab happens to be open.

## Decision

The server owns it. Clients draw it and ask for changes.

**One playback record per user**, which exists whether or not anything is playing and whether or not
a client is open. It is what a device shows when it is not the one making the sound, and what a
client has to offer before anything has been played.

**The server owns the list.** A client hands it tracks and the first of them is the one to play; a
single track is a list of one. The server extends the list as the playhead advances, drawing on what
is already in it, so that playback does not stop at the end of whatever a client happened to send.
It extends only as the handed tracks run low, and only by a bounded number ahead, so that the list
stays a list rather than becoming a copy of the library.

**Position is a timeline**, the position together with the moment it was true, rather than a number
pushed repeatedly. A client works out where playback has reached. The offset between a client's
clock and the server's is measured when it connects, a few round trips keeping the shortest,
because devices agreeing on a beat need it and retrofitting it into a working player is worse than
having it from the start.

**Playback comes out of a set of devices.** One device is the set of one, and several devices in
step is the same set with more in it, not a second playback system beside this one. Moving playback
keeps the position, so what was playing carries on where it was rather than starting again. A device
taken by another user leaves the set, and the rest carry on without it.

**One route per order**, each validating the body it needs. Not one route taking a bag of optional
fields, which is a second way of writing "do something" and cannot be validated, authorised or read
back in a log. Starting playback is a single order carrying the tracks, because "play this, from
this" is one intention, and an intention that arrives in pieces can be applied in part: a client
that is answered for half of it has moved the sound somewhere the record does not describe, and
nothing detects that.

**What belongs to one device is addressed to that device**, its volume and stopping it. Everything
about what is playing is addressed to the record, so that pausing never requires a client to name
where the sound is coming out, and so that pausing means the same thing when it is coming out of
three places at once.

**Shuffle and repeat belong to the record**, so that every device shows the same answer and any of
them can change it.

**A track is played with the credentials of the user who asked for it.** Nothing is ever borrowed.

## Consequences

The local player stops being a special case and becomes one device among others obeying the same
record, which is what stops playback being implemented twice.

Playing in step on several devices is not a later system built beside this one; it is this one with
more than one device in the set. What is left for it is accuracy, not a model.

Asking a device to play, without saying what, stops being how playback starts. Only the record knows
what should be playing, and answering such a request means reading the record anyway.

The server becomes responsible for choosing what follows the tracks it was handed. What it chooses,
and how far ahead it looks, is not decided here.

Until this exists, a speaker that has lost its stream cannot be restarted, and no amount of work in
the client can fix that.
