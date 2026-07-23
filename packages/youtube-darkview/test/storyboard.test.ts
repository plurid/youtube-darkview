import { describe, expect, it, jest } from '@jest/globals';

import type { PixelFrame } from '~contentscript/blocks';
import {
    extractStoryboard,
    fetchGateTimeline,
    parseStoryboardSpec,
    type StoryboardIO,
    videoIdFromUrl,
} from '~contentscript/storyboard';

// the level table observed live on 2026-07-22 (see docs/STORYBOARDS.md)
const SPEC =
    'https://i.ytimg.com/sb/K8BmMU1Tm-I/storyboard3_L$L/$N.jpg?sqp=TOKEN' +
    '|48#27#100#10#10#0#default#rs$SIG0' +
    '|80#45#299#10#10#10000#M$M#rs$SIG1' +
    '|160#90#299#5#5#10000#M$M#rs$SIG2' +
    '|320#180#299#3#3#10000#M$M#rs$SIG3';

const solidFrame = (value: number, size = 4): PixelFrame => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let index = 0; index < data.length; index += 4) {
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
    }
    return { data, width: size, height: size };
};

describe('video id extraction', () => {
    it('reads watch and shorts URLs and rejects the rest', () => {
        expect(videoIdFromUrl('https://www.youtube.com/watch?v=K8BmMU1Tm-I&t=13')).toBe(
            'K8BmMU1Tm-I',
        );
        expect(videoIdFromUrl('https://www.youtube.com/shorts/abcDEF123-_')).toBe('abcDEF123-_');
        expect(videoIdFromUrl('https://www.youtube.com/feed/subscriptions')).toBeUndefined();
        expect(videoIdFromUrl('not a url')).toBeUndefined();
    });
});

describe('storyboard extraction', () => {
    it('pulls the spec and duration out of watch-page HTML and unescapes JSON', () => {
        const html =
            '...","playerStoryboardSpecRenderer":{"spec":"https://i.ytimg.com/sb/abc/storyboard3_L$L/$N.jpg?sqp=AB\\u0026x=1|80#45#20#10#10#10000#M$M#rs$S"}},"lengthSeconds":"200","other":"..."';

        const extracted = extractStoryboard(html);

        expect(extracted?.duration).toBe(200);
        expect(extracted?.spec).toContain('?sqp=AB&x=1|80#45');
    });

    it('rejects pages without a spec or a usable duration', () => {
        expect(extractStoryboard('<html>no player data</html>')).toBeUndefined();
        expect(
            extractStoryboard('"playerStoryboardSpecRenderer":{"spec":"x|1#1#1#1#1#0#n#s"}'),
        ).toBeUndefined();
    });
});

describe('storyboard spec parsing', () => {
    it('chooses the level nearest 160 px and builds sprite URLs', () => {
        const level = parseStoryboardSpec(SPEC, 2972);

        expect(level).toMatchObject({
            width: 160,
            height: 90,
            frameCount: 299,
            columns: 5,
            rows: 5,
            intervalSeconds: 10,
        });
        expect(level?.spriteUrls).toHaveLength(12);
        expect(level?.spriteUrls[0]).toBe(
            'https://i.ytimg.com/sb/K8BmMU1Tm-I/storyboard3_L2/M0.jpg?sqp=TOKEN&sigh=rs%24SIG2',
        );
        expect(level?.spriteUrls[11]).toContain('/M11.jpg');
    });

    it('spreads interval-zero levels evenly across the duration', () => {
        const level = parseStoryboardSpec(
            'https://i.ytimg.com/sb/abc/storyboard3_L$L/$N.jpg?sqp=T|48#27#100#10#10#0#default#rs$S',
            500,
        );

        expect(level?.intervalSeconds).toBe(5);
        expect(level?.spriteUrls).toEqual([
            'https://i.ytimg.com/sb/abc/storyboard3_L0/default.jpg?sqp=T&sigh=rs%24S',
        ]);
    });

    it('rejects malformed specs', () => {
        expect(parseStoryboardSpec('just-a-url-no-levels', 100)).toBeUndefined();
        expect(parseStoryboardSpec('base|bad#level', 100)).toBeUndefined();
        expect(parseStoryboardSpec('base|0#0#0#0#0#0##', 100)).toBeUndefined();
    });
});

describe('gate timeline fetching', () => {
    const html = (spec: string, duration: number): string =>
        `"playerStoryboardSpecRenderer":{"spec":"${spec}"},"lengthSeconds":"${duration}"`;
    const smallSpec = 'https://i.ytimg.com/sb/abc/sb_L$L/$N.jpg?sqp=T|4#4#4#2#2#10000#M$M#rs$S';

    it('measures every storyboard frame into a queryable timeline', async () => {
        const io: StoryboardIO = {
            fetchText: jest.fn(async () => html(smallSpec, 40)),
            spriteFrames: jest.fn(async () => [
                solidFrame(255),
                solidFrame(250),
                solidFrame(10),
                solidFrame(12),
            ]),
        };

        const timeline = await fetchGateTimeline('abc', io);

        expect(io.fetchText).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc');
        expect(timeline?.litAt(5, 0.35)).toBe(true);
        expect(timeline?.litAt(15, 0.35)).toBe(true);
        expect(timeline?.litAt(25, 0.35)).toBe(false);
        expect(timeline?.litAt(45, 0.35)).toBeUndefined();
    });

    it('returns nothing when the page, the spec, or the sprites fail', async () => {
        const failingFetch: StoryboardIO = {
            fetchText: jest.fn(async () => {
                throw new Error('offline');
            }),
            spriteFrames: jest.fn(async () => []),
        };
        expect(await fetchGateTimeline('abc', failingFetch)).toBeUndefined();

        const noSpec: StoryboardIO = {
            fetchText: jest.fn(async () => '<html>live stream</html>'),
            spriteFrames: jest.fn(async () => []),
        };
        expect(await fetchGateTimeline('abc', noSpec)).toBeUndefined();

        const failingSprites: StoryboardIO = {
            fetchText: jest.fn(async () => html(smallSpec, 40)),
            spriteFrames: jest.fn(async () => {
                throw new Error('blocked');
            }),
        };
        expect(await fetchGateTimeline('abc', failingSprites)).toBeUndefined();
    });
});
