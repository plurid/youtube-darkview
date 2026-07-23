import { measureLightness, type PixelFrame } from './blocks';
import { buildSegments, GateTimeline, type TimelineSample } from './timeline';

export interface StoryboardLevel {
    width: number;
    height: number;
    frameCount: number;
    columns: number;
    rows: number;
    intervalSeconds: number;
    spriteUrls: string[];
}

export interface StoryboardIO {
    fetchText(url: string): Promise<string>;
    spriteFrames(url: string, level: StoryboardLevel): Promise<PixelFrame[]>;
}

// storyboard frames match the analysis budget the engine has always used;
// a finer stride than the live path is affordable on 160x90 cells
const FRAME_MEASURE_STRIDE = 2;
// partial coverage beats rejection on very long videos: uncovered time
// simply falls back to the live gate
const MAX_SPRITES = 40;
// batching bounds peak memory: each in-flight sprite holds a decoded bitmap
// plus its sliced frames until measured
const SPRITE_FETCH_BATCH = 4;
const TARGET_FRAME_WIDTH = 160;
// the spec is parsed out of fetched HTML; these bounds ensure a corrupted or
// hostile spec can neither point the fetches at another origin nor demand
// absurd decode work
const MAX_FRAME_PIXELS = 200_000;
const MAX_CELLS_PER_SPRITE = 100;
const MAX_FRAME_COUNT = 5_000;

const isAllowedSpriteBase = (baseUrl: string): boolean => {
    try {
        const url = new URL(baseUrl);
        return (
            url.protocol === 'https:' &&
            (url.hostname === 'ytimg.com' || url.hostname.endsWith('.ytimg.com'))
        );
    } catch {
        return false;
    }
};

export const videoIdFromUrl = (href: string): string | undefined => {
    try {
        const url = new URL(href);
        const watchId = url.searchParams.get('v');
        if (watchId) {
            return watchId;
        }
        return /^\/shorts\/([\w-]{6,})/.exec(url.pathname)?.[1];
    } catch {
        return undefined;
    }
};

export const extractStoryboard = (html: string): { spec: string; duration: number } | undefined => {
    const specMatch =
        /"playerStoryboardSpecRenderer"\s*:\s*\{\s*"spec"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(html);
    const durationMatch = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html);
    if (!specMatch?.[1] || !durationMatch?.[1]) {
        return undefined;
    }

    let spec: string;
    try {
        spec = JSON.parse(`"${specMatch[1]}"`) as string;
    } catch {
        return undefined;
    }

    const duration = Number(durationMatch[1]);
    if (!Number.isFinite(duration) || duration <= 0) {
        return undefined;
    }

    return { spec, duration };
};

