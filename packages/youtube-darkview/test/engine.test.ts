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
            { blockFraction: 0.5, blockSize: 20, gateRatio: 0.32, intensity: 0.9 },
            expect.any(FrameGate),
        );

        expect(
            engine.updateSettings({ ...DEFAULT_SETTINGS, intensity: 0.7, sensitivity: 'high' }),
        ).toEqual({ active: true, effect: 'applied' });
        expect(overlay.render).toHaveBeenLastCalledWith(
            expect.anything(),
            { blockFraction: 0.4, blockSize: 20, gateRatio: 0.22, intensity: 0.7 },
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
    it('attaches beside the video, inverts light frames, and hides on dark frames', () => {
        let pixels = [255, 255, 255, 255];
        const drawImage = jest.fn();
        const getImageData = jest.fn(() => ({
            data: new Uint8ClampedArray(pixels),
            width: 1,
            height: 1,
        }));
        const putImageData = jest.fn();
        const canvas = document.createElement('canvas');
        canvas.getContext = jest.fn(() => ({ drawImage, getImageData, putImageData })) as never;
        const createElement = jest.spyOn(document, 'createElement').mockReturnValueOnce(canvas);
        const overlay = new CanvasBlockOverlay(document);
        createElement.mockRestore();

        const container = document.createElement('div');
        const video = document.createElement('video');
        container.append(video);
        document.body.append(container);
        video.getBoundingClientRect = () =>
            ({ bottom: 90, height: 90, left: 0, right: 160, top: 0, width: 160 }) as DOMRect;
        video.style.top = '12px';

        overlay.attach(video);
        expect(canvas.parentElement).toBe(container);
        expect(canvas.style.pointerEvents).toBe('none');
        expect(canvas.style.visibility).toBe('hidden');

        const gate = new FrameGate();
        const options = { blockFraction: 0.5, blockSize: 20, gateRatio: 0.32, intensity: 1 };
        overlay.render(video, options, gate);
        expect(canvas.width).toBe(160);
        expect(canvas.height).toBe(90);
        expect(canvas.style.top).toBe('12px');
        expect(canvas.style.width).toBe('160px');
        expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 160, 90);
        const rendered = putImageData.mock.calls[0]?.[0] as { data: Uint8ClampedArray };
        expect(Array.from(rendered.data)).toEqual([0, 0, 0, 255]);
        expect(canvas.style.visibility).toBe('visible');

        pixels = [10, 10, 10, 255];
        overlay.render(video, options, gate);
        expect(putImageData).toHaveBeenCalledTimes(1);
        expect(canvas.style.visibility).toBe('hidden');

        overlay.detach();
        expect(canvas.parentElement).toBeNull();
    });

    it('rejects videos without a parent or readable dimensions', () => {
        const context = { drawImage: jest.fn(), getImageData: jest.fn(), putImageData: jest.fn() };
        const canvas = document.createElement('canvas');
        canvas.getContext = jest.fn(() => context) as never;
        const createElement = jest.spyOn(document, 'createElement').mockReturnValueOnce(canvas);
        const overlay = new CanvasBlockOverlay(document);
        createElement.mockRestore();

        const detached = document.createElement('video');
        expect(() => overlay.attach(detached)).toThrow('no parent element');

        const container = document.createElement('div');
        const video = document.createElement('video');
        container.append(video);
        document.body.append(container);
        video.getBoundingClientRect = () =>
            ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 }) as DOMRect;
        expect(() =>
            overlay.render(
                video,
                { blockFraction: 0.5, blockSize: 20, gateRatio: 0.32, intensity: 1 },
                new FrameGate(),
            ),
        ).toThrow('no readable dimensions');
    });

    it('requires a 2D canvas context', () => {
        const canvas = document.createElement('canvas');
        canvas.getContext = jest.fn(() => null);
        const createElement = jest.spyOn(document, 'createElement').mockReturnValueOnce(canvas);
        expect(() => new CanvasBlockOverlay(document)).toThrow('2D canvas context');
        createElement.mockRestore();
    });
});
