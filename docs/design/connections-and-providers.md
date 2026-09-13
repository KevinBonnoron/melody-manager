# Design — Providers & Connections model

> Status: revision 1 landed with the Go backend (`provider_settings` + `connections`, `provider_grants` dropped,
> `tracks.provider` → `tracks.source`). Revision 2 below reworks the lifecycle and is **not implemented** —
> the decisions marked *open* need answering before any code is written.

## Problem with the current model

Three collections with overlapping responsibilities:

- `providers` — system rows (admin `config`, `enabled`) **plus** a nullable `owner` allowing user-owned rows (a second way to do per-user, duplicating `connections`).
- `connections` — per-user rows (`config`, `enabled`).
- `provider_grants` — unused.

For a single personal provider type you get a `providers` row **and** a `connections` row, and at runtime their configs are merged into one ambiguous namespace: `{ ...provider.config, ...connection.config }`. Scope lives only in the TS manifest (`public | shared | personal`), not in the data. Result: it is unclear who owns what, and the only case that genuinely needs admin-only config is `local` (a server filesystem path).

## Key insight: Spotify is catalog-only

yt-dlp cannot extract Spotify audio (DRM). Spotify is a **metadata/catalog** source (Web API): it provides tracks/albums/playlists, but **playback audio must be resolved via a streamable provider (YouTube)**. The code already reflects this: `spotify` manifest is `features: ['search', 'import']` with no `stream`. So Spotify is not a "playback source" — it is a discovery source that needs a playback resolver.

- Public search/import → Spotify **client-credentials** flow = one app `clientId/secret`, **admin-level**.
- Importing a user's **private** library (playlists, likes) → **per-user OAuth** token, on top of the admin app credential. (Decision: we want this.)

## Model — three concepts, single responsibility each

### 1. Provider type — in code (manifest), not in DB
The static catalog. Enriched manifest:
- `capabilities`: `search | stream | import`, plus `catalogOnly` (Spotify) → requires a playback resolver (youtube).
- `userConnectable: boolean` — can a user create a personal connection? (`local` = false)
- `authKind: 'none' | 'server-credentials' | 'user-oauth' | 'user-credentials'`
- config schema fields explicitly tagged `server` vs `user` (replaces the implicit `configSchema` vs `connectionSchema` split).

### 2. `provider_settings` — DB, admin-only, one row per type
Replaces the system rows of `providers`. Kills the nullable `owner` hack.
- `type` (unique)
- `enabled` — server-wide on/off switch
- `config` (JSON) — **server-level only**: `local.path`, `youtube.downloadPath`, `spotify.clientId/secret`

Access: admin-only write. `config` contains secrets (`spotify.clientSecret`) → **admin-only read**; expose only `{ type, enabled }` to regular users.

### 3. `connections` — DB, per-user, one row per (user, type)
- `user`, `type` (unique together)
- `enabled`
- `config` (JSON) — **user-level only**: `youtube.cookies`, **spotify OAuth `{ token, refresh, expiry }`** (no dedicated `token` field — kept inside `config`), empty for anonymous opt-in (soundcloud/bandcamp)

Access: owner-only read/write (already the case). Tokens live here, never readable by others.
`local` never has a connection (`userConnectable: false`).

## Per-provider mapping

| Provider | server config (admin) | user connection | auth |
|---|---|---|---|
| local | `path` (required) | ❌ none | none — server library, only admin-only case |
| youtube | `downloadPath` | opt-in + `cookies?` | none / cookies |
| soundcloud | — (just `enabled`) | opt-in (empty) | none |
| bandcamp | — (just `enabled`) | opt-in (empty) | none |
| spotify | `clientId/secret` (app) | opt-in OAuth → token in `config` | server-credentials **+** user-oauth |
| sonos | — | — (autodiscovered) | none — `category=device` |

## Runtime resolution

Effective state for (user U, type T):
- usable iff `provider_settings[T].enabled` **AND** (`!userConnectable[T]` **OR** U has an `enabled` connection for T)
- effective config = `provider_settings[T].config` (server) combined with `connection.config` (user) under **separate namespaces** — no key clobbering
- playback: if `catalogOnly` (spotify), resolve audio through a streamable provider (youtube)

