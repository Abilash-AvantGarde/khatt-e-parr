# Handoff: Are You Free — date-invite web app

## Overview
A serverless, single-page web app for asking someone on a date. The **sender** builds an invite (her name → shortlist of real places from a live map → nights he's free → an opening line), seals it, and shares a URL. The **receiver** opens that URL, breaks a wax seal, swipes through his place ideas, picks a night and hour, writes a note back, and gets a **reply URL** to send him. He pastes (or opens) that reply URL and sees her answer.

No accounts, no database, no backend. The entire invite and the entire reply are base64-encoded JSON in the URL fragment.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype demonstrating intended look, motion, and behavior. They are **not production code to copy directly**. The task is to recreate this design in the target codebase's existing environment (React, Vue, SvelteKit, SwiftUI, native, etc.) using its established patterns, routing, and component libraries. If no codebase exists yet, choose an appropriate framework (a single-page React or Svelte app with no server is a natural fit) and implement it there.

`index.html` is a compiled, self-contained artifact — it runs standalone in any browser and is the most faithful reference for behavior. `Ask Her Out - Site.dc.html` is the authored source (an HTML template plus a JavaScript logic class); read it for the logic, not for its authoring conventions.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and motion. Recreate the UI faithfully. The one deliberately low-fi artifact is `Ask Her Out - Wireframes.dc.html`, included only to show the flow's original structure and the alternative desktop layout — ignore its styling.

## Architecture

### Routing / mode detection
A single page with three modes, determined **only** by `location.hash` on mount:

| Hash | Mode | Entry state |
|---|---|---|
| *(none)* | sender | `step: 'who'` (or restored draft from `localStorage`) |
| `#i=<base64>` | receiver | `rStep: 'tease'`, invite payload merged into state |
| `#r=<base64>` | sender | `step: 'answered'`, reply payload in `reply` |

### Payloads
Encode: `btoa(unescape(encodeURIComponent(JSON.stringify(obj))))` with trailing `=` stripped.
Decode: `JSON.parse(decodeURIComponent(escape(atob(str))))`, stripping non-base64 chars first, wrapped in try/catch returning `null`.

Invite (`#i=`): `{ name, shortlist, days, hours, line }`
Reply (`#r=`): `{ name, place, day, hour, note }`

`shortlist` items and `place`: `{ id, lat, lon, name, addr }`.

Links are built as `location.origin + location.pathname + '#i=' + payload`. Note: long shortlists make long URLs — 3 places is the enforced cap and stays well under practical URL limits.

### Persistence
Sender draft only, `localStorage` key `ayf:draft`, holding `{ name, shortlist, days, hours, line, step }`. Written on change of any of those while in sender mode and not on the `answered` step. Restored on mount **only if** no hash is present and `name` is non-empty. Cleared by "ask someone else". The receiver persists nothing.

### External services
- **Place search**: Nominatim (OpenStreetMap), keyless.
  `GET https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&q=<query>`
  Map each result to `{ id: String(place_id), lat, lon, name: r.name?.trim() || r.display_name.split(',')[0], addr: r.display_name.split(',').slice(1,3).join(',').trim() }`. Failure → empty results, no error UI beyond the status line.
  **Production note:** Nominatim's usage policy requires a descriptive `User-Agent`/`Referer` and rate limits to ~1 req/sec. For real traffic, proxy it or switch to a keyed provider (Google Places, Mapbox, Photon).
- **Map**: Leaflet 1.9.4 + `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `attributionControl: false` (**re-enable attribution in production** — OSM requires it). Initial view `[40.7181, -73.9584]`, zoom 12. After search, drop a marker per result and `fitBounds(coords, { padding: [30,30], maxZoom: 15 })`. Call `invalidateSize()` ~120 ms after the container mounts.
- **AI opening lines**: optional. If a completion helper is available, request 3 lines; otherwise fall back to three built-in lines (below). Always graceful — never block the flow.

### Place imagery (duotone) — important detail
There are no photos. Each place's "photo" is its **OSM map tile**, cropped to the venue and duotoned so it reads as app art rather than a map screenshot.

1. Compute the tile and the venue's fractional position inside it at `z = 15`:
   ```
   n  = 2^15
   fx = (lon + 180) / 360 * n
   fy = (1 - ln(tan(latRad) + 1/cos(latRad)) / π) / 2 * n
   x  = floor(fx);  y = floor(fy)
   url = https://tile.openstreetmap.org/15/{x}/{y}.png
   px  = (fx - x) * 100      // percent within tile
   py  = (fy - y) * 100
   ```
2. Paint it:
   ```css
   background-image: linear-gradient(160deg, oklch(0.58 0.16 32), oklch(0.36 0.07 52)), url(<tile>);
   background-size: cover, 260%;
   background-position: center, <px>% <py>%;
   background-repeat: no-repeat;
   background-color: #e6dcc7;
   background-blend-mode: color, normal;
   filter: contrast(1.12) saturate(.92) brightness(1.02);
   ```
   `background-blend-mode: color` takes hue/saturation from the gradient and luminosity from the tile — a true duotone. Using `center` for position (instead of the computed `px`/`py`) is a bug: it shows the middle of the tile, up to ~600 m from the venue.
3. With no place, render a plain `#e6dcc7` block at the same height.

Heights used: 84 (shortlist thumb), 150 (his answered card), 190 (her deck card, her confirmed card). Preview thumbs use 84.

## Screens / Views

Global page: `min-height: 100vh`, `padding: 26px 18px 64px`, column flex, `align-items: center`, `gap: 18px`, background `radial-gradient(circle at 50% 0%, #efe7d6, #ddd0b6)`, base font `'EB Garamond', Georgia, serif`.

### Sender shell
Card: `max-width: 940px`, `background #fbf6ec`, `1px solid #d8cbb2`, `border-radius 16px`, `box-shadow 0 20px 46px rgba(60,45,25,.14)`, `overflow: hidden`, mount animation `rise .4s ease`.
Header bar: `padding 16px 26px`, `border-bottom 1px solid #e6dcc7`, space-between. Left: "Are You Free", 600 20px, `letter-spacing .02em`. Right: step label, 11px monospace, `#9c907c` — `1 / 5`, `2 / 5 · places`, `3 / 5 · nights`, `4 / 5 · the words`, `5 / 5 · preview`, `sealed`, `she answered`.

**1. Who (`who`)** — `padding 58px 34px 62px`, centered column, `gap 18px`.
- Eyebrow: "let's do this properly", Caveat 400 16px, `#8a7f6b`, `letter-spacing .04em`.
- H1: "Who are you asking?", 500 `clamp(32px, 7vw, 46px)`, `line-height 1.06`, `max-width 540px`, `text-wrap: pretty`.
- Name input: `max-width 340px`, centered, 26px, no border except `border-bottom 1.5px solid #c9bda3`, transparent background. Enter advances.
- CTA: `find places she'd like →` when a name is entered, else disabled `a name, first`.
- Foot: "no account, no server. the whole invite travels in a link you send her." 11px monospace `#a89c86`, `line-height 1.7`.

**2. Places (`places`)** — two columns, wrapping (`flex: 1 1 400px` / `1 1 270px`), left column `border-right: 1px solid #e6dcc7`, right column background `#f6efe0`, both `padding 22px 24px`, `gap 11–12px`.
- Left: H2 "Where might {name} like?" 500 27px. Search row: input (`padding 11px 13px`, `1px solid #d3c7ae`, `radius 9px`, `background #fffdf7`, 16px, Enter submits) + "find" button (`background #26221c`, `color #faf5ea`, `radius 9px`, `padding 11px 17px`).
- Status line, 11px monospace `#9c907c`: `real places, real map — search anything` / `looking…` / `N places · tap to shortlist`.
- Results list: `max-height 240px`, scroll, `gap 7px`. Row: `radius 10px`, `padding 9px 12px`, `background #fffdf7`, border `1px solid #e0d5be` → `oklch(0.52 0.15 27)` when shortlisted. Name 17px, address 12px monospace `#9c907c`. Tap adds to shortlist (no-op if already there or at 3).
- Map container: `flex 1`, `min-height 230px`, `1px solid #d3c7ae`, `radius 10px`, background `#efe7d6`. Leaflet canvas gets `filter: sepia(.42) saturate(1.15) contrast(1.03)`.
- Right: label `SHORTLIST · N / 3`, 11px monospace. Cards: `1px solid #d3c7ae`, `radius 11px`, `background #fffdf7`, duotone strip at 84px, then `padding 9px 11px` row with name 17px / address 12px monospace and a `✕` remove control (12px monospace `#a89c86`).
- Hint, Caveat 15px `#9c907c`: 0 places → "search, then tap a place to add it"; 1–2 → "two or three is the sweet spot"; 3 → "perfect. lock it in."
- CTA: `next: your free nights →` (enabled at ≥1 place) else `add at least one place`.

**3. Times (`times`)** — `padding 28px 30px 32px`, `gap 15px`.
- H2 "When are you free, hero?" 500 29px. Sub, Caveat 17px `#8a7f6b`: "offer at least two nights — options are easier to say yes to".
- Day pills (multi-select): `Thu, Fri, Sat, Sun, next week`. Hour pills (multi-select): `coffee o'clock, 6:30, 7:30, 9:00`.
- Actions: ghost "back" + CTA `next: the words →`, enabled only when ≥1 day **and** ≥1 hour, else `pick a night and an hour`.

**4. Line (`line`)** — `padding 28px 30px 32px`, `gap 14px`.
- H2 "Say something to open with." 500 29px.
- Textarea: `min-height 104px`, `1px solid #d3c7ae`, `radius 11px`, `padding 14px`, `background #fffdf7`, 19px, `line-height 1.45`, `resize: none`.
- Ghost button `help me write it` → `thinking…` while loading. Note beside it, 11px monospace: "three options — tap one to use it", or the fallback notice "wrote these myself — edit freely".
- Suggestion cards (0–3): `1px dashed #c9bda3`, `radius 11px`, `padding 12px 15px`, `background #f8f2e4`, **Caveat 400 22px**, `line-height 1.3`. Tap fills the textarea.
- Actions: ghost "back" + CTA `preview her view →`.

**5. Preview (`preview`)** — `padding 28px 30px 34px`, `gap 15px`.
- H2 "This is what {name} gets." 500 29px.
- Panel: `1px solid #d3c7ae`, `radius 12px`, `background #f6efe0`, `padding 18px`, `gap 12px`. The line in Caveat 24px, `line-height 1.35`; a wrapping row of 150px place cards (duotone 84px + name 15px); then the offer line, 12px monospace `#9c907c`, formatted `days.join(' · ') || 'any night'` + two spaces + `·` + two spaces + `hours.join(' · ') || 'any time'`.
- Actions: ghost "back" + CTA `seal it →`.

**6. Share (`share`)** — `padding 40px 30px 44px`, centered, `gap 16px`.
- Wax seal: 66px circle, `background oklch(0.52 0.15 27)`, `color #fbf1e2`, Caveat 26px "ask", animation `seal .6s ease both`.
- H1 "Sealed. Send it to {name}." 500 `clamp(28px, 6vw, 36px)`. Sub, Caveat 19px `#8a7f6b`: "everything's in the link — she opens it and answers there".
- Link box: `max-width 520px`, `1px solid #d3c7ae`, `radius 10px`, `background #fffdf7`, `padding 12px 14px`, 12px monospace `#7d7466`, `word-break: break-all`.
- Buttons: primary `copy her link` → `copied ✓` for 2.2 s; ghost `share…` (Web Share API with text `"<line> →"`, falling back to copy); ghost `see her view` (switches to receiver mode in-place with the current draft, resetting receiver state).
- Explainer, 11px monospace `#a89c86`: "when she answers she'll get a link to send back — paste it here and you'll see her reply."
- Reply-paste row: input "paste her reply link…" + ghost `open`. Accepts a full URL or a bare payload: find `#r=`, decode the remainder, else decode the whole string. Valid if the result has `day` or `place`; otherwise show `that doesn't look like her reply link` in `oklch(0.5 0.14 30)`, 12px monospace.

**7. Answered (`answered`)** — `padding 44px 30px 50px`, centered, `gap 16px`.
- Eyebrow `SHE ANSWERED`, 13px monospace, `oklch(0.52 0.15 27)`, `letter-spacing .14em`.
- H1 `{name || 'She'} said yes.` 500 `clamp(30px, 7vw, 42px)`, `line-height 1.06`.
- Card, `max-width 470px`: duotone 150px, then `padding 16px 18px` with summary `{place.name || 'your idea'} · {day} · {hour}` at 22px and the note in Caveat 20px `#6f6555`, curly-quoted, or "no note. mysterious."
- Buttons: primary `add to calendar` (downloads `date.ics`), ghost `ask someone else` (clears draft, clears hash, full reset).

### Receiver shell
Column, `max-width 520px`, `gap 14px`, animation `rise .4s ease`. Cards share `background #fbf6ec`, `1px solid #d8cbb2`, `radius 16px`, `box-shadow 0 20px 46px rgba(60,45,25,.14–.15)`.

**A. Tease (`tease`)** — whole card is clickable. `padding 54px 30px 58px`, centered, `gap 20px`.
- Envelope: 196×130, `1px solid #cfc2a8`, `radius 6px`, `background linear-gradient(#f6efe0, #efe5d0)`, `box-shadow inset 0 -14px 26px rgba(120,100,70,.09)`, animation `sway 4s ease-in-out infinite`.
- Flap: absolutely positioned top, `height 66px`, `background linear-gradient(#f1e8d6, #e9dec8)`, `clip-path polygon(0 0, 100% 0, 50% 100%)`, `border-bottom 1px solid #d8cbb2`, `transform-origin: top`. On open: `flap .7s ease forwards`.
- Wax seal: 48px circle, `oklch(0.52 0.15 27)`, Caveat 23px "ask", `z-index 2`, `seal .6s ease .1s both`.
- H1: `{name}, something arrived.` (or "Something arrived for you."), 500 `clamp(28px, 7vw, 38px)`. Sub, Caveat 21px: `N ideas inside. he's sweating.` (singular "idea" at 1; bare "he's sweating." with none).
- Primary-styled `break the seal →`. Click sets the flap animation, then advances after 620 ms.

**B. Deck (`deck`)** — `padding 22px 22px 26px`, `gap 14px`.
- His line in Caveat 23px, `line-height 1.35`.
- Row: `Idea N of M` 500 22px + progress dots `● ○ ○` 11px monospace `#9c907c`.
- Stack, `position: relative; height: 330px`. Two decorative under-cards: `inset 16px 4px 4px 16px` (`1px solid #ded2b9`, `background #f4ecdb`) and `inset 8px 10px 10px 8px` (`1px solid #e3d8c1`, `background #f8f2e5`), both `radius 13px`. Top card: `inset 0 16px 16px 0`, `1px solid #cfc2a8`, `radius 13px`, `background #fffdf7`, `overflow hidden`, `box-shadow 0 8px 20px rgba(60,45,25,.1)`; duotone 190px, then `padding 14px 16px` with name 500 24px and address 12px monospace.
- Swipe transition on the top card: `transform .26s cubic-bezier(.4,0,.2,1)`, `translateX(150%) rotate(16deg)` for yes, `translateX(-150%) rotate(-16deg)` for nah. After 260 ms: yes → set `rPicked`, go to `when`; nah → next index, or wrap to index 0 if it was the last.
- Buttons: 60px circles. "nah" = `1px solid #c9bda3` on `#fffdf7`; "yes" = filled `oklch(0.52 0.15 27)`, `#fbf1e2`. Both Caveat 20px.

**C. When (`when`)** — `padding 24px`, `gap 14px`, animation `rise .3s ease`.
- H2 `{place.name}. good pick.` 500 28px, `line-height 1.12`. Sub = his offer line, Caveat 19px `#8a7f6b`.
- Day pills (single-select) from his `days`, defaulting to `['Fri','Sat','Sun']`; hour pills (single-select) from his `hours`, defaulting to `['6:30','7:30']`.
- Note textarea: `min-height 84px`, `1px dashed #c9bda3`, `radius 11px`, `padding 13px`, 18px, placeholder "add a line back, if you're feeling brave…".
- CTA `send it back →`, enabled only with a day **and** an hour, else `pick a night and an hour`.

**D. Sent (`sent`)** — `padding 64px 30px`, centered, `position: relative`, `overflow: hidden`.
- 26 confetti pieces, absolutely positioned, `top: -20px`, `left: (i*3.8+2) % 100 %`, width `6 + (i%3)*3`, height `10 + (i%4)*3`, `radius 2px`, colors cycling `oklch(0.52 0.15 27)` / `oklch(0.72 0.11 70)` / `#cfc2a8`, animation `fall {1.6 + (i%5)*0.35}s linear {(i%7)*0.12}s forwards`.
- H1 "It's a date." 500 `clamp(30px, 8vw, 40px)`. Sub, Caveat 21px: "he's going to reread this eleven times."
- Auto-advances to `done` after 2300 ms.

**E. Done (`done`)** — duotone 190px header, then `padding 22px 24px 26px`, `gap 10px`.
- Eyebrow `YOUR ANSWER`, 13px monospace `oklch(0.52 0.15 27)`, `letter-spacing .14em`.
- `{day} · {hour}` at 500 `clamp(26px, 6vw, 32px)`; `{place.name} — {place.addr}` at 19px `#5c5344`; note in Caveat 20px `#6f6555` or "no note. mysterious."
- Divider `border-top 1px solid #e6dcc7`, `margin-top 6px`, `padding-top 14px`. Caveat 16px `#8a7f6b`: "one last thing — send this back so he knows". Buttons: primary `copy my reply link` → `reply link copied ✓`; ghost `share…` (Web Share, text "yes →"); ghost `add to calendar`.

### Footer line
11px monospace `#9c8f79`, `max-width 520px`, centered, `line-height 1.7`.
Sender: "Live OpenStreetMap places. Nothing is stored anywhere — the invite and her reply both travel inside their links."
Receiver: "Answer here, then send him the reply link. Nothing is stored on any server."

## Interactions & Behavior
- **Gating**: every step's CTA is disabled until its requirement is met, and the disabled state carries instructional copy (`a name, first`, `add at least one place`, `pick a night and an hour`) rather than being greyed out silently. Disabled styling: transparent background, `1px dashed #c9bda3`, `color #a89c86`, `cursor: default`.
- **Copy feedback**: label swaps to a `✓` state for 2200 ms. Use the async Clipboard API with a hidden-textarea + `execCommand('copy')` fallback (needed for non-secure contexts).
- **Share**: `navigator.share({ text, url })`, silently ignoring rejection; falls back to copy when unavailable.
- **Calendar**: builds a minimal VCALENDAR string and triggers a `data:text/calendar` download named `date.ics`. Summary `{place} — {day} {hour}`, `LOCATION` from the address, `DESCRIPTION` from the note. Works from either side (his `reply`, or her local picks).
- **Enter keys**: name field advances; search field submits.
- **Motion** (the user asked for showy): `rise` on step entry, `seal` on the wax stamp, `flap` on the envelope, `sway` idle on the closed envelope, `fall` confetti, and the card swipe transform. Respect `prefers-reduced-motion` in production — the prototype does not.
- **Responsive**: sender columns wrap at their flex bases (~670px); headings use `clamp()`; receiver column is capped at 520px and works down to ~360px.
- **Empty/error**: search failure yields no results and no alert; AI failure silently falls back; malformed reply link produces an inline message.

## State Management
Sender: `step`, `name`, `query`, `results`, `searching`, `searched`, `shortlist`, `days`, `hours`, `line`, `suggestions`, `loadingAi`, `aiErr`, `copied`, `replyPaste`, `pasteErr`, `reply`.
Receiver: `rStep`, `ri` (deck index), `rPicked`, `rDay`, `rHour`, `rNote`, `swipe` (`'left' | 'right' | null`), `flap`, `copiedReply`.
Shared: `mode` (`'send' | 'receive'`).

Transitions: `who → places → times → line → preview → share`; `share → answered` via a pasted reply link, or `#r=` on load. Receiver: `tease → deck → when → sent → done`, with `deck` looping on "nah".

Data fetching: Nominatim on explicit search only; optional AI call on explicit tap. Nothing else touches the network besides map tiles.

## Design Tokens

Colors
| Token | Value |
|---|---|
| page gradient | `radial-gradient(circle at 50% 0%, #efe7d6, #ddd0b6)` |
| body bg (fallback) | `#e7ddc9` |
| paper / card | `#fbf6ec` |
| paper, raised input | `#fffdf7` |
| paper, sunken panel | `#f6efe0` |
| suggestion card | `#f8f2e4` |
| deck under-cards | `#f4ecdb`, `#f8f2e5` |
| envelope body | `linear-gradient(#f6efe0, #efe5d0)` |
| envelope flap | `linear-gradient(#f1e8d6, #e9dec8)` |
| photo placeholder | `#e6dcc7` |
| ink (text) | `#26221c` |
| ink on dark | `#faf5ea` / `#fbf1e2` |
| secondary text | `#5c5344`, `#6f6555` |
| muted text | `#7d7466`, `#8a7f6b` |
| faint text | `#9c907c`, `#9c8f79`, `#a89c86` |
| hairline | `#e6dcc7` |
| border | `#d8cbb2`, `#d3c7ae`, `#e0d5be`, `#cfc2a8`, `#c9bda3`, `#ded2b9`, `#e3d8c1` |
| accent (wax red) | `oklch(0.52 0.15 27)` |
| accent, link/error | `oklch(0.5 0.14 30)` |
| duotone light | `oklch(0.58 0.16 32)` |
| duotone dark | `oklch(0.36 0.07 52)` |
| confetti gold | `oklch(0.72 0.11 70)` |
| confetti neutral | `#cfc2a8` |

Typography — `'EB Garamond', Georgia, serif` for structure (400/500/600), `'Caveat', cursive` for anything handwritten (400/500/700), `ui-monospace, Menlo, monospace` for meta labels (11–13px).
Scale: 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 27, 28, 29 px; fluid heads `clamp(26px, 6vw, 32px)`, `clamp(28px, 6vw, 36px)`, `clamp(28px, 7vw, 38px)`, `clamp(30px, 7vw, 42px)`, `clamp(30px, 8vw, 40px)`, `clamp(32px, 7vw, 46px)`.
Letter-spacing: `.02em` (wordmark), `.04em` (eyebrow), `.14em` (monospace eyebrows).

Spacing — 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 34, 40, 44, 50, 54, 58, 62, 64 px.
Radius — 2 (confetti), 6 (envelope), 9, 10, 11, 12, 13, 16 (cards), 20/22/24 (pills & CTAs), 50% (circles).
Shadows — `0 20px 46px rgba(60,45,25,.14)` (cards), `0 8px 20px rgba(60,45,25,.1)` (deck top card), `inset 0 -14px 26px rgba(120,100,70,.09)` (envelope).

Keyframes
```css
@keyframes rise  { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
@keyframes seal  { 0% { transform:scale(.4) rotate(-25deg); opacity:0 }
                   60% { transform:scale(1.14) rotate(7deg); opacity:1 }
                   100% { transform:scale(1) rotate(0); opacity:1 } }
@keyframes flap  { from { transform:rotateX(0) } to { transform:rotateX(-165deg) } }
@keyframes fall  { to { transform:translateY(560px) rotate(600deg); opacity:0 } }
@keyframes pulse { 50% { opacity:.4; transform:scale(.94) } }
@keyframes sway  { 0%,100% { transform:rotate(-1.5deg) } 50% { transform:rotate(1.5deg) } }
```

## Copy reference
Day options: `Thu`, `Fri`, `Sat`, `Sun`, `next week`. Hour options: `coffee o'clock`, `6:30`, `7:30`, `9:00`.

AI system prompt: "You write short, warm, slightly teasing one-liners for asking someone on a date. Never cheesy, never a pickup line. 12-22 words each." User prompt supplies her name, the shortlisted place names, and the offered nights, and asks for exactly 3 lines, no numbering or quotes. Parse by splitting on newlines and stripping leading numbering/quotes/dashes; if the result is empty, fall back.

Fallback lines (used when no AI is available):
1. `okay, {name}, i've been rehearsing this for a week. are you free?` — the name and comma are omitted when there's no name.
2. `low-stakes proposal, high-stakes hope: pick a place, pick a night.`
3. `i found three good spots and cleared my calendar. your move.`

## Assets
None. No images, icon fonts, or SVG illustrations. All imagery is generated from OSM map tiles (see the duotone section); the wax seal and envelope are CSS. Fonts come from Google Fonts (EB Garamond, Caveat); Leaflet CSS/JS from unpkg. Self-host all four for production.

## Files
| File | What it is |
|---|---|
| `index.html` | Self-contained compiled build. **Open this first** — the most faithful reference for look and behavior. |
| `Ask Her Out - Site.dc.html` | Authored source: HTML template + JS logic class. Read for logic, state, and the encode/decode, search, and duotone implementations. |
| `Ask Her Out - Wireframes.dc.html` | Low-fi wireframes of the original flow, including an alternative desktop layout. Structure reference only — ignore the styling. |
| `support.js` | Runtime required by the `.dc.html` files. Not part of the design; do not port. |

## Fixed since the original bundle
1. **Payload encoding is base64url.** Standard base64 emits `+` and `/`; roughly 13% of realistic invites contained one. A `+` in a URL fragment is widely re-decoded as a space, and `decode()` then stripped it — silently corrupting the payload and shifting every later character. `encode()` now maps `+/` → `-_` and `decode()` accepts both alphabets, so links made by older builds still open.
2. **`navigator.share` sends the link.** It was called as `share({ text, url })`; iOS Safari keeps only `text` when both are present, so tapping "share…" sent the opening line and dropped the invite entirely. It now shares `{ url }`.
3. **`date.ics` is a valid calendar event.** It previously had no `DTSTART` at all and no escaping. Day/hour labels now resolve to a real datetime (evening hours are PM, "coffee o'clock" is 10:30), with `DTEND`, `UID`, `DTSTAMP`, RFC 5545 escaping of `\ ; ,` and newlines, 75-octet line folding, and CRLF endings.
4. **OSM attribution is on.** `attributionControl: false` was removed and the tile layer carries "© OpenStreetMap contributors" — a licence condition, not a style choice.
5. **`prefers-reduced-motion` is honoured**, which matters here because the app is motion-heavy (sway, seal, flap, confetti, swipe).
6. **Tab identity**: title is "An Invitation" with a wax-seal favicon. The old "Are You Free" title spoiled the envelope reveal for the receiver, since the tab is readable before she opens anything.

## Known gaps for production
1. **Reply loop is manual** — she copies a link back to him. A tiny key-value backend (or a signed short-link service) would let his screen update on its own; the prototype's poll-based version was removed because it only worked within one browser. Worth keeping manual: it preserves the no-server property the whole design rests on.
2. **URL length** grows with the shortlist; the 3-place cap keeps it safe. A short-link service would remove the constraint.
3. **Nominatim + OSM tiles usage limits.** Attribution is now correct, but the public endpoints still need a descriptive `User-Agent`/`Referer` and rate limiting. Two policy points to respect: Nominatim explicitly bans client-side **auto-complete** search (the current explicit-search button is the compliant design — don't make it live-as-you-type), and the tile policy treats non-viewport fetching as bulk downloading, which is what the duotone place "photos" technically do. For real traffic, proxy and cache both, or move to a keyed provider.
4. **Accessibility**: interactive elements are `div`s with click handlers. Port them as real `<button>`/`<input>` elements with labels and focus rings. This is the largest remaining gap — nothing is keyboard-reachable or screen-reader announced.
5. **Anyone with the link can open it** — the payload is base64, not encrypted. Fine for this use case; worth stating.
