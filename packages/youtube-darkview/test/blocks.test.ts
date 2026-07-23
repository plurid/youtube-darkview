import { describe, expect, it } from '@jest/globals';

import {
    FrameGate,
    invertLightBlocks,
    measureLightness,
    type PixelFrame,
    SENSITIVITY_PROFILES,
} from '~contentscript/blocks';

const frameOf = (
    width: number,
    height: number,
    fill: (x: number, y: number) => readonly [number, number, number],
): PixelFrame => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const [red, green, blue] = fill(x, y);
            const index = (y * width + x) * 4;
            data[index] = red;
            data[index + 1] = green;
            data[index + 2] = blue;
            data[index + 3] = 255;
        }
    }
    return { data, width, height };
};

const at = (frame: PixelFrame, x: number, y: number): readonly [number, number, number] => {
    const index = (y * frame.width + x) * 4;
    return [frame.data[index] ?? -1, frame.data[index + 1] ?? -1, frame.data[index + 2] ?? -1];
};

const options = { blockFraction: 0.5, blockSize: 4, intensity: 1 };

describe('block inversion', () => {
    it('turns a white block with dark text into a dark block with light text', () => {
        const frame = frameOf(4, 4, (x, y) =>
            x === 1 && y === 1 ? [55, 55, 55] : [255, 255, 255],
        );

        expect(invertLightBlocks(frame, options)).toBe(1);
        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 1, 1)).toEqual([200, 200, 200]);
    });

    it('keeps colored pixels even inside an inverted block', () => {
        const frame = frameOf(4, 4, (x, y) =>
            x === 2 && y === 2 ? [40, 120, 220] : [250, 250, 250],
        );

        expect(invertLightBlocks(frame, options)).toBe(1);
        expect(at(frame, 0, 0)).toEqual([5, 5, 5]);
        expect(at(frame, 2, 2)).toEqual([40, 120, 220]);
    });

    it('leaves white text on a dark background untouched', () => {
        const frame = frameOf(4, 4, (x) => (x === 0 ? [255, 255, 255] : [18, 18, 18]));

        expect(invertLightBlocks(frame, options)).toBe(0);
        expect(at(frame, 0, 0)).toEqual([255, 255, 255]);
        expect(at(frame, 3, 3)).toEqual([18, 18, 18]);
    });

    it('leaves photo-like blocks untouched', () => {
        const frame = frameOf(4, 4, () => [190, 140, 110]);

        expect(invertLightBlocks(frame, options)).toBe(0);
        expect(at(frame, 1, 1)).toEqual([190, 140, 110]);
    });

    it('keeps tinted photo shadows even when a block straddles the photo edge', () => {
        // left half white background, right half a photo's dark sepia rim:
        // the block qualifies at 50% yet the rim must keep its color
        const frame = frameOf(4, 4, (x) => (x < 2 ? [255, 255, 255] : [96, 61, 38]));

        expect(invertLightBlocks(frame, options)).toBe(1);
        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 3, 0)).toEqual([96, 61, 38]);
    });

    it('darkens background pixels in blocks bordering an inverted region', () => {
        const frame = frameOf(8, 4, (x) => (x < 4 || x === 7 ? [255, 255, 255] : [190, 140, 110]));

        expect(invertLightBlocks(frame, options)).toBe(1);
        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 7, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 5, 0)).toEqual([190, 140, 110]);
    });

    it('keeps bold glyph bodies readable in blocks bordering an inverted region', () => {
        // right block is glyph-dominant: near-black ink must flip to light,
        // while mid-gray photo tones in the same block keep their value
        const frame = frameOf(8, 4, (x, y) => {
            if (x < 4) {
                return [255, 255, 255];
            }
            if (y === 3) {
                return [150, 150, 150];
            }
            return x === 7 ? [255, 255, 255] : [20, 20, 20];
        });

        expect(invertLightBlocks(frame, options)).toBe(1);
        expect(at(frame, 7, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 5, 0)).toEqual([235, 235, 235]);
        expect(at(frame, 5, 3)).toEqual([150, 150, 150]);
    });

    it('leaves light pockets alone when no inverted region is nearby', () => {
        const frame = frameOf(12, 4, (x) =>
            x < 4 || x === 11 ? [255, 255, 255] : [190, 140, 110],
        );

        invertLightBlocks(frame, options);
        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 11, 0)).toEqual([255, 255, 255]);
        expect(at(frame, 6, 0)).toEqual([190, 140, 110]);
    });

    it('protects whole photo regions including their white backdrop and dark tones', () => {
        // left half: slide background; right half: a 2x2-block grayscale photo
        // (noisy midtones) containing one white backdrop pixel and one near-black
        // pixel - both would flip under the border rules without protection
        const frame = frameOf(16, 8, (x, y) => {
            if (x < 8) {
                return [255, 255, 255];
            }
            if (x === 8 && y === 0) {
                return [255, 255, 255];
            }
            if (x === 9 && y === 0) {
                return [30, 30, 30];
            }
            return (x + y) % 2 === 0 ? [100, 100, 100] : [160, 160, 160];
        });

        invertLightBlocks(frame, options);

        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 8, 0)).toEqual([255, 255, 255]);
        expect(at(frame, 9, 0)).toEqual([30, 30, 30]);
        expect(at(frame, 10, 1)).toEqual([160, 160, 160]);
    });

    it('never lets colored content seed protection', () => {
        // colored text is chroma-protected pixel by pixel; its background
        // must keep inverting rather than being shielded as a photo
        const frame = frameOf(16, 8, (x, y) => {
            if (x < 8) {
                return [255, 255, 255];
            }
            return (x + y) % 2 === 0 ? [230, 130, 110] : [255, 255, 255];
        });

        invertLightBlocks(frame, options);

        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 9, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 8, 0)).toEqual([230, 130, 110]);
    });

    it('keeps isolated textured blocks invertible', () => {
        // a lone noisy block (a logo, a chart glyph) is no photograph: its
        // white pixels still flip through the border rule
        const frame = frameOf(12, 4, (x, y) => {
            if (x < 4 || x >= 8) {
                return [255, 255, 255];
            }
            if (x === 4 && y === 0) {
                return [255, 255, 255];
            }
            return (x + y) % 2 === 0 ? [100, 100, 100] : [160, 160, 160];
        });

        invertLightBlocks(frame, options);

        expect(at(frame, 0, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 4, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 5, 0)).toEqual([160, 160, 160]);
    });

    it('measures clipped edge blocks by their real pixel count', () => {
        const frame = frameOf(6, 4, () => [255, 255, 255]);

        expect(invertLightBlocks(frame, options)).toBe(2);
        expect(at(frame, 5, 3)).toEqual([0, 0, 0]);
    });

    it('dims the inverted result by the configured intensity', () => {
        const frame = frameOf(4, 4, (x) => (x === 0 ? [55, 55, 55] : [255, 255, 255]));

        invertLightBlocks(frame, { ...options, intensity: 0.65 });

        expect(at(frame, 1, 0)).toEqual([0, 0, 0]);
        expect(at(frame, 0, 0)).toEqual([130, 130, 130]);
    });

    it('requires a stricter background share at lower sensitivity', () => {
        const half = (x: number): readonly [number, number, number] =>
            x < 2 ? [255, 255, 255] : [18, 18, 18];

        const strict = frameOf(4, 4, half);
        expect(
            invertLightBlocks(strict, {
                ...options,
                blockFraction: SENSITIVITY_PROFILES.low.blockFraction,
            }),
        ).toBe(0);

        const permissive = frameOf(4, 4, half);
        expect(
            invertLightBlocks(permissive, {
                ...options,
                blockFraction: SENSITIVITY_PROFILES.high.blockFraction,
            }),
        ).toBe(1);
    });

    it('rejects malformed frames and block sizes', () => {
        expect(() =>
            invertLightBlocks({ data: new Uint8ClampedArray(4), width: 4, height: 4 }, options),
        ).toThrow('Invalid pixel frame');
        expect(() =>
            invertLightBlocks(
                frameOf(2, 2, () => [255, 255, 255]),
                { ...options, blockSize: 0 },
            ),
        ).toThrow('Invalid block size');
    });
});

