# Map format: `darkview-map@1`

The normative specification of the darkview map document. A map is derived metadata about
one YouTube video's visual content — never video content itself. Readers and writers live
in the extension first (`source/data/map.ts` when implemented); this document is the
contract, and must be sufficient to implement either side without reading extension code.

## Envelope and versioning

A map is a single JSON document:

```json
{
    "schema": "darkview-map",
    "version": 1,
    "videoId": "K8BmMU1Tm-I",
    "duration": 2972,
    "generator": {
        "extensionVersion": "1.1.0",
        "method": "storyboard"
    },
    "quality": 0.62,
    "calibration": { "lightRatioP10": 0.05, "lightRatioP90": 0.61 },
    "segments": [
        { "start": 0, "end": 120, "ratio": 0.05 },
        { "start": 120, "end": 480, "ratio": 0.55 }
    ],
    "blockKeyframes": []
}
```

- `schema` MUST be `"darkview-map"`; `version` is an integer. Readers MUST reject documents
  whose `version` they do not know. Additive, backward-compatible fields MAY appear within
  a version; readers MUST ignore unknown fields.
- `videoId`: the YouTube video id (11-character id as found in `watch?v=`).
- `duration`: video length in seconds, positive finite number.

## `generator`

- `extensionVersion`: the manifest version of the producing extension build.
- `method`: how the map was produced. Version 1 defines:
  - `"storyboard"` — computed from seek-preview thumbnails (~160×90, ~10 s granularity).
  - `"playback"` — refined from full-resolution frames during real playback.
  Ranking for consumers choosing between maps: `playback > storyboard`. Unknown methods
  MUST be treated as lowest rank, not rejected.

## `segments` — the gate timeline (required, the core value)

An array of `{ start, end, ratio }`, all in seconds:

- `ratio` is the measured **bright-neutral background ratio** of the frame(s) covering the
  interval: the share of sampled pixels with Rec.-709 integer luminance ≥ 204 and chroma
  (max−min channel) ≤ 41. This is the same measurement as the live engine's
  `measureLightness` (see [ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Segments store ratios, not decisions.** The lit decision is made at read time:
  `lit = ratio ≥ gateRatio(sensitivity)`. This keeps one map valid for every user setting
  and lets threshold tuning ship without regenerating maps.
- Constraints (readers MUST validate): `0 ≤ start < end ≤ duration + 15`; segments sorted
  by `start`, non-overlapping; `ratio ∈ [0, 1]`. Gaps are legal and mean "no coverage" —
  consumers fall back to live gating there.

## `calibration` (optional)

`{ lightRatioP10, lightRatioP90 }` — the 10th/90th percentile of segment ratios. Consumers
MAY use these to tighten per-video thresholds (e.g. a video whose light segments cluster at
0.6 can gate at a higher ratio than the global default). Absent calibration means "use the
global profile".

## `blockKeyframes` (optional)

Reserved in version 1 for playback-refined block decisions:
`[{ t, grid }]` where `t` is seconds and `grid` is a run-length-encoded bitmap of qualified
20 px blocks over a 96×54 grid (1080p ÷ 20, row-major, RLE as alternating zero/one run
lengths, e.g. `[120, 4, 72, ...]`). Storyboard-method maps SHOULD leave this empty.
Consumers MAY ignore it entirely; it never replaces per-pixel keying, only pre-seeds block
qualification.

## `quality` (optional)

A [0, 1] self-assessment by the producer: coverage fraction × method weight
(`playback` 1.0, `storyboard` 0.7). A future aggregation service recomputes its own quality
from cross-submission agreement and MUST NOT trust the self-reported value for ranking
between different submitters.

## Size and hygiene

- Documents SHOULD stay under 10 KB; validators MUST reject documents over 64 KB.
- Producers SHOULD merge adjacent segments whose ratios fall on the same side of every
  profile threshold (0.28 / 0.35 / 0.45) within ±0.02 — the timeline is a decision aid,
  not an archive.
- A map contains no user data, no timestamps of watching, no identifiers other than the
  public `videoId`.
