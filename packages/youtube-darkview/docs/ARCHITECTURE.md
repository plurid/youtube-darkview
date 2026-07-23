# Architecture

The engine of YouTube Darkview as shipped in v1.0.2 (extension manifest 1.0.2). This document
describes what exists; the forward design lives in [MAPS.md](./MAPS.md).

## Overview

YouTube Darkview is a Manifest V3 Chrome extension with two entry points and no background
service worker:

- `source/contentscript/index.ts` — injected on `https://*.youtube.com/*` at `document_idle`.
  Owns the page lifecycle: keyboard shortcut, settings loading and change subscription,
  popup messaging, and a `DarkviewEngine` instance.
- `source/popup/index.tsx` — the toolbar popup (React + styled-components + plurid
  components). Reads and writes shared preferences, toggles the engine on the active tab.

The only permission is `storage`. There is no network use of any kind.

## Modules

| Module | Responsibility |
|---|---|
| `source/contentscript/engine.ts` | `DarkviewEngine` (lifecycle, video binding, scheduling, effects) and `CanvasBlockOverlay` (the renderer) |
| `source/contentscript/blocks.ts` | Pure pixel logic: `measureLightness`, `invertLightBlocks`, `FrameGate`, `SENSITIVITY_PROFILES` |
| `source/contentscript/shortcut.ts` | `isDarkviewShortcut` (alt-only chord, AltGr-safe), `isEditableTarget` (never toggle while typing) |
| `source/data/settings.ts` | Settings schema v2, normalization, legacy migration, storage IO |
| `source/data/messages.ts` | Typed popup↔page messages (`GET_STATE`, `TOGGLE`) and `DarkviewStatus` |
| `source/logic/utilities.ts` | `getActiveTab` for the popup |

## The two modes

- **`always`** ("invert" in the popup): a CSS filter on the video element —
  `invert(1) hue-rotate(180deg) brightness(var(--youtube-darkview-intensity, 0.9))
  contrast(0.92) saturate(0.9)`, applied via the `data-youtube-darkview` attribute and a
  `<style>` element (`youtube-darkview-filter-style`). Whole-frame, cheap, dumb.
- **`adaptive`** ("content-aware" in the popup): an overlay `<canvas>`
  (`youtube-darkview-overlay`) positioned over the video inside its parent container.
  Each rendered frame is drawn to the canvas, analyzed, selectively inverted, and painted
  back. When the frame does not qualify, the canvas hides and the pristine video shows
  through.

## The content-aware decision ladder

Every rendered frame passes through three levels, all in `blocks.ts`:

1. **Frame gate.** `measureLightness` samples the frame on a stride of 4
   (`MEASURE_STRIDE`) and reports the share of *background* pixels. A pixel is background
   when `luminance ≥ 204` (`BACKGROUND_MIN_LUMINANCE`) **and** `chroma ≤ 41`
   (`BACKGROUND_MAX_CHROMA`) — bright and nearly neutral, which deliberately excludes pale
   skin, sepia photographs, and sky. `FrameGate` applies hysteresis: 2 consecutive
   qualifying frames to switch on, 3 to switch off (1 in each direction for stable/paused
   frames). Frames that never light the gate are never touched.
2. **Block qualification.** `invertLightBlocks` divides the frame into `BLOCK_SIZE = 20` px
   blocks (clipped edge blocks measured by their real pixel count) and qualifies a block
   when its background-pixel fraction reaches the profile's `blockFraction`.
3. **Per-pixel keying.** Inside qualified blocks, a pixel flips when it is background, or
   when it is neutral ink (`chroma ≤ 24`, `NEUTRAL_INK_MAX_CHROMA`) — text glyphs and gray
   line-work — so even tinted photo shadows survive inside a straddling block. Blocks that
   merely *border* a qualified region flip only background pixels and near-black ink
   (`luminance ≤ 90`, `DARK_INK_MAX_LUMINANCE`): the dark rule keeps bold glyph bodies
   readable, the restriction keeps mid-gray photo edges untouched. Inverted channels are
   scaled by the intensity setting: `out = (255 − in) × intensity`.

Luminance is integer Rec.-709: `(2126·r + 7152·g + 722·b) / 10000`; chroma is
`max(r,g,b) − min(r,g,b)`.

### Sensitivity profiles

`SENSITIVITY_PROFILES` maps the three-step sensitivity setting to thresholds:

| Sensitivity | `gateRatio` | `blockFraction` |
|---|---|---|
| low | 0.45 | 0.65 |
| balanced | 0.35 | 0.5 |
| high | 0.28 | 0.4 |

Calibrated against live measurements (2026-07-22): light lecture slides measure 0.40–0.75
background ratio even when dense with figures; dark and colorful footage stays well below
0.3. The gate ratios sit in that gap.

## Scheduling

- Rendering is paced by `requestVideoFrameCallback` when available — one render per
  presented frame, naturally silent while paused or hidden. Fallback: a
  `RENDER_INTERVAL_MS = 33` ms timer that refuses paused videos.
- Paused videos are rendered once per state change (pause, seek, visibility return) rather
  than looped.
- A hidden document suspends the loop (`visibilitychange` resumes it).
- Video binding: the engine picks the largest connected `<video>`, re-evaluated 100 ms
  (`VIDEO_REBIND_DELAY_MS`) after DOM mutations — this is what survives YouTube SPA
  navigation. `emptied`/`loadeddata` reconfigure on source swaps; `seeked` resumes the loop
  (a seek during playback fires no `play` event).

## Effects state machine

`DarkviewStatus.effect`: `off` → (toggle) → `monitoring` (no video bound) → `applied`
(overlay attached, or filter on in `always` mode) → `fallback` (after
`MAX_RENDER_FAILURES = 3` consecutive render failures — e.g. a tainted canvas — the overlay
detaches and the whole-frame CSS filter takes over; a settings change retries). The popup
translates these into status lines.

## Settings

Schema v2 in `chrome.storage.local` under `youtubeDarkviewOptions`:
`{ version: 2, mode: 'adaptive' | 'always', sensitivity: 'low' | 'balanced' | 'high',
intensity: 0.65–1, preanalysis: boolean }`. `preanalysis` (default true) controls whether
content-aware mode builds a storyboard timeline on activation or relies on the live gate
alone. `normalizeSettings` accepts anything (unknown → defaults), fills missing additive
fields, and migrates the legacy v1 shape (`type`/`threshold`). Settings are global; **activation is
per page** — Alt/Option+D or the popup toggle acts on one tab only and does not persist.

## Testability seams

- `DarkviewEngineOptions.overlayFactory` injects the renderer (engine tests use a fake).
- `OverlayRenderer` is the render interface: `attach(video)`, `render(video, options, gate)`,
  `detach()`.
- `blocks.ts` is entirely pure; `PixelFrame` accepts any indexable pixel buffer.
- Storage IO accepts injected `StorageReader`/`StorageWriter`.

## Invariants

1. Video pixels are read only inside the viewer's own player session, on the client.
2. No network use; `storage` is the only permission; no background service worker.
3. Failure degrades toward the dumb-but-safe whole-frame filter, never toward broken frames.
4. The npm package version (`package.json`) and the Chrome Web Store lineage
   (`source/manifest.json`) are decoupled; the store version must strictly increase.
