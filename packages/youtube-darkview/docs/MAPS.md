# Darkview Maps

The design for evolving YouTube Darkview from a purely real-time engine into one driven by
per-video analysis maps. Status: **design document — Stage 1 is planned, nothing here is
implemented yet.** The engine it builds on is described in [ARCHITECTURE.md](./ARCHITECTURE.md);
the map data format in [MAP_FORMAT.md](./MAP_FORMAT.md); the storyboard mechanics in
[STORYBOARDS.md](./STORYBOARDS.md); the privacy consequences in [PRIVACY.md](./PRIVACY.md).

## Why maps

The shipped engine decides per frame, in real time, from pixel statistics alone. Four limits
are structural to that position:

1. **Temporal lag and flicker.** The frame gate cannot see ahead, so it needs hysteresis
   (2 frames in, 3 out) and re-qualifies from scratch after seeks and slide transitions.
   A map knows every transition in advance; decisions become instant and exact.
2. **Global thresholds.** The balanced gate ratio (0.35) is one number for all of YouTube.
   Measured light-slide ratios span 0.40–0.75 per video (see data below); per-video
   calibration is strictly better than any global constant.
3. **Semantic blindness.** Pixel statistics cannot distinguish a photograph's white
   background from a slide's white background. Only offline/semantic analysis can.
4. **Hot-path cost.** Every decision runs during playback. Pre-analysis moves the gate
   decision off the hot path entirely; unlit frames skip even the draw.

### Measured evidence (live sessions, 2026-07-22)

| Content | Bright-neutral ratio |
|---|---|
| Michael Levin lecture (`K8BmMU1Tm-I`), 7 samples across 49 min | 0.46 – 0.65 |
| Zhigang Suo seminar (`45U-Q-CZ3nI`), 6 samples across 66 min | 0.40 – 0.74 |
| Synthetic dark slide (white text, bright photos on near-black) | ≈ 0.15 |
| Dark/colorful footage (trailer) | ≪ 0.3, gate never lit |

The gap between "light slides, however busy" (≥ 0.40) and "everything else" (≤ 0.3) is what
the gate thresholds exploit; maps make the same decision with per-video knowledge instead of
a global constant.

## The load-bearing principle: ToS safety

**Maps are computed only where the video legitimately plays — the watcher's own player
session.** The extension already reads frames there; analysis is the same act. Any future
service stores and serves *derived metadata only* (segment ratios, block grids — numbers we
computed), never video content, and **no server ever fetches YouTube video streams**. This
keeps every stage outside the problem space of scraping/downloading YouTube content.

## Stage 1 — local storyboard maps (planned, target release: manifest 1.1.0)

YouTube serves seek-preview thumbnails (storyboards) for nearly every video: small frames
covering the whole timeline, typically 160×90 every 10 seconds — coincidentally the exact
analysis budget this extension has always used. On activation, the extension:

1. Fetches the video's storyboard specification and sprites (client-side, CORS-verified;
   see [STORYBOARDS.md](./STORYBOARDS.md) — no new permissions required).
2. Runs the existing `measureLightness` (`source/contentscript/blocks.ts`) over every
   storyboard frame — a whole-video gate timeline in roughly 1–2 seconds.
3. Builds a `GateTimeline`: time-indexed segments carrying measured **ratios** (not
   booleans — the lit decision is made at read time against the viewer's sensitivity, so
   the slider keeps working and one map serves all settings).
4. The renderer consults the timeline before the live `FrameGate`. Where the timeline has
   coverage, decisions are instant, flicker-free, seek-proof, and unlit frames cost nothing.
   Where it does not (live streams, missing storyboards, out-of-range times), the live gate
   is the unchanged fallback — Stage 1 can only add quality, never regress.

Sketch of the implementation surface:

- `source/contentscript/storyboard.ts` — spec acquisition (SPA-safe watch-page fetch),
  spec parsing, sprite fetching, frame slicing.
- `source/contentscript/timeline.ts` — `GateTimeline` with `litAt(time, gateRatio)`,
  segment building, per-video calibration percentiles.
- `source/contentscript/engine.ts` — `OverlayOptions` gains an optional timeline; the
  engine resolves the current video id (watch URL) and builds the timeline lazily on first
  activation per video, generation-guarded like all its async work.

Non-goals for Stage 1: no persistence (maps are in-memory per page), no uploads, no new
permissions, no settings changes.

## Stage 2 — community map service (direction only, not committed)

If Stage 1 proves out and usage justifies it: a minimal API through which watchers' clients
share the maps they computed.

- `GET /v1/maps/{videoId}` → best available map, or 404 (client falls back to Stage 1).
- `POST /v1/maps/{videoId}` → schema-validated, size-capped client submission.
- Aggregation: retain last N submissions per video; serve the consensus/highest-quality map
  (method ranking, coverage, cross-submission agreement — see MAP_FORMAT.md `quality`).
- Abuse: strict schema validation, sanity bounds against duration, per-IP rate limits.
- Infrastructure: trivially small (key-value storage of ≤10 KB JSON documents); an edge
  worker + KV store is sufficient at any plausible scale.
- Extension side: strictly **opt-in** (default off), the API host declared as an *optional*
  host permission requested at runtime, so the default install keeps its zero-network
  posture. Privacy consequences and required policy work: [PRIVACY.md](./PRIVACY.md).

The cold-start economics work because Stage 1 exists: the first watcher of any video gets
storyboard-quality maps locally and seeds the shared map; the service adds value from
viewer two onward.

## Further out

A semantic tier (on-device model classifying blocks as text/photo/face, so photographs with
white backgrounds are protected pixel-perfectly) is possible entirely client-side and is
deliberately out of scope until real usage justifies the effort. Everything above is free;
monetization is a question deferred until there is traction to inform it.

## Rollout

1. **Manifest 1.1.0** — Stage 1, local storyboard maps. A pure quality release with an
   unchanged privacy posture.
2. Evaluate on real usage (does the timeline hit-rate justify a service?).
3. Decide Stage 2 separately, with its privacy policy and listing update as part of the work.
