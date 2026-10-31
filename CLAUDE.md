# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file Tampermonkey/Violentmonkey userscript (`booth-cross-search.user.js`) with no build
step, no package manager, no tests. Everything — styles, DOM logic, both site integrations — lives
in that one IIFE. Ship changes by editing the file directly and bumping `@version` in the
`==UserScript==` header.

## Development / testing

There is no build/lint/test tooling in this repo. To verify a change:

1. Bump `@version` in the header (userscript managers only prompt to re-check scripts on version bump).
2. Install/update the script in Tampermonkey or Violentmonkey (load from local file, or paste).
3. Exercise it manually:
   - A Booth item page, e.g. `https://booth.pm/*/items/<id>` — checks the button bar, description
     collapse, and variations collapse.
   - `https://boothdex.ihtw.moe/*` — open an item card (or `/?item=<id>`) to check the search bar
     inside BoothDex's native detail dialog across light and dark themes.
4. Check the browser console for errors; `GM_xmlhttpRequest` failures surface there.

## Architecture

The script is one IIFE with two independent entry points selected by hostname at the bottom of the
file:

- `initBooth()` — runs on `booth.pm` / `*.booth.pm` item pages.
- `initBoothDex()` — runs on BoothDex (`boothdex.ihtw.moe`, or any custom host added via userscript
  manager user-matches).

Both entry points share a common "search bar" component (`buildSearchBar`), so changes to the
VRCPirate/RipperStore lookup UI or its status-dot semantics affect both sites at once.

### Shared search bar (`buildSearchBar`)

Renders the VRCPirate + RipperStore buttons with a colored status dot (grey pulse = pending, green
= results, red = none/not-logged-in, yellow = network/API error, click to retry). Buttons start
`disabled` until `bar.autoCheck()` runs and determines reachability/login state — a manual click can
therefore assume login already succeeded. Callers must invoke `.autoCheck()` themselves once the
host view is ready (Booth waits for `window` `load`; BoothDex calls it on dialog injection).

Two external APIs, each with a real gotcha:

- **VRCPirate** (`api-v2.vrcpirate.com`) — no login required; results filtered client-side by
  `boothID` since the search endpoint isn't an exact match.
- **RipperStore** (`forum.ripper.store`) — has no real auth-check endpoint. Login state is inferred
  from the search response itself: a `{status:{code:"not-authorised"}}` envelope means logged out.
  The `sortBy=relevance` query param is a no-op server-side — results are always sorted client-side
  by `post.timestamp` descending after fetch.

Both lookups are memoized per item ID via `memoized()` on a shared in-flight promise (`vrcpCache` /
`ripperCache`), so an `autoCheck()` call and a later manual button click never double-fire the same
request; a rejected promise is evicted from the cache so the next attempt can retry. Successful
results additionally persist across page loads via `persistentStore()` (one TTL'd JSON blob per
source in `GM_getValue`/`GM_setValue`: 6h TTL, oldest-evicted size cap). Only fulfilled values are
persisted — errors, including RipperStore's not-authorised, never outlive the page. `get()`
re-checks TTL on every read (not only on first blob load), and `memoized()` keeps only in-flight
(or unpersistable) promises in its map — store hits aren't memoized and persisted results are
evicted from it — so a long-lived tab cannot serve expired hits from memory. Disk writes go through
`gmWriteJsonDeferred` (coalesced ~400ms per key, flushed on `visibilitychange`/`pagehide`).
Everything storage-backed degrades gracefully when the GM value grants are missing (`canStore`).

### Booth item page (`initBooth`)

Injects the search bar after the title, plus two independent collapse behaviors:

- **Description collapse** (`setupDescCollapse`) — the generic `booth.pm/items` template nests the
  description in a `.my-40` wrapper containing `.shop__text`; custom shop subdomains
  (`foo.booth.pm`) use a different template with no `.my-40` at all, falling back to non-mobile
  `.description` blocks. `.shop__text` also appears in the unrelated shop-profile area, so candidates
  are found by presence of a nested `.shop__text`, not by class alone.
- **Variations collapse** (`setupVariationsCollapse`) — collapses `.variation-item` rows beyond the
  first 3 behind a toggle, skipped entirely for short lists.

Because Booth's page can render these regions asynchronously, `init()` is re-run from a
`MutationObserver` (with a 15s safety timeout) until description, variations, and bar are all
confirmed present.

### BoothDex (`initBoothDex`)

BoothDex is a Next.js SPA that already provides a full native `ItemDetail` Radix Dialog
(`[role="dialog"]`), account favourites, gallery/zoom, and item translations. `initBoothDex()`
observes dialog mounts/updates (ignoring card-grid mutations outside `[role="dialog"]`) and injects
`buildSearchBar(itemId)` right below the visible item title `<h2>` (skipping Radix's
`[data-slot="dialog-title"]` screen-reader heading).

Key Radix Dialog details:

- The Booth item ID comes from the dialog's Booth buy link (`a[href*="booth.pm/"][href*="/items/"]`),
  so non-item dialogs (sign-in, saved searches, `Ctrl+K` command palette) are skipped automatically.
  `bar.dataset.itemId` detects in-place item switches (e.g. clicking an item in "more from shop")
  and swaps the bar cleanly.
- `showPanel` mounts `.bcs-panel` inside the enclosing `[role="dialog"]` (with `position: absolute`)
  rather than `document.body`: Radix sets `pointer-events: none` on `body`, blocks outside wheel
  scrolling via `RemoveScroll`, and dismisses the dialog on outside `pointerdown`.
- `Escape` is handled on `window` in the capture phase. Radix's `DismissableLayer` also listens on
  `document` in the capture phase, so on `document` the first-registered listener wins — and Radix
  registers first when the dialog mounts before the userscript runs. `window` capture fires ahead of
  every `document` listener regardless of order, so `Escape` closes the result dropdown without
  dismissing the item dialog.

Do not add BoothDex card-level batch scanning for external sources (for example, automatically
checking VRCPirate/RipperStore status across visible cards or search-result grids). Keep external
source checks item-scoped to the detail dialog, unless the maintainer explicitly overrides this rule.

### Constraints worth knowing

- All cross-origin requests go through `GM_xmlhttpRequest` (declared via `@connect` in the header —
  add new hosts there if adding a new API), not `fetch`, since these are cross-origin requests from a
  userscript context.
- No `GM_addStyle` — the iOS Userscripts app crashes on it even with the grant declared. Styles are
  injected manually via `addStyle()` (creates a `<style>` element and appends to `<head>`). Keep new
  styles going through this helper rather than reintroducing `GM_addStyle`.
- CSS uses BoothDex's shadcn custom properties (`--popover`, `--foreground`, `--muted-foreground`,
  `--accent`, `--muted`, `--border`, `--warning`) with light-theme hex fallbacks, since `booth.pm`
  defines none of those variables while BoothDex defines all of them in both light and dark themes.
