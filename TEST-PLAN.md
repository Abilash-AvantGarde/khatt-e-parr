# Khatt-e-Parr — Test Plan

**Build under test:** `main` @ URL-compaction commit
**Live target:** https://abilash-avantgarde.github.io/khatt-e-parr/
**Local target:** `index.html` (file://), `docker compose up` (http://localhost:8080)

## 1. Why this app is unusual to test

There is no server, no database and no account. That removes whole categories of
risk (no authn, no session, no SQL) and concentrates all of it in one place:
**the URL is the database.** Every defect that matters is either a defect in
encoding state into a link, decoding it back, or in what the two people see while
that link travels between them.

Two consequences shape the plan:

- **A corrupted link is unrecoverable.** There is no server copy to fall back to.
  If she opens a broken invite, the interaction is simply lost, and he never
  knows. Payload integrity is therefore Severity-1 by default.
- **The two halves are asynchronous and human-mediated.** He sends a link, she
  answers, she sends a link back. Failures at the seams (clipboard, share sheet,
  messaging-app URL mangling) are as damaging as logic bugs, and are invisible in
  unit tests.

## 2. Scope

**In scope:** payload encode/decode and backward compatibility; sender state
machine and draft persistence; receiver flow; reply loop; calendar export;
clipboard and share; Nominatim and tile integration; accessibility; responsive
behaviour; unicode; browser compatibility; performance of the ~1 MB bundle;
error handling under network failure; Docker/nginx deploy and CSP.

**Out of scope:** the `.dc.html` authoring runtime (`support.js`) as a product;
OpenStreetMap's own data quality; load/stress testing of third-party endpoints
(explicitly discouraged by their usage policies).

## 3. Severity

| Sev | Meaning | Examples |
|---|---|---|
| **S1** | Interaction is lost or silently wrong | Payload corrupts; invite opens blank; reply link doesn't carry the answer |
| **S2** | Core flow blocked or badly degraded | Cannot shortlist; CTA never enables; share sends nothing |
| **S3** | Wrong or confusing output, workaround exists | `.ics` has wrong time; copy button gives no feedback |
| **S4** | Cosmetic or polish | Spacing, wording, minor motion |

**S1 and S2 block release.** S1 defects in payload handling are treated as
release-stopping regardless of estimated frequency, because they are silent.

## 4. Test approach

Six primary surfaces, each owned by a dedicated tester, plus six specialist
surfaces. Every reported defect must include a concrete reproduction — exact
input, exact observed output, exact expected output — and is then independently
challenged before it is accepted. Findings that cannot be reproduced from the
written steps are rejected, however plausible they sound.

### Surfaces

1. **Payload / URL** — encode, decode, base64url, legacy compatibility, coordinate
   rounding, length limits, truncation, tampering, malformed input.
2. **Sender state machine** — step gating, draft save/restore, "ask someone else"
   reset, shortlist cap and dedupe, back navigation.
3. **Receiver flow** — tease, deck swipe and wrap, single-select pills, note,
   send-back, the full round trip he→her→him.
4. **Calendar / clipboard / share** — `.ics` validity (RFC 5545), day/hour
   resolution, escaping, folding, clipboard fallback, `navigator.share` shape.
5. **Security** — XSS through place names, addresses and notes; `javascript:`
   and `data:` URLs; prototype pollution via decoded JSON; CSP effectiveness.
6. **Deploy** — Docker build, unprivileged runtime, read-only FS, healthcheck,
   headers on every route, live Pages parity.
7. **Accessibility** — keyboard reachability, focus, screen-reader semantics,
   `prefers-reduced-motion`, contrast.
8. **Responsive / mobile** — 320–1440 px, wrap points, touch targets, iOS quirks.
9. **Unicode / i18n** — emoji, RTL, CJK, combining marks, very long names.
10. **Browser compatibility** — API availability and graceful degradation.
11. **Performance** — 1 MB bundle unpack time, memory, tile fetch volume.
12. **Error handling** — Nominatim failure, tile failure, offline, slow network.

## 5. Entry / exit criteria

**Entry:** build renders locally and on the live URL; both formats decode.

**Exit:** zero open S1; zero open S2; every S3 either fixed or documented in
*Known gaps* with a rationale; the round trip (build → send → answer → reply →
read) verified end to end on the live URL.

## 6. Regression set

These must pass on every change to the wire format or the flow:

- A 3-place invite with unicode name and note round-trips exactly.
- A legacy verbose-format link still opens.
- `+`/`/` mangling (`+` → space) does not corrupt any payload.
- A reply link pasted into the share screen resolves to the answered view.
- The generated `.ics` parses and carries a correct `DTSTART`.
- Tab title and favicon survive first paint.
