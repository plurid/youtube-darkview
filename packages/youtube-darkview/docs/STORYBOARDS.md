# YouTube storyboards — access reference

Storyboards are the seek-preview thumbnails the YouTube player shows when scrubbing: small
frames covering the whole timeline, served as JPEG sprite sheets from `i.ytimg.com`. They
are the input for Stage 1 map generation ([MAPS.md](./MAPS.md)). Everything below was
verified empirically against live YouTube on 2026-07-22.

## Obtaining the spec

The storyboard specification lives in the player response:
`ytInitialPlayerResponse.storyboards.playerStoryboardSpecRenderer.spec`.

Two access paths, and why we use the second:

1. **Page global** — `window.ytInitialPlayerResponse` exists in the page's main world, which
   the content script's isolated world cannot read; worse, after SPA navigation it still
   describes the *first* video loaded.
2. **Watch-page fetch (chosen)** — `fetch('https://www.youtube.com/watch?v=' + videoId,
   { credentials: 'omit' })` from the content script is same-origin (~1.1 MB HTML,
   status 200 verified) and always describes the requested video. Extract from the HTML
   text: the JSON-escaped string following `"playerStoryboardSpecRenderer":{"spec":"`, and
   the duration from `"lengthSeconds":"…"`. Unescape the spec by JSON-parsing the quoted
   capture. The video id comes from the page URL (`watch?v=` query, `/shorts/{id}` path).

## Spec grammar

```
spec      = baseUrl "|" level *( "|" level )
baseUrl   = https://i.ytimg.com/sb/{videoId}/storyboard3_L$L/$N.jpg?sqp={token}
level     = width "#" height "#" frameCount "#" columns "#" rows "#" intervalMs "#" name "#" sigh
```

Observed example (`K8BmMU1Tm-I`, duration 2972 s):

| Level | width×height | frames | grid | intervalMs | name |
|---|---|---|---|---|---|
| L0 | 48×27 | 100 | 10×10 | 0 | `default` |
| L1 | 80×45 | 299 | 10×10 | 10000 | `M$M` |
| L2 | 160×90 | 299 | 5×5 | 10000 | `M$M` |
| L3 | 320×180 | 299 | 3×3 | 10000 | `M$M` |

## URL construction

For level index `L` (0-based position among the level entries) and sprite index `M`
(0-based, `ceil(frameCount / (columns × rows))` sprites per level):

1. Replace `$L` in the base URL with `L`.
2. Replace `$N` with the level's `name` field.
3. Replace the `$M` inside the result with the sprite index.
4. Append `&sigh=` + URL-encoded `sigh` field.

Frames fill each sprite row-major. Frame `i` covers video time
`[i × intervalMs, (i+1) × intervalMs) / 1000`. **Special case:** `intervalMs = 0` (L0)
means the frames spread evenly across the whole duration
(`effectiveInterval = duration / frameCount`), in a single sprite.

Verified fetch: the L3 sprite of the example returned 200, 39 124 bytes, 960×540 (3×3 grid
of 320×180).

## CORS (the finding that shapes the architecture)

`fetch(spriteUrl, { mode: 'cors' })` executed with the youtube.com page origin **succeeds**
against `i.ytimg.com`, and the resulting blob passes through `createImageBitmap` and canvas
`getImageData` without tainting. Content-script fetches follow the page's CORS rules, so:

- **No `i.ytimg.com` host permission is needed.**
- **No background service worker is needed** as a fetch proxy.

The extension's permission surface is unchanged by Stage 1.

## Level selection and budget

Prefer the level whose width is nearest 160 px (L2 above) — it matches the analysis
resolution the engine has always used, and `measureLightness` needs nothing finer. Budget
for the example video: 12 sprites × ~35–40 KB ≈ 0.45 MB fetched once per activation (not
per page view — only when the user actually toggles darkview). If bandwidth ever matters,
the 80×45 level costs about a quarter of that with modestly noisier ratios.

## Absence and failure

Storyboards are missing or unusable on some content: live streams, some premieres, some
region/age-restricted videos, and any future format drift. All failures — no spec found,
malformed spec, sprite fetch error, decode error — MUST degrade silently to the live
`FrameGate` path. Stage 1 is additive by contract: the shipped v1.0.2 behavior is the
floor.

## Fragility note

The spec format and its embedding in the watch page are YouTube internals, not an API.
They have been stable for years (the `storyboard3` scheme predates 2020) but can change
without notice; the parser must treat every assumption as falsifiable and fail toward the
live engine, never toward broken rendering.