This removes the duplication: server facts and user facts are disjoint in fields and ownership. `local` has only server settings; anonymous sources have only a per-user opt-in plus the global enable flag.

## UX (Connexions screen)

- **User**: list of sources, each `Active` / `À connecter` (opt-in) / `Indisponible` (admin-disabled). `local` shows as "Bibliothèque du serveur" with no connect button.
- **Admin**: extra "Réglages serveur" section — per type: `enabled` toggle + server config (local path, youtube downloadPath, spotify app keys).
- Clean split: *admin configures the server* vs *user connects their accounts*.

## Go migration (imminent)

- These are plain PocketBase collections + access rules → port 1:1 to the Go PocketBase library (same collections, same rules DSL, defined in Go instead of JS migrations).
- Keep provider logic behind an interface (`Search/Stream/Import/Resolve`) → reimplement as Go structs; manifest/registry becomes a Go struct/registry.
- Design the collection migration now (schema is identical both sides) so the Go backend inherits the same DB.

## Migration from current data

- `providers` rows with `owner = null` → `provider_settings` (keep `type`, `enabled`, `config`).
- `providers` rows with `owner != null` → fold into `connections` (should not normally exist).
- Move per-user fields out of any merged `config` into `connections.config`.
- Drop `provider_grants`.

---

# Revision 2 — install & activation lifecycle

Revision 1 gave every source a server row and a per-user row, but it never said **who turns a source on**.
In practice the two questions got confused: a source could feed 406 tracks into the library while the UI
still called it "not connected", because nothing creates a connection when you import. Revision 2 separates
the lifecycle into two explicit, ordered steps.

## Vocabulary (decided)

| Term | Who | Meaning |
|---|---|---|
| **Install** | admin | The source exists on this server and is configured (paths, app credentials). |
| **Activate** | any user | I use this source, with my own credentials if it needs them. |

"Connect" / "disconnect" disappear from the UI wording — the current screens still say *Connecter* /
*Déconnecter* and need renaming. "Enabled" also disappears as a user-facing word.

A source is usable by user U iff it is **installed** *and* U has **activated** it (or it needs no activation).

## States

| State | Condition | Screen |
|---|---|---|
| Not installed | no server config | admin only |
| Installed, not activated | installed, no connection for U | activation CTA |
| Active, incomplete | connection exists but a required user field is missing | works until it doesn't — see below |
| Active | connection exists and is complete | edit / deactivate |

**Decided:** importing from a source activates it — the import creates the connection. That removes the
"feeds the library without being activated" state that YouTube is in today, and keeps the UI honest without
adding friction to the add flow.

The consequence is the third row. An implicit activation starts empty, so a source whose provider *needs*
user credentials is active and broken at the same time. This is the real YouTube case: on a hosted server,
YouTube blocks anonymous playback and demands cookies. So:

- the failure has to be reported, not swallowed. `services.authErrorCode` (`api/internal/services/search.go`)
  already classifies exactly this — it matches `sign in`, `cookie`, `bot`, `403` and returns
  `COOKIES_REQUIRED`, which the client renders as a "connect this source" prompt in the add dialog;
- **but only search uses it.** `services/stream.go` resolves through yt-dlp without classifying its failures,
  so a blocked playback surfaces as a generic error. Streaming must run the same classifier and return the
  same typed code;
- the player then points at `/sources/<type>` to complete the activation, and the source page shows the
  source as needing attention. This is the operational state that page still lacks.

## Install (admin)

Install asks for the server-level fields the manifest declares (`ConfigSchema`), plus one new admin choice:

- **Does this source require the user to supply information?** Today the only case is YouTube cookies:
  on a hosted server YouTube blocks anonymous playback, so the admin may make cookies mandatory.
  When mandatory and absent, the source is installed but unusable for that user — the UI must say so.

Data model: reuse `provider_settings.enabled` as the *installed* flag rather than adding a field, and seed it
to `false`. Rows stay seeded one per known type, so install/uninstall never creates or deletes rows — the
old admin screen deleted them, which orphaned tracks until the next migration recreated the row.

