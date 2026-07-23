import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { FrameGate } from '~contentscript/blocks';
import { CanvasBlockOverlay, DarkviewEngine, type OverlayRenderer } from '~contentscript/engine';
import { DEFAULT_SETTINGS } from '~data/settings';

const addVideo = ({
    height = 720,
    paused = false,
    readyState = HTMLMediaElement.HAVE_CURRENT_DATA,
    width = 1280,
}: {
    height?: number;
    paused?: boolean;
    readyState?: number;
    width?: number;
} = {}): HTMLVideoElement => {
    const video = document.createElement('video');
    Object.defineProperties(video, {
        paused: { configurable: true, value: paused },
        readyState: { configurable: true, value: readyState },
        videoHeight: { configurable: true, value: height },
        videoWidth: { configurable: true, value: width },
    });
    video.getBoundingClientRect = () =>
        ({ bottom: height, height, left: 0, right: width, top: 0, width }) as DOMRect;
    document.body.append(video);
    return video;
};

interface FakeOverlay {
    attach: jest.Mock;
    render: jest.Mock;
    detach: jest.Mock;
}

const fakeOverlay = (): FakeOverlay => ({
    attach: jest.fn(),
    render: jest.fn(),
    detach: jest.fn(),
});

const engineWith = (overlay: OverlayRenderer): DarkviewEngine =>
    new DarkviewEngine({ document, overlayFactory: () => overlay });

