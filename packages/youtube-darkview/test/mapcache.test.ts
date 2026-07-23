import { describe, expect, it, jest } from '@jest/globals';

import { cachedTimelineFactory } from '~contentscript/mapcache';
import type { StoryboardAnalysis } from '~contentscript/storyboard';

const CACHE_KEY = 'youtubeDarkviewMapCache';

const analysisOf = (ratio: number): StoryboardAnalysis => ({
    samples: [
        { time: 0, ratio },
        { time: 10, ratio },
    ],
    frameDuration: 10,
    duration: 20,
});

const fakeStorage = (initial: Record<string, unknown> = {}) => {
    let stored: Record<string, unknown> = initial;
    return {
        get: jest.fn(async () => stored),
        set: jest.fn(async (items: Record<string, unknown>) => {
            stored = { ...stored, ...items };
        }),
        snapshot: () => stored,
    };
};

describe('cached timeline factory', () => {
    it('fetches on a miss, serves the timeline, and stores the raw analysis', async () => {
        const storage = fakeStorage();
        const fetchAnalysis = jest.fn(async (_videoId: string) => analysisOf(0.6));

        const timeline = await cachedTimelineFactory('abc', {
            storage,
            fetchAnalysis,
            now: () => 1_000,
        });

        expect(timeline?.litAt(5, 0.35)).toBe(true);
        expect(fetchAnalysis).toHaveBeenCalledWith('abc');
        await new Promise((resolve) => setTimeout(resolve, 0));
        const cache = storage.snapshot()[CACHE_KEY] as {
            entries: Record<string, { storedAt: number; ratios: unknown[] }>;
        };
        expect(cache.entries.abc?.storedAt).toBe(1_000);
        expect(cache.entries.abc?.ratios).toEqual([0.6, 0.6]);
    });

    it('serves a cache hit without fetching', async () => {
        const storage = fakeStorage();
        const fetchAnalysis = jest.fn(async (_videoId: string) => analysisOf(0.6));
        await cachedTimelineFactory('abc', { storage, fetchAnalysis, now: () => 1_000 });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const again = await cachedTimelineFactory('abc', {
            storage,
            fetchAnalysis,
            now: () => 2_000,
        });

        expect(fetchAnalysis).toHaveBeenCalledTimes(1);
        expect(again?.litAt(5, 0.35)).toBe(true);
    });

    it('refetches expired and corrupt entries', async () => {
        const storage = fakeStorage({
            [CACHE_KEY]: {
                version: 1,
                entries: {
                    old: { duration: 20, frameDuration: 10, ratios: [0.6, 0.6], storedAt: 0 },
                    broken: { duration: 20, frameDuration: 10, ratios: 'nope', storedAt: 5 },
                },
            },
        });
        const fetchAnalysis = jest.fn(async (_videoId: string) => analysisOf(0.2));

        const expired = await cachedTimelineFactory('old', {
            storage,
            fetchAnalysis,
            now: () => 9 * 60 * 60 * 1000,
        });
        expect(fetchAnalysis).toHaveBeenCalledTimes(1);
        expect(expired?.litAt(5, 0.35)).toBe(false);

        await cachedTimelineFactory('broken', { storage, fetchAnalysis, now: () => 10 });
        expect(fetchAnalysis).toHaveBeenCalledTimes(2);
    });

    it('evicts the oldest entries beyond the cap', async () => {
        const storage = fakeStorage();
        const fetchAnalysis = jest.fn(async (_videoId: string) => analysisOf(0.5));

        for (let index = 0; index < 42; index += 1) {
            await cachedTimelineFactory(`video-${index}`, {
                storage,
                fetchAnalysis,
                now: () => index,
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const cache = storage.snapshot()[CACHE_KEY] as { entries: Record<string, unknown> };
        const keys = Object.keys(cache.entries);
        expect(keys).toHaveLength(40);
        expect(keys).not.toContain('video-0');
        expect(keys).not.toContain('video-1');
        expect(keys).toContain('video-41');
    });

    it('survives storage failures by fetching fresh', async () => {
        const storage = {
            get: jest.fn(async () => {
                throw new Error('storage gone');
            }),
            set: jest.fn(async () => {
                throw new Error('storage gone');
            }),
        };
        const fetchAnalysis = jest.fn(async (_videoId: string) => analysisOf(0.6));

        const timeline = await cachedTimelineFactory('abc', { storage, fetchAnalysis });

        expect(timeline?.litAt(5, 0.35)).toBe(true);
    });

    it('returns nothing when the analysis is unavailable', async () => {
        const storage = fakeStorage();
        const fetchAnalysis = jest.fn(async (_videoId: string) => undefined);

        expect(await cachedTimelineFactory('abc', { storage, fetchAnalysis })).toBeUndefined();
        expect(storage.set).not.toHaveBeenCalled();
    });
});
