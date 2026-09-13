# End-to-end tests

The suite drives the application the way it ships: the Go binary serves the
built client and the API on one origin, with no proxy and no mocked requests.

## Running it

```sh
task test:e2e          # or: bun run test:e2e
bun run test:e2e:ui    # the Playwright inspector
```

`e2e/serve.sh` builds the client, then starts a server of its own on
`127.0.0.1:8099` with its database and configuration file under `e2e/.data`.
That directory is wiped at the start of every run. Nothing here reaches the
development server on `:8090` or the library behind it.

The browsers come from the Nix dev shell (`PLAYWRIGHT_BROWSERS_PATH`), so
`playwright install` is neither needed nor able to help: the downloaded builds
do not run on NixOS. `@playwright/test` is pinned to the same version as the
driver in `flake.nix`, and the two have to be bumped together.

## How a test starts

The `setup` project seeds a small library through the PocketBase REST API as a
superuser, then signs in through the form and saves the session. Every other
test inherits that session and reaches a seeded record by name through the
`library` fixture, rather than clicking its way to one.

Seeding goes through the API on purpose: what a test is about should be the
only thing it drives with a mouse.

## Writing one

Tests share one server and one database and run in order, so a test that
changes state should either undo it or work on a record no other test touches.

Find elements by role and by the text someone would read. A test that cannot
name what it is clicking is usually pointing at something the interface does
not name either, which is worth fixing in the interface.

## Against a running stack

`E2E_BASE_URL=http://localhost:5173 bun run test:e2e` skips the throwaway
server. It writes to whatever it is pointed at, so do not point it at anything
you want to keep.