describe('DarkviewEngine', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('applies the whole-frame filter in invert mode and cleans up completely', () => {
        const video = addVideo();
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);
        engine.updateSettings({ ...DEFAULT_SETTINGS, mode: 'always', intensity: 0.75 });

        expect(engine.start()).toEqual({ active: true, effect: 'applied' });
        expect(engine.start()).toEqual({ active: true, effect: 'applied' });
        expect(video).toHaveAttribute('data-youtube-darkview', 'active');
        expect(video.style.getPropertyValue('--youtube-darkview-intensity')).toBe('0.75');
        expect(document.getElementById('youtube-darkview-filter-style')).not.toBeNull();
        expect(overlay.attach).not.toHaveBeenCalled();

        expect(engine.toggle()).toEqual({ active: false, effect: 'off' });
        expect(engine.stop()).toEqual({ active: false, effect: 'off' });
        expect(video).not.toHaveAttribute('data-youtube-darkview');
        expect(document.getElementById('youtube-darkview-filter-style')).toBeNull();
    });

    it('renders the content-aware overlay continuously while a video plays', () => {
        const video = addVideo();
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        expect(engine.start()).toEqual({ active: true, effect: 'applied' });
        expect(overlay.attach).toHaveBeenCalledWith(video);
        expect(overlay.render).toHaveBeenCalledTimes(1);
        expect(video).not.toHaveAttribute('data-youtube-darkview');

        jest.advanceTimersByTime(33);
        expect(overlay.render).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(33);
        expect(overlay.render).toHaveBeenCalledTimes(3);

        engine.stop();
        expect(overlay.detach).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(500);
        expect(overlay.render).toHaveBeenCalledTimes(3);
    });

    it('renders with the configured block options and updates them without re-attaching', () => {
        addVideo();
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        expect(overlay.render).toHaveBeenLastCalledWith(
            expect.anything(),
            { blockFraction: 0.5, blockSize: 20, gateRatio: 0.35, intensity: 0.9 },
            expect.any(FrameGate),
        );

        expect(
            engine.updateSettings({ ...DEFAULT_SETTINGS, intensity: 0.7, sensitivity: 'high' }),
        ).toEqual({ active: true, effect: 'applied' });
        expect(overlay.render).toHaveBeenLastCalledWith(
            expect.anything(),
            { blockFraction: 0.4, blockSize: 20, gateRatio: 0.28, intensity: 0.7 },
            expect.any(FrameGate),
        );
        expect(overlay.attach).toHaveBeenCalledTimes(1);
        expect(overlay.detach).not.toHaveBeenCalled();
        engine.stop();
    });

    it('swaps between the overlay and the whole-frame filter when the mode changes', () => {
        const video = addVideo();
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        expect(overlay.attach).toHaveBeenCalledTimes(1);

        expect(engine.updateSettings({ ...DEFAULT_SETTINGS, mode: 'always' })).toEqual({
            active: true,
            effect: 'applied',
        });
        expect(overlay.detach).toHaveBeenCalledTimes(1);
        expect(video).toHaveAttribute('data-youtube-darkview', 'active');

        expect(engine.updateSettings({ ...DEFAULT_SETTINGS, mode: 'adaptive' })).toEqual({
            active: true,
            effect: 'applied',
        });
        expect(overlay.attach).toHaveBeenCalledTimes(2);
        expect(video).not.toHaveAttribute('data-youtube-darkview');
        engine.stop();
    });

    it('falls back to the whole-frame filter after repeated render failures', () => {
        const video = addVideo();
        const overlay = fakeOverlay();
        overlay.render.mockImplementation(() => {
            throw new DOMException('Canvas is tainted', 'SecurityError');
        });
        const engine = engineWith(overlay);

        engine.start();
        jest.advanceTimersByTime(100);
        expect(engine.getStatus()).toEqual({ active: true, effect: 'fallback' });
        expect(overlay.render).toHaveBeenCalledTimes(3);
        expect(overlay.detach).toHaveBeenCalledTimes(1);
        expect(video).toHaveAttribute('data-youtube-darkview', 'active');

        jest.advanceTimersByTime(1_000);
        expect(overlay.render).toHaveBeenCalledTimes(3);

        overlay.render.mockImplementation(() => undefined);
        expect(engine.updateSettings({ ...DEFAULT_SETTINGS })).toEqual({
            active: true,
            effect: 'applied',
        });
        expect(overlay.attach).toHaveBeenCalledTimes(2);
        expect(video).not.toHaveAttribute('data-youtube-darkview');
        engine.stop();
    });

    it('keeps rendering after a seek while the video is playing', () => {
        const video = addVideo();
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        expect(overlay.render).toHaveBeenCalledTimes(1);

        video.dispatchEvent(new Event('seeked'));
        expect(overlay.render).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(33);
        expect(overlay.render).toHaveBeenCalledTimes(3);
        engine.stop();
    });

    it('renders paused videos once instead of looping', () => {
        const video = addVideo({ paused: true });
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        expect(overlay.render).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1_000);
        expect(overlay.render).toHaveBeenCalledTimes(1);

        video.dispatchEvent(new Event('seeked'));
        expect(overlay.render).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(1_000);
        expect(overlay.render).toHaveBeenCalledTimes(2);

        Object.defineProperty(video, 'paused', { configurable: true, value: false });
        video.dispatchEvent(new Event('play'));
        expect(overlay.render).toHaveBeenCalledTimes(3);
        jest.advanceTimersByTime(33);
        expect(overlay.render).toHaveBeenCalledTimes(4);
        engine.stop();
    });

    it('suspends rendering while the document is hidden', () => {
        addVideo();
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });

        engine.start();
        jest.advanceTimersByTime(1_000);
        expect(overlay.render).toHaveBeenCalledTimes(1);

        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));
        expect(overlay.render).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(33);
        expect(overlay.render).toHaveBeenCalledTimes(3);
        engine.stop();
    });

    it('waits without rendering when no readable video data is available', () => {
        const video = addVideo({ readyState: HTMLMediaElement.HAVE_NOTHING });
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        jest.advanceTimersByTime(200);
        expect(overlay.render).not.toHaveBeenCalled();

        Object.defineProperty(video, 'readyState', {
            configurable: true,
            value: HTMLMediaElement.HAVE_CURRENT_DATA,
        });
        video.dispatchEvent(new Event('loadeddata'));
        expect(overlay.render).toHaveBeenCalledTimes(1);
        engine.stop();
    });

    it('moves the overlay to the largest video after page mutations', async () => {
        const initial = addVideo({ height: 180, width: 320 });
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        expect(overlay.attach).toHaveBeenLastCalledWith(initial);

        const replacement = addVideo({ height: 720, width: 1280 });
        await Promise.resolve();
        jest.advanceTimersByTime(100);
        expect(overlay.detach).toHaveBeenCalledTimes(1);
        expect(overlay.attach).toHaveBeenLastCalledWith(replacement);
        engine.stop();
    });

    it('binds a video that appears after activation', async () => {
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        expect(engine.start()).toEqual({ active: true, effect: 'monitoring' });

        const video = addVideo();
        document.body.append(document.createElement('div'));
        await Promise.resolve();
        jest.advanceTimersByTime(100);
        expect(overlay.attach).toHaveBeenCalledWith(video);
        expect(engine.getStatus()).toEqual({ active: true, effect: 'applied' });
        engine.stop();
    });

    it('builds a timeline for the current watch video and hands it to the overlay', async () => {
        window.history.pushState({}, '', '/watch?v=abcdefghijk');
        const video = addVideo();
        const overlay = fakeOverlay();
        const timeline = { litAt: jest.fn(() => true) };
        const timelineFactory = jest.fn(async (_videoId: string) => timeline);
        const engine = new DarkviewEngine({
            document,
            overlayFactory: () => overlay,
            timelineFactory,
        });

        engine.start();
        expect(timelineFactory).toHaveBeenCalledWith('abcdefghijk');
        expect(overlay.render.mock.lastCall?.[1]).not.toHaveProperty('timeline');

        await Promise.resolve();
        await Promise.resolve();
        const lastOptions = overlay.render.mock.lastCall?.[1] as { timeline?: unknown } | undefined;
        expect(lastOptions?.timeline).toBe(timeline);

        video.dispatchEvent(new Event('loadeddata'));
        expect(timelineFactory).toHaveBeenCalledTimes(1);

        engine.stop();
        window.history.pushState({}, '', '/');
    });

    it('drops and rebuilds the timeline when the pre-analysis toggle changes', async () => {
        window.history.pushState({}, '', '/watch?v=abcdefghijk');
        addVideo();
        const overlay = fakeOverlay();
        const timeline = { litAt: jest.fn(() => true) };
        const timelineFactory = jest.fn(async (_videoId: string) => timeline);
        const engine = new DarkviewEngine({
            document,
            overlayFactory: () => overlay,
            timelineFactory,
        });

        engine.start();
        await Promise.resolve();
        await Promise.resolve();
        expect(timelineFactory).toHaveBeenCalledTimes(1);

        engine.updateSettings({ ...DEFAULT_SETTINGS, preanalysis: false });
        expect(overlay.render.mock.lastCall?.[1]).not.toHaveProperty('timeline');
        expect(timelineFactory).toHaveBeenCalledTimes(1);

        engine.updateSettings({ ...DEFAULT_SETTINGS, preanalysis: true });
        expect(timelineFactory).toHaveBeenCalledTimes(2);

        engine.stop();
        window.history.pushState({}, '', '/');
    });

    it('retries the timeline after a stop discarded an in-flight fetch', async () => {
        window.history.pushState({}, '', '/watch?v=abcdefghijk');
        addVideo();
        const overlay = fakeOverlay();
        let resolveFetch: ((value: { litAt: () => boolean } | undefined) => void) | undefined;
        const timelineFactory = jest.fn(
            (_videoId: string) =>
                new Promise<{ litAt: () => boolean } | undefined>((resolve) => {
                    resolveFetch = resolve;
                }),
        );
        const engine = new DarkviewEngine({
            document,
            overlayFactory: () => overlay,
            timelineFactory,
        });

        engine.start();
        expect(timelineFactory).toHaveBeenCalledTimes(1);
        engine.stop();
        resolveFetch?.({ litAt: () => true });
        await Promise.resolve();
        await Promise.resolve();

        engine.start();
        expect(timelineFactory).toHaveBeenCalledTimes(2);
        engine.stop();
        window.history.pushState({}, '', '/');
    });

    it('ignores the timeline while the player shows an ad', async () => {
        window.history.pushState({}, '', '/watch?v=abcdefghijk');
        const player = document.createElement('div');
        player.className = 'html5-video-player ad-showing';
        document.body.append(player);
        const video = document.createElement('video');
        Object.defineProperties(video, {
            paused: { configurable: true, value: true },
            readyState: { configurable: true, value: HTMLMediaElement.HAVE_CURRENT_DATA },
        });
        video.getBoundingClientRect = () =>
            ({ bottom: 720, height: 720, left: 0, right: 1280, top: 0, width: 1280 }) as DOMRect;
        player.append(video);

        const overlay = fakeOverlay();
        const timeline = { litAt: jest.fn(() => true) };
        const timelineFactory = jest.fn(async (_videoId: string) => timeline);
        const engine = new DarkviewEngine({
            document,
            overlayFactory: () => overlay,
            timelineFactory,
        });

        engine.start();
        await Promise.resolve();
        await Promise.resolve();
        expect(overlay.render.mock.lastCall?.[1]).not.toHaveProperty('timeline');

        player.classList.remove('ad-showing');
        video.dispatchEvent(new Event('seeked'));
        const lastOptions = overlay.render.mock.lastCall?.[1] as { timeline?: unknown } | undefined;
        expect(lastOptions?.timeline).toBe(timeline);
        engine.stop();
        window.history.pushState({}, '', '/');
    });

    it('skips the timeline lookup away from video pages', () => {
        addVideo();
        const overlay = fakeOverlay();
        const timelineFactory = jest.fn(async () => undefined);
        const engine = new DarkviewEngine({
            document,
            overlayFactory: () => overlay,
            timelineFactory,
        });

        engine.start();
        expect(timelineFactory).not.toHaveBeenCalled();
        engine.stop();
    });

    it('paces rendering with requestVideoFrameCallback when the browser provides it', () => {
        const video = addVideo();
        let callback: (() => void) | undefined;
        const cancelVideoFrameCallback = jest.fn<(identifier: number) => void>();
        Object.assign(video, {
            cancelVideoFrameCallback,
            requestVideoFrameCallback: jest.fn((next: () => void) => {
                callback = next;
                return 42;
            }),
        });
        const overlay = fakeOverlay();
        const engine = engineWith(overlay);

        engine.start();
        expect(overlay.render).toHaveBeenCalledTimes(1);
        expect(video.requestVideoFrameCallback).toHaveBeenCalled();

        callback?.();
        expect(overlay.render).toHaveBeenCalledTimes(2);

        engine.stop();
        expect(cancelVideoFrameCallback).toHaveBeenCalledWith(42);
        callback?.();
        expect(overlay.render).toHaveBeenCalledTimes(2);
    });

    it('reports fallback when no overlay can be created at all', () => {
        const video = addVideo();
        const engine = new DarkviewEngine({
            document,
            overlayFactory: () => {
                throw new Error('No canvas support');
            },
        });

        expect(engine.start()).toEqual({ active: true, effect: 'fallback' });
        expect(video).toHaveAttribute('data-youtube-darkview', 'active');
        engine.stop();
    });
});

