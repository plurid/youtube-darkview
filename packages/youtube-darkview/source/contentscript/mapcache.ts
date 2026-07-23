import { fetchStoryboardAnalysis, type StoryboardAnalysis } from './storyboard';
import { buildSegments, GateTimeline, type TimelineSample } from './timeline';

const CACHE_KEY = 'youtubeDarkviewMapCache';
const CACHE_VERSION = 1;
// raw measurements are stored instead of built segments so threshold and
// stability tuning applies retroactively to every cached analysis; sample
// times are implicit (index * frameDuration) and ratios are rounded to three
// decimals, keeping a typical video near 2 KB of the 10 MB storage quota
const MAX_ENTRIES = 40;
const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const RATIO_PRECISION = 1000;

interface CacheEntry {
    duration: number;
    frameDuration: number;
    ratios: number[];
    storedAt: number;
}

interface MapCache {
    version: number;
    entries: Record<string, CacheEntry>;
}

type CacheStorage = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

export interface TimelineFactoryOptions {
    storage?: CacheStorage;
    fetchAnalysis?: (videoId: string) => Promise<StoryboardAnalysis | undefined>;
    now?: () => number;
}

const isEntry = (value: unknown): value is CacheEntry => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const entry = value as CacheEntry;
    return (
        Number.isFinite(entry.duration) &&
        entry.duration > 0 &&
        Number.isFinite(entry.frameDuration) &&
        entry.frameDuration > 0 &&
        Number.isFinite(entry.storedAt) &&
        Array.isArray(entry.ratios) &&
        entry.ratios.length > 0 &&
        entry.ratios.every((ratio) => Number.isFinite(ratio))
    );
};

const entrySamples = (entry: CacheEntry): TimelineSample[] =>
    entry.ratios.map((ratio, index) => ({ time: index * entry.frameDuration, ratio }));

const readCache = async (storage: CacheStorage): Promise<MapCache> => {
    const result = await storage.get(CACHE_KEY);
    const cache = result[CACHE_KEY] as MapCache | undefined;
    if (
        typeof cache !== 'object' ||
        cache === null ||
        cache.version !== CACHE_VERSION ||
        typeof cache.entries !== 'object' ||
        cache.entries === null
    ) {
        return { version: CACHE_VERSION, entries: {} };
    }
    return cache;
};

const storeAnalysis = async (
    videoId: string,
    analysis: StoryboardAnalysis,
    storage: CacheStorage,
    now: number,
): Promise<void> => {
    const cache = await readCache(storage);
    cache.entries[videoId] = {
        duration: analysis.duration,
        frameDuration: analysis.frameDuration,
        ratios: analysis.samples.map(
            (sample) => Math.round(sample.ratio * RATIO_PRECISION) / RATIO_PRECISION,
        ),
        storedAt: now,
    };

    const entries = Object.entries(cache.entries);
    if (entries.length > MAX_ENTRIES) {
        entries.sort((left, right) => left[1].storedAt - right[1].storedAt);
        for (const [evicted] of entries.slice(0, entries.length - MAX_ENTRIES)) {
            delete cache.entries[evicted];
        }
    }

    await storage.set({ [CACHE_KEY]: cache });
};

export const cachedTimelineFactory = async (
    videoId: string,
    options: TimelineFactoryOptions = {},
): Promise<GateTimeline | undefined> => {
    const storage = options.storage ?? chrome.storage.local;
    const fetchAnalysis = options.fetchAnalysis ?? fetchStoryboardAnalysis;
    const now = options.now ?? Date.now;

    let cached: CacheEntry | undefined;
    try {
        const entry = (await readCache(storage)).entries[videoId];
        if (isEntry(entry) && now() - entry.storedAt <= MAX_AGE_MS) {
            cached = entry;
        }
    } catch {
        cached = undefined;
    }

    if (cached) {
        return new GateTimeline(
            buildSegments(entrySamples(cached), cached.frameDuration, cached.duration),
        );
    }

    const analysis = await fetchAnalysis(videoId);
    if (!analysis) {
        return undefined;
    }

    // caching is best effort; a failed write never costs the fresh analysis
    void storeAnalysis(videoId, analysis, storage, now()).catch(() => undefined);

    return new GateTimeline(
        buildSegments(analysis.samples, analysis.frameDuration, analysis.duration),
    );
};