describe('lightness measurement', () => {
    it('reports the share of light background pixels', () => {
        const frame = frameOf(4, 2, (x) => (x < 2 ? [250, 250, 250] : [20, 20, 20]));

        expect(measureLightness(frame, 1)).toBe(0.5);
    });

    it('does not count bright but colorful pixels as background', () => {
        const frame = frameOf(2, 2, () => [230, 210, 160]);

        expect(measureLightness(frame, 1)).toBe(0);
    });

    it('samples on a stride for large frames', () => {
        const frame = frameOf(8, 8, (x, y) =>
            x === 0 && y === 0 ? [255, 255, 255] : [10, 10, 10],
        );

        expect(measureLightness(frame)).toBe(0.25);
    });

    it('rejects malformed frames', () => {
        expect(() => measureLightness({ data: [], width: 1, height: 1 })).toThrow(
            'Invalid pixel frame',
        );
    });
});

describe('frame gate', () => {
    it('needs consecutive light frames to switch on and dark frames to switch off', () => {
        const gate = new FrameGate();

        expect(gate.update(true)).toBe(false);
        expect(gate.update(true)).toBe(true);
        expect(gate.update(false)).toBe(true);
        expect(gate.update(false)).toBe(true);
        expect(gate.update(false)).toBe(false);
    });

    it('reacts immediately on stable paused frames', () => {
        const gate = new FrameGate();

        expect(gate.update(true, true)).toBe(true);
        expect(gate.update(false, true)).toBe(false);
    });

    it('resets to unlit', () => {
        const gate = new FrameGate();
        gate.update(true, true);
        expect(gate.value).toBe(true);

        gate.reset();
        expect(gate.value).toBe(false);
    });
});

describe('sensitivity profiles', () => {
    it('orders thresholds from strict to permissive', () => {
        expect(SENSITIVITY_PROFILES.low.gateRatio).toBeGreaterThan(
            SENSITIVITY_PROFILES.balanced.gateRatio,
        );
        expect(SENSITIVITY_PROFILES.balanced.gateRatio).toBeGreaterThan(
            SENSITIVITY_PROFILES.high.gateRatio,
        );
        expect(SENSITIVITY_PROFILES.low.blockFraction).toBeGreaterThan(
            SENSITIVITY_PROFILES.balanced.blockFraction,
        );
        expect(SENSITIVITY_PROFILES.balanced.blockFraction).toBeGreaterThan(
            SENSITIVITY_PROFILES.high.blockFraction,
        );
    });
});
