# 1. A source is configured by the server, activated by a user

- Status: accepted
- Date: 2026-08

## Context

A source needs two kinds of configuration that do not belong to the same person. Where the music
files are, and what application credentials the server holds, are the administrator's. What
identifies a listener to a source, an OAuth token, is theirs, and nobody else may read it.

Nothing in the data said which was which. The same source could be configured in two places, both
were merged into one namespace at runtime, and the only record of what was personal lived in a
TypeScript manifest rather than in the model. A secret and a path were indistinguishable.

## Decision

Configuration has exactly two owners, and the type itself is neither.

- **The type is code.** What a source can do, whether a user can connect to it, what authentication
  it wants, and which of its fields are the server's. None of that is data; it does not vary per
  installation.
- **The server's half is admin-only**, one row per type.
- **The user's half is theirs**, one row per user and type, readable by nobody else. A source that
  has nothing personal to hold never gets one.

Spotify is a catalog rather than a playback source: its audio cannot be extracted, so a Spotify
track is resolved against a source that can stream. This was already true in the manifest; the
model now says it too.

## Consequences

The two halves are overlaid in one place, and which half a value came from is no longer a guess.

A track is not equally playable by everyone, where a source answers to the listener rather than to
the server. Anything that caches a resolved address, or hands a stream to a speaker, has to carry
whoever it was resolved for. This has been got wrong twice already, in a preview cache and in a
speaker's stream URL.

Which half a credential belongs in follows from what it is for, not from what it is. YouTube
cookies look personal and are not: YouTube refuses a server it takes for a datacentre, and the
cookies are what make it answer at all. They are a passport the server carries, the same for
every listener, so they sit in the administrator's half. Reading them as a permission led to a
cache split per listener that would have split the library along with it, since a track imported
with one person's cookies is one record and one file for everybody.
