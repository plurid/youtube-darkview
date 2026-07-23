# Photo protection

Status: **implemented** in `source/contentscript/blocks.ts` (2026-07-23). The measured
bounds and their evidence are below; the mechanism is as designed, with one correction
found during live validation: seeding counts only **neutral** mid-tones (chroma ≤ 41),
because colored content is already chroma-protected pixel by pixel and colored text would
otherwise wrongly shield its own background from inversion.

## The remaining artifact class

Inside lit frames, the block engine protects colored content perfectly (chroma keying) and
dark imagery well (block qualification). What it cannot yet protect is **bright achromatic
photo content**:

- A photograph whose own background is white or light gray (the "tadpole on white" case
  observed in testing): its background pixels are bright-neutral, so its blocks qualify
  and invert — the photo gets darkened along with the slide.
- Grayscale photographs (the Einstein case): interior pixels with chroma ≤ 24 pass the
  neutral-ink rule inside qualified blocks and flip.

Both are photos being treated as background+ink because pixel color alone cannot tell
"flat slide white" from "photographed white."

## The discriminator: texture

What color cannot separate, local structure can:

- **Slide background** is synthetically flat: near-zero luminance variance inside a 20 px
  block (encoder noise aside).
- **Photo content** — even its calm regions — carries sensor noise, gradients, and JPEG
  texture: small but consistently nonzero local variance.
- **Text on background** is neither: high variance but strongly *bimodal* (pixels cluster
  at the background level and the ink level, little in between). This is what keeps text
  blocks invertible while photo blocks are not.

## Proposed mechanism

1. **Per-block texture statistics**, accumulated inside the existing pixel pass of
   `invertLightBlocks` (`blocks.ts`) — sum and sum-of-squares of luminance, plus a
   mid-tone count — so the added hot-path cost is a few arithmetic ops per pixel already
   being read.
2. **Photo-block criterion**: bright-dominant blocks whose luminance variance exceeds a
   flatness bound *and* whose histogram is not bimodal (mid-tone share above a bound) are
   marked `photo` — excluded from qualification, from neutral-ink flipping, and from the
   border pass's background flipping.
3. **Region coherence pass** (cheap, block-grid level): photos are rectangles. A majority
   vote over each block's neighbors removes speckle — a lone "textured" block amid flat
   background (a logo, a chart glyph) reverts to invertible; a lone "flat" block inside a
   photo (sky, studio backdrop) inherits protection from its neighbors.
4. **Stable-segment reuse** (later optimization, pre-analysis only): on stable timeline
   segments the content is static, so the photo mask can be computed once and reused per
   frame. Not part of the first implementation; the inline statistics are cheap enough.

## Risks and their mitigations

- **Text misread as photo** → a glaring uninverted text block. Mitigated by the
  bimodality test; validated against dense-text slides before shipping.
- **Noisy encodes making slide background "textured"** → protection everywhere, nothing
  inverts. The flatness bound must come from measured data across real lectures (same
  method as the gate thresholds: measure, find the gap, sit in it).
- **Photo edges**: blocks straddling photo and background remain the hard case; the
  region pass plus the existing border rules decide them. Acceptance bar: no regression
  on the current test slides (title readability, seamless background up to photo edges).

## Measured bounds (Levin lecture, 2026-07-23)

| Region | Block variance (p50) | Neutral mid-tone share |
|---|---|---|
| Slide background | 0 (p90 = 0) | 0.00 |
| Title / body text | 6,531 – 11,753 | ≤ 0.22 (p90) |
| Photo content | 267 – 4,700 | ~0.70 (p50) |

Constants: `PHOTO_MIN_MIDTONE_SHARE = 0.35`, `PHOTO_MIN_VARIANCE = 50`,
`PHOTO_MIN_COMPONENT_BLOCKS = 4`. Live check on the Morphogenesis slide: five protected
regions, all on actual photographs; on the colored Anthrobots slide: zero regions
(chroma protection already covers it), so that approved render is unchanged.

## Validation plan

Same discipline as the gate work: measure real frames first (the Levin tadpole slide, the
Dehaene Einstein slide, dense text-only slides, noisy screen recordings), derive the two
bounds from the measured gap, encode them as named constants with the evidence in a
comment, then unit-test the classifier on synthetic blocks and verify live on the same
videos. Ship only if the current 89-test suite and the live comparison screenshots hold.