export const parseStoryboardSpec = (
    spec: string,
    duration: number,
): StoryboardLevel | undefined => {
    const parts = spec.split('|');
    const baseUrl = parts[0];
    if (!baseUrl || parts.length < 2 || !isAllowedSpriteBase(baseUrl)) {
        return undefined;
    }

    let best:
        | {
              index: number;
              width: number;
              height: number;
              frameCount: number;
              columns: number;
              rows: number;
              intervalMs: number;
              name: string;
              sigh: string;
          }
        | undefined;

    parts.slice(1).forEach((entry, index) => {
        const fields = entry.split('#');
        if (fields.length < 8) {
            return;
        }
        const [width, height, frameCount, columns, rows, intervalMs] = fields
            .slice(0, 6)
            .map(Number);
        const name = fields[6];
        const sigh = fields[7];
        if (
            !width ||
            !height ||
            !frameCount ||
            !columns ||
            !rows ||
            width < 1 ||
            frameCount < 1 ||
            frameCount > MAX_FRAME_COUNT ||
            columns < 1 ||
            rows < 1 ||
            width * height > MAX_FRAME_PIXELS ||
            columns * rows > MAX_CELLS_PER_SPRITE ||
            intervalMs === undefined ||
            Number.isNaN(intervalMs) ||
            intervalMs < 0 ||
            !name ||
            !sigh
        ) {
            return;
        }
        const distance = Math.abs(width - TARGET_FRAME_WIDTH);
        const bestDistance = best ? Math.abs(best.width - TARGET_FRAME_WIDTH) : Infinity;
        if (!best || distance < bestDistance || (distance === bestDistance && width > best.width)) {
            best = { index, width, height, frameCount, columns, rows, intervalMs, name, sigh };
        }
    });

    if (!best) {
        return undefined;
    }

    const level = best;
    const intervalSeconds =
        level.intervalMs > 0 ? level.intervalMs / 1000 : duration / level.frameCount;
    const spriteCount = Math.min(
        Math.ceil(level.frameCount / (level.columns * level.rows)),
        MAX_SPRITES,
    );
    const spriteUrls: string[] = [];
    for (let sprite = 0; sprite < spriteCount; sprite += 1) {
        spriteUrls.push(
            baseUrl
                .replace('$L', String(level.index))
                .replace('$N', level.name)
                .replace('$M', String(sprite)) + `&sigh=${encodeURIComponent(level.sigh)}`,
        );
    }

    return {
        width: level.width,
        height: level.height,
        frameCount: level.frameCount,
        columns: level.columns,
        rows: level.rows,
        intervalSeconds,
        spriteUrls,
    };
};

const browserIO: StoryboardIO = {
    fetchText: async (url) => {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }
        return response.text();
    },
    spriteFrames: async (url, level) => {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`Sprite request failed with status ${response.status}`);
        }
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            bitmap.close();
            throw new Error('The browser did not provide a 2D canvas context');
        }
        context.drawImage(bitmap, 0, 0);
        bitmap.close();

        const frames: PixelFrame[] = [];
        for (let row = 0; row < level.rows; row += 1) {
            for (let column = 0; column < level.columns; column += 1) {
                frames.push(
                    context.getImageData(
                        column * level.width,
                        row * level.height,
                        level.width,
                        level.height,
                    ),
                );
            }
        }
        return frames;
    },
};

export interface StoryboardAnalysis {
    samples: TimelineSample[];
    frameDuration: number;
    duration: number;
}

export const fetchStoryboardAnalysis = async (
    videoId: string,
    io: StoryboardIO = browserIO,
): Promise<StoryboardAnalysis | undefined> => {
    try {
        const html = await io.fetchText(
            `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        );
        const extracted = extractStoryboard(html);
        if (!extracted) {
            return undefined;
        }
        const level = parseStoryboardSpec(extracted.spec, extracted.duration);
        if (!level) {
            return undefined;
        }

        const samples: TimelineSample[] = [];
        let frameIndex = 0;
        // fetch in small batches and measure immediately so frames are
        // released as they are consumed instead of all held at once
        for (let start = 0; start < level.spriteUrls.length; start += SPRITE_FETCH_BATCH) {
            const batch = level.spriteUrls.slice(start, start + SPRITE_FETCH_BATCH);
            const sprites = await Promise.all(batch.map((url) => io.spriteFrames(url, level)));
            for (const frames of sprites) {
                for (const frame of frames) {
                    if (frameIndex >= level.frameCount) {
                        break;
                    }
                    samples.push({
                        time: frameIndex * level.intervalSeconds,
                        ratio: measureLightness(frame, FRAME_MEASURE_STRIDE),
                    });
                    frameIndex += 1;
                }
            }
        }

        if (samples.length === 0) {
            return undefined;
        }
        return { samples, frameDuration: level.intervalSeconds, duration: extracted.duration };
    } catch {
        return undefined;
    }
};

export const fetchGateTimeline = async (
    videoId: string,
    io: StoryboardIO = browserIO,
): Promise<GateTimeline | undefined> => {
    const analysis = await fetchStoryboardAnalysis(videoId, io);
    if (!analysis) {
        return undefined;
    }
    return new GateTimeline(
        buildSegments(analysis.samples, analysis.frameDuration, analysis.duration),
    );
};
