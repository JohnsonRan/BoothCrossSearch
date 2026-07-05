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
   - `https://vrcatalogue.com/*` — click a product card image to open the cross-search modal.
4. Check the browser console for errors; `GM_xmlhttpRequest` failures surface there.

## Architecture

The script is one IIFE with two independent entry points selected by hostname at the bottom of the
file:

- `initBooth()` — runs on `booth.pm` item pages.
- `initVrcatalogue()` — runs on `vrcatalogue.com`.

Both entry points share a common "search bar" component (`buildSearchBar`) and a generic
expand/collapse toggle (`makeToggle`), so changes to the VRCPirate/RipperStore lookup UI or its
status-dot semantics affect both sites at once.

### Shared search bar (`buildSearchBar`)

Renders the VRCPirate + RipperStore buttons with a colored status dot (grey pulse = pending, green
= results, red = none/not-logged-in, yellow = network/API error, click to retry). Buttons start
`disabled` until `bar.autoCheck()` runs and determines reachability/login state — a manual click can
therefore assume login already succeeded. Callers must invoke `.autoCheck()` themselves once the
host page is ready (Booth waits for `window` `load`; the vrcatalogue modal calls it immediately).

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
source in `GM_getValue`/`GM_setValue`: search results 6h, Booth item JSON 24h, oldest-evicted size
cap). Only fulfilled values are persisted — errors, including RipperStore's not-authorised, never
outlive the page. Everything storage-backed degrades gracefully when the GM value grants are
missing (`canStore`).

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

### VRCatalogue (`initVrcatalogue`)

VRCatalogue is a Solid.js SPA. Clicking a product card's `.cardImgWrap` is intercepted with a
capture-phase `document` click listener (survives SPA re-renders since it isn't bound to card DOM)
that opens a custom modal instead of the site's native lightbox. Buttons and non-card links inside
the image area are left alone; the image `<a>` itself is *not* treated as "native UI" because the
site wraps every slide image in an anchor whose default it already prevents.

The modal (`openModal`) is seeded immediately from data already visible on the card (title, image,
item id) so it never opens blank, then enriched by fetching `https://booth.pm/en/items/<id>.json`
(`getBoothItem`, memoized like the search lookups) for full description, tags, variations, and
multi-image gallery. That endpoint 403s without a browser-like `User-Agent`, and the modal degrades
gracefully (shows an R18/login hint) if the fetch fails. The fetched JSON is stripped down to just
the fields the modal renders before caching, to keep the persistent blob small.

A cross-site "recently viewed" history (`bcs-history` GM value, deduped by item id, capped at 60)
is written from both Booth item-page visits and vrcatalogue modal opens, but only vrcatalogue shows
UI for it: a fixed corner button (`.bcs-hist-fab`, hidden without storage grants) opens a grid
panel whose entries reopen the product modal.

A star on the vrcatalogue modal and history tiles syncs with the user's real Booth
wish list ("スキ!"): state is a paginated fetch of
`accounts.booth.pm/wish_list_name_items.json` (20 items/page, walked to a cap; 401
when logged out is resolved as an empty list so stars just render unfilled),
memoized into a stable in-place-mutated container and re-walked each time the
history panel opens — so likes made on booth.pm appear without a page reload. Note
the similarly-named `wish_lists.json` is a decoy — it returns `{"item_ids":[]}` even
when logged in. The response carries full item cards (name/price/shop/thumbnail),
which the panel's 收藏 strip renders directly with no per-item fetches. Writes go to
`booth.pm/items/<id>/wish_list.json` with a scraped CSRF token (422 → re-scrape,
retry once). There is no local pin storage — Booth is the source of truth — and the
item JSON's `wished` field is deliberately NOT persisted (24h cache would go stale).
Product cards are marked by a rAF-debounced MutationObserver pass: seen items get a
grey veil over the card image (`.bcs-seen` + `::after`) plus an 已看 chip, wished
ones a ★ chip.

### Constraints worth knowing

- All cross-origin requests go through `GM_xmlhttpRequest` (declared via `@connect` in the header —
  add new hosts there if adding a new API), not `fetch`, since these are cross-origin requests from a
  userscript context.
- No `GM_addStyle` — the iOS Userscripts app crashes on it even with the grant declared. Styles are
  injected manually via `addStyle()` (creates a `<style>` element and appends to `<head>`). Keep new
  styles going through this helper rather than reintroducing `GM_addStyle`.
- CSS uses `var(--foo, fallback)` custom properties throughout so the injected UI follows each host
  site's own light/dark theme instead of hardcoding colors.