describe('CanvasBlockOverlay', () => {
    const pixel = (value: number) => ({
        data: new Uint8ClampedArray([value, value, value, 255]),
        width: 1,
        height: 1,
    });

    const overlayWith = (mainContext: unknown, probeContext: unknown) => {
        const main = document.createElement('canvas');
        main.getContext = jest.fn(() => mainContext) as never;
        const probe = document.createElement('canvas');
        probe.getContext = jest.fn(() => probeContext) as never;
        const spy = jest
            .spyOn(document, 'createElement')
            .mockReturnValueOnce(main)
            .mockReturnValueOnce(probe);
        const overlay = new CanvasBlockOverlay(document);
        spy.mockRestore();
        return { overlay, main, probe };
    };

    const videoInContainer = () => {
        const container = document.createElement('div');
        const video = document.createElement('video');
        container.append(video);
        document.body.append(container);
        video.getBoundingClientRect = () =>
            ({ bottom: 90, height: 90, left: 0, right: 160, top: 0, width: 160 }) as DOMRect;
        return { container, video };
    };

    const baseOptions = { blockFraction: 0.5, blockSize: 20, gateRatio: 0.35, intensity: 1 };

    it('gates from a small probe and pays full resolution only for lit frames', () => {
        let probeValue = 255;
        const probeContext = {
            drawImage: jest.fn(),
            getImageData: jest.fn(() => pixel(probeValue)),
        };
        const mainContext = {
            drawImage: jest.fn(),
            getImageData: jest.fn(() => pixel(255)),
            putImageData: jest.fn(),
        };
        const { overlay, main } = overlayWith(mainContext, probeContext);
        const { container, video } = videoInContainer();
        video.style.top = '12px';

        overlay.attach(video);
        expect(main.parentElement).toBe(container);
        expect(main.style.visibility).toBe('hidden');

        const gate = new FrameGate();
        overlay.render(video, baseOptions, gate);
        expect(probeContext.drawImage).toHaveBeenCalledTimes(1);
        expect(mainContext.drawImage).toHaveBeenCalledTimes(1);
        expect(main.width).toBe(160);
        expect(main.style.top).toBe('12px');
        const rendered = mainContext.putImageData.mock.calls[0]?.[0] as {
            data: Uint8ClampedArray;
        };
        expect(Array.from(rendered.data)).toEqual([0, 0, 0, 255]);
        expect(main.style.visibility).toBe('visible');

        probeValue = 10;
        overlay.render(video, baseOptions, gate);
        expect(main.style.visibility).toBe('hidden');
        expect(probeContext.drawImage).toHaveBeenCalledTimes(2);
        expect(mainContext.drawImage).toHaveBeenCalledTimes(1);
        expect(mainContext.putImageData).toHaveBeenCalledTimes(1);

        overlay.detach();
        expect(main.parentElement).toBeNull();
        expect(main.style.visibility).toBe('hidden');
    });

    it('re-attaches an overlay that the page disconnected', () => {
        const probeContext = { drawImage: jest.fn(), getImageData: jest.fn(() => pixel(255)) };
        const mainContext = {
            drawImage: jest.fn(),
            getImageData: jest.fn(() => pixel(255)),
            putImageData: jest.fn(),
        };
        const { overlay, main } = overlayWith(mainContext, probeContext);
        const { container, video } = videoInContainer();

        overlay.attach(video);
        main.remove();
        expect(main.isConnected).toBe(false);

        overlay.render(video, baseOptions, new FrameGate());
        expect(main.parentElement).toBe(container);
        expect(main.style.visibility).toBe('visible');
    });

    it('trusts a pre-analyzed timeline before the live gate and keeps it in step', () => {
        const probeContext = { drawImage: jest.fn(), getImageData: jest.fn(() => pixel(255)) };
        const mainContext = {
            drawImage: jest.fn(),
            getImageData: jest.fn(() => pixel(10)),
            putImageData: jest.fn(),
        };
        const { overlay, main } = overlayWith(mainContext, probeContext);
        const { video } = videoInContainer();
        const gate = new FrameGate();

        overlay.attach(video);

        overlay.render(video, { ...baseOptions, timeline: { litAt: () => false } }, gate);
        expect(probeContext.drawImage).not.toHaveBeenCalled();
        expect(mainContext.drawImage).not.toHaveBeenCalled();
        expect(main.style.visibility).toBe('hidden');
        expect(gate.value).toBe(false);

        overlay.render(video, { ...baseOptions, timeline: { litAt: () => true } }, gate);
        expect(mainContext.putImageData).toHaveBeenCalledTimes(1);
        expect(probeContext.drawImage).not.toHaveBeenCalled();
        expect(main.style.visibility).toBe('visible');
        expect(gate.value).toBe(true);

        overlay.render(video, { ...baseOptions, timeline: { litAt: () => undefined } }, gate);
        expect(probeContext.drawImage).toHaveBeenCalledTimes(1);
        expect(main.style.visibility).toBe('visible');
    });

    it('rejects videos without a parent or readable dimensions', () => {
        const context = { drawImage: jest.fn(), getImageData: jest.fn(), putImageData: jest.fn() };
        const { overlay } = overlayWith(context, context);

        const detached = document.createElement('video');
        expect(() => overlay.attach(detached)).toThrow('no parent element');

        const { video } = videoInContainer();
        video.getBoundingClientRect = () =>
            ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }) as DOMRect;
        overlay.attach(video);
        expect(() => overlay.render(video, baseOptions, new FrameGate())).toThrow(
            'no readable dimensions',
        );
    });

    it('requires a 2D canvas context', () => {
        const canvas = document.createElement('canvas');
        canvas.getContext = jest.fn(() => null);
        const createElement = jest.spyOn(document, 'createElement').mockReturnValueOnce(canvas);
        expect(() => new CanvasBlockOverlay(document)).toThrow('2D canvas context');
        createElement.mockRestore();
    });
});
