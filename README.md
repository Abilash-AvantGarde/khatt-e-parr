# Khatt-e-Parr

A serverless web app for asking someone on a date.

**Live:** https://abilash-avantgarde.github.io/khatt-e-parr/

You build an invite — her name, a shortlist of real places from a live map, the
nights you're free, an opening line — seal it, and share a URL. She opens that
URL, breaks a wax seal, swipes through your ideas, picks a night, writes a note
back, and gets a reply URL to send you.

No accounts, no database, no backend. The entire invite and the entire reply are
base64url-encoded JSON in the URL fragment, which never reaches any server.

*khat* (خط) — a letter in the old sense: written, sealed, carried, handed over.

## Running it

Open `index.html` in a browser. That's it — React, Leaflet and all fonts are
bundled inside it, so there's no build step and no install.

To serve it properly:

```bash
docker compose up -d --build     # http://localhost:8080
```

## How it works

**Three modes**, chosen only by `location.hash` on mount:

| Hash | Mode | Entry |
|---|---|---|
| *(none)* | sender | build an invite (or restore a draft) |
| `#i=<payload>` | receiver | break the seal, answer |
| `#r=<payload>` | sender | see her reply |

**Payloads** are base64url JSON, kept compact because every byte ends up in the
link he pastes to her. Invite: `{ n, p, d, h, l }` — name, places, days, hours,
line. Reply: `{ n, p, d, h, t }`. Each place is a positional array
`[lat, lon, name, addr]`.

Three things keep it short, worth ~31% of the URL: the Nominatim `id` never goes
on the wire (it's only used to dedupe while shortlisting), coordinates are
rounded to 5 decimals (~1 m, vs the ~1 cm Nominatim returns), and places are
arrays so the JSON keys aren't repeated per place. `unpackInvite`/`unpackReply`
still accept the older verbose shape, so links already sent keep working.

Base64url matters too — standard base64 emits `+` and `/`, and a `+` in a URL
fragment is widely re-decoded as a space, which silently corrupted roughly 13%
of invites.

**Persistence** is the sender's draft only, in `localStorage` under `ayf:draft`.
The receiver stores nothing.

**Place search** is Nominatim (OpenStreetMap), keyless. **Place imagery** has no
photos: each place's "photo" is its OSM map tile, cropped to the venue and
duotoned via `background-blend-mode: color` so it reads as art rather than a map
screenshot.

## Branding & copy — `brand.js`

`brand.js` is the one file to edit for the app's name and wording. It's a plain
`<script>` setting `window.BRAND`, read with per-key fallbacks so a missing or
partial file still leaves a working app.

```js
var APP_NAME = 'Khatt-e-Parr';   // wordmark, browser tab, date.ics PRODID
var APP_TAB_TITLE = APP_NAME;    // browser tab only
var COPY = { teaseHead, teaseSub, teaseCta, sentHead, sentSub,
             replyNudge, senderFoot, receiverFoot };
```

`APP_TAB_TITLE` is separate on purpose: the receiver reads that tab *before* she
opens anything, so a neutral value like `'A khat for you'` protects the reveal.

⚠️ `index.html` is a self-contained artifact and can't load `./brand.js`, so the
same constants are **inlined** near the top of its logic script, marked
`MIRRORED FROM ./brand.js`. Change `brand.js`, then mirror the values there.

## Deploying

Static, so any static host works. It's on GitHub Pages from `main` at the URL
above. A `Dockerfile` + `nginx.conf` + `compose.yaml` are included for
self-hosting — nginx-alpine, ~80 MB, unprivileged on port 8080 with a read-only
root filesystem and a CSP scoped to OSM.

Two gotchas if you edit the nginx config:

- **`add_header` does not merge across levels.** A `location` with its own
  `add_header` drops everything inherited from `server`, which is why the
  security headers are repeated per location.
- **tmpfs mounts default to root ownership.** With `read_only: true`, nginx
  can't write its temp dirs unless the mounts carry `uid=101,gid=101`.

## Files

| File | What it is |
|---|---|
| `index.html` | Self-contained compiled build. Open this first. |
| `brand.js` | App name and copy. The one file to edit for wording. |
| `Ask Her Out - Site.dc.html` | Authored source: template + logic class. |
| `Ask Her Out - Wireframes.dc.html` | Low-fi flow wireframes. Structure only. |
| `support.js` | Runtime for the `.dc.html` files. Not part of the design. |
| `Dockerfile`, `nginx.conf`, `compose.yaml` | Self-hosting. |

## Known gaps

1. **Accessibility** — interactive elements are `div`s with click handlers.
   Nothing is keyboard-reachable or screen-reader announced. Largest gap.
2. **OSM usage limits** — attribution is correct, but the public endpoints want
   a descriptive `User-Agent`/`Referer` and rate limiting. Nominatim explicitly
   bans client-side autocomplete, so keep search on an explicit button; the tile
   policy treats non-viewport fetching as bulk downloading, which is what the
   duotone photos technically do. Proxy and cache both for real traffic.
3. **Reply loop is manual** — she sends a link back. Deliberate: automating it
   would cost the no-server property the whole design rests on.
4. **URL length** grows with the shortlist. A full 3-place invite is ~530 chars,
   well within limits. Deflate via `CompressionStream` would take it to ~360,
   but that API is async and `inviteLink()` is called synchronously in render.
5. **Anyone with the link can open it** — the payload is encoded, not encrypted.