Discovery: the left menu lists **installed** sources only. Installable ones are found in the admin settings
page and in the onboarding wizard, so the navigation menu stays navigation.

## Uninstall (admin) — destructive, server-wide

Order matters; each step feeds the next:

1. delete tracks where `source = T`, and the files downloaded for them;
2. delete albums left with no track;
3. delete artists left with no track and no album — note an artist can hold tracks without an album, so
   "no album" alone is not enough (all 462 tracks currently have one, but nothing enforces it);
4. delete every user's connection for T;
5. mark the source not installed.

**Decided — cascades:** everything referencing a deleted track goes with it. Playlist entries, plays, share
links and likes for those tracks are deleted (today that would be 229 plays, 4 playlists, 1 share link, 1
like). No dangling references, and no playlist quietly losing half its content. Stats lose the history of an
uninstalled source, which is the accepted price of "uninstall removes everything tied to it".

## Deactivate (user) — scoped to one account

Deletes the user's connection for that source, deletes **that user's likes on that source's content**, and
hides the source's results for them. Rationale: cookies are what makes playback work, so losing the
connection means losing access, not merely losing curation.

The deletion is irreversible — reactivating does not bring the likes back — so the confirmation must say it
plainly. Uninstall and deactivate must live in **two separate cards**, and uninstall should require retyping
the source name: one wipes everyone's content, the other affects one account, and both start with "d" in
French.

## Secrets (blocking)

Spotify's `clientId` / `clientSecret` go back to the admin side, in `provider_settings.config`.
That collection is currently readable by **any authenticated user** (`list` and `view` are
`@request.auth.id != ""`), so the app secret would leak to every account on the server. `connections` is
already owner-only and is not the problem.

The UI needs *some* of `provider_settings` for every user (which sources exist, are they installed), so
locking the whole collection to admins breaks the sources screens.

**Decided:** secrets move to a **separate admin-only collection**; `provider_settings` keeps the metadata
every user may read. Enforcement then lives in PocketBase's own rules, which also cover realtime
subscriptions — a hook that strips fields from reads would not, since realtime events carry record data.

Accepted trade-offs of one shared app: rate limits are per `client_id`, so all users share one budget, and a
development-mode app is capped at 25 users the admin adds by email. Judged preferable to 25 apps for one
server.

## Local files and personal uploads

`local` stays what it is: a server folder, installed by an admin, with no activation to perform — its card
shows admin actions only. Giving it a "connect" button for symmetry would be cosmetic consistency.

**Decided:** personal uploads are a **separate source**, not a per-user mode of `local`. Each source keeps a
single ownership model — `local` is server content, uploads are user content — instead of one source whose
rows mean different things depending on who wrote them.

Still to settle: the ownership model itself. Tracks, albums and artists are global today (`list`/`view` =
any authenticated user), so uploaded content has nowhere to live yet. That is its own PR.

## Reporting a source that needs attention

**Decided:** nothing is persisted. The `COOKIES_REQUIRED` / `CREDENTIALS_REQUIRED` code returned by search —
and, once wired, by streaming — is enough to raise the alert where the failure happens. Nothing to
invalidate, nothing that can go stale, and no new field on `connections`.

The trade-off is accepted: the source page cannot warn before something has actually failed. If that turns
out to matter, the next step is a provider health check called when the page opens, not a cached flag.

## Validating activation

**Decided:** the activation form enforces the `ConnectionSchema` required fields; an activation created by an
import does not. If we bother to ask for cookies in a form, we require them; a connection born from an import
is empty by construction and lands in the "active, incomplete" state, where the playback error will point the
user back to the source page.

Two behaviours, each matching its context. Blocking imports until a source is properly activated was
rejected: it reintroduces exactly the friction the implicit activation was meant to remove.

## Still open

1. **Ownership model** for uploaded content. Settled in principle — uploads are their own source — but the
   visibility rules for user-owned tracks, albums and artists are not designed yet, and everything is global
   today. Deferred to its own PR; nothing here depends on it.
