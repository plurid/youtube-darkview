import { describe, expect, it } from '@jest/globals';

import { buildSegments, GateTimeline } from '~contentscript/timeline';

describe('segment building', () => {
    it('merges neighboring samples that every sensitivity decides identically', () => {
        const segments = buildSegments(
            [
                { time: 0, ratio: 0.6 },
                { time: 10, ratio: 0.62 },
                { time: 20, ratio: 0.1 },
                { time: 30, ratio: 0.05 },
            ],
            10,
            40,
        );

        expect(segments).toHaveLength(2);
        expect(segments[0]).toMatchObject({ start: 0, end: 20 });
        expect(segments[0]?.ratio).toBeCloseTo(0.61);
        expect(segments[1]).toMatchObject({ start: 20, end: 40 });
    });

    it('keeps samples apart when any profile would decide them differently', () => {
        const segments = buildSegments(
            [
                { time: 0, ratio: 0.4 },
                { time: 10, ratio: 0.3 },
            ],
            10,
            20,
        );

        expect(segments).toHaveLength(2);
    });

    it('sorts samples, clamps to the duration, and drops invalid ones', () => {
        const segments = buildSegments(
            [
                { time: 35, ratio: 0.9 },
                { time: 0, ratio: 0.85 },
                { time: 45, ratio: 0.8 },
                { time: 10, ratio: Number.NaN },
            ],
            10,
            40,
        );

        expect(segments).toEqual([
            { start: 0, end: 10, ratio: 0.85, stable: false },
            { start: 35, end: 40, ratio: 0.9, stable: false },
        ]);
    });

    it('marks long runs of near-constant ratios as stable', () => {
        const segments = buildSegments(
            [
                { time: 0, ratio: 0.25 },
                { time: 10, ratio: 0.24 },
                { time: 20, ratio: 0.26 },
                { time: 30, ratio: 0.23 },
                { time: 40, ratio: 0.25 },
            ],
            10,
            50,
        );

        expect(segments).toHaveLength(1);
        expect(segments[0]?.stable).toBe(true);
    });

    it('drops invalid samples without breaking a stable run', () => {
        const segments = buildSegments(
            [
                { time: 0, ratio: 0.25 },
                { time: 10, ratio: 0.24 },
                { time: 20, ratio: Number.NaN },
                { time: 30, ratio: 0.26 },
                { time: 40, ratio: 0.25 },
            ],
            10,
            50,
        );

        expect(segments.some((segment) => segment.stable)).toBe(true);
    });

    it('returns nothing for degenerate durations', () => {
        expect(buildSegments([{ time: 0, ratio: 0.5 }], 0, 10)).toEqual([]);
        expect(buildSegments([{ time: 0, ratio: 0.5 }], 10, 0)).toEqual([]);
    });

    it('never marks short or jumpy runs as stable', () => {
        const shortRun = buildSegments(
            [
                { time: 0, ratio: 0.25 },
                { time: 10, ratio: 0.24 },
            ],
            10,
            20,
        );
        expect(shortRun.every((segment) => !segment.stable)).toBe(true);

        const jumpy = buildSegments(
            [
                { time: 0, ratio: 0.25 },
                { time: 10, ratio: 0.15 },
                { time: 20, ratio: 0.28 },
                { time: 30, ratio: 0.18 },
            ],
            10,
            40,
        );
        expect(jumpy.every((segment) => !segment.stable)).toBe(true);
    });
});

describe('gate timeline', () => {
    const timeline = new GateTimeline([
        { start: 0, end: 10, ratio: 0.6, stable: false },
        { start: 10, end: 20, ratio: 0.1, stable: false },
        { start: 30, end: 40, ratio: 0.5, stable: false },
    ]);

    it('answers inside covered segments against the given threshold', () => {
        expect(timeline.litAt(5, 0.35)).toBe(true);
        expect(timeline.litAt(15, 0.35)).toBe(false);
        expect(timeline.litAt(35, 0.35)).toBe(true);
        expect(timeline.litAt(35, 0.55)).toBe(false);
    });

    it('treats segment starts as inclusive and ends as exclusive', () => {
        expect(timeline.litAt(10, 0.35)).toBe(false);
        expect(timeline.litAt(20, 0.35)).toBeUndefined();
    });

    it('reports no answer outside coverage', () => {
        expect(timeline.litAt(-1, 0.35)).toBeUndefined();
        expect(timeline.litAt(25, 0.35)).toBeUndefined();
        expect(timeline.litAt(40, 0.35)).toBeUndefined();
        expect(new GateTimeline([]).litAt(0, 0.35)).toBeUndefined();
    });

    it('lights stable dark-dominant slides at a reduced floor', () => {
        const stable = new GateTimeline([{ start: 0, end: 100, ratio: 0.25, stable: true }]);
        expect(stable.litAt(50, 0.35)).toBe(true);

        const unstable = new GateTimeline([{ start: 0, end: 100, ratio: 0.25, stable: false }]);
        expect(unstable.litAt(50, 0.35)).toBe(false);

        const footage = new GateTimeline([{ start: 0, end: 100, ratio: 0.05, stable: true }]);
        expect(footage.litAt(50, 0.35)).toBe(false);
    });
});
