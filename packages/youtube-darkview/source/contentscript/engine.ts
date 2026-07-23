import type { DarkviewStatus } from '~data/messages';
import { type DarkviewSettings, DEFAULT_SETTINGS, normalizeSettings } from '~data/settings';

import {
    BLOCK_SIZE,
    type BlockInversionOptions,
    FrameGate,
    invertLightBlocks,
    measureLightness,
    SENSITIVITY_PROFILES,
} from './blocks';
import { videoIdFromUrl } from './storyboard';

const FILTER_ATTRIBUTE = 'data-youtube-darkview';
const FILTER_INTENSITY_PROPERTY = '--youtube-darkview-intensity';
const FILTER_STYLE_ID = 'youtube-darkview-filter-style';
const MAX_RENDER_FAILURES = 3;
const OVERLAY_ID = 'youtube-darkview-overlay';
// 1000 ms / 30 frames ≈ 33 ms per frame, matching the original overlay cadence
const RENDER_INTERVAL_MS = 33;
const VIDEO_REBIND_DELAY_MS = 100;

type VideoWithFrameCallback = HTMLVideoElement & {
    cancelVideoFrameCallback?: (identifier: number) => void;
    requestVideoFrameCallback?: (callback: () => void) => number;
};

export interface GateSource {
    litAt(time: number, gateRatio: number): boolean | undefined;
}

export interface OverlayOptions extends BlockInversionOptions {
    gateRatio: number;
    timeline?: GateSource;
}

export interface OverlayRenderer {
    attach(video: HTMLVideoElement): void;
    render(video: HTMLVideoElement, options: OverlayOptions, gate: FrameGate): void;
    detach(): void;
}

export interface DarkviewEngineOptions {
    document?: Document;
    overlayFactory?: (document: Document) => OverlayRenderer;
    timelineFactory?: (videoId: string) => Promise<GateSource | undefined>;
}

export class CanvasBlockOverlay implements OverlayRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D;

    public constructor(private readonly document: Document) {
        this.canvas = document.createElement('canvas');
        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            throw new Error('The browser did not provide a 2D canvas context');
        }
        this.context = context;

        this.canvas.id = OVERLAY_ID;
        const style = this.canvas.style;
        style.position = 'absolute';
        style.left = '0';
        style.right = '0';
        style.margin = '0 auto';
        style.pointerEvents = 'none';
        style.zIndex = '58';
        style.visibility = 'hidden';
    }

    public attach(video: HTMLVideoElement): void {
        const container = video.parentElement;
        if (!container) {
            throw new Error('The video has no parent element to hold the overlay');
        }
        container.append(this.canvas);
    }

    public render(video: HTMLVideoElement, options: OverlayOptions, gate: FrameGate): void {
        // a pre-analyzed timeline decides instantly and lets unlit frames
        // skip every drawing cost; uncovered times fall through to the gate
        const timelineLit = options.timeline?.litAt(video.currentTime, options.gateRatio);
        if (timelineLit === false) {
            this.canvas.style.visibility = 'hidden';
            return;
        }

        const dimensions = video.getBoundingClientRect();
        const width = Math.round(dimensions.width);
        const height = Math.round(dimensions.height);
        if (width < 1 || height < 1) {
            throw new Error('The video has no readable dimensions');
        }

        if (this.canvas.width !== width) {
            this.canvas.width = width;
        }
        if (this.canvas.height !== height) {
            this.canvas.height = height;
        }

        const style = this.canvas.style;
        const top = this.document.defaultView?.getComputedStyle(video).top ?? '';
        style.top = top.endsWith('px') ? top : '0';
        style.width = `${width}px`;
        style.height = `${height}px`;

        this.context.drawImage(video, 0, 0, width, height);
        const frame = this.context.getImageData(0, 0, width, height);

        // already dark frames never cross the gate: the overlay stays hidden
        // and the pristine video shows through
        const lit =
            timelineLit ?? gate.update(measureLightness(frame) >= options.gateRatio, video.paused);
        if (!lit) {
            style.visibility = 'hidden';
            return;
        }

        invertLightBlocks(frame, options);
        this.context.putImageData(frame, 0, 0);
        style.visibility = 'visible';
    }

    public detach(): void {
        this.canvas.remove();
    }
}

export class DarkviewEngine {
    private active = false;
    private readonly document: Document;
    private effect: DarkviewStatus['effect'] = 'off';
    private frameCallbackIdentifier: number | undefined;
    private readonly gate = new FrameGate();
    private generation = 0;
    private mutationObserver: MutationObserver | undefined;
    private overlay: OverlayRenderer | undefined;
    private overlayAttached = false;
    private readonly overlayFactory: (document: Document) => OverlayRenderer;
    private rebindTimerIdentifier: number | undefined;
    private renderFailures = 0;
    private settings: DarkviewSettings = { ...DEFAULT_SETTINGS };
    private timeline: GateSource | undefined;
    private readonly timelineFactory:
        | ((videoId: string) => Promise<GateSource | undefined>)
        | undefined;
    private timelineVideoId: string | undefined;
    private timerIdentifier: number | undefined;
    private video: HTMLVideoElement | undefined;

    public constructor(options: DarkviewEngineOptions = {}) {
        this.document = options.document ?? document;
        this.overlayFactory =
            options.overlayFactory ?? ((target: Document) => new CanvasBlockOverlay(target));
        this.timelineFactory = options.timelineFactory;
    }

    public getStatus(): DarkviewStatus {
        return { active: this.active, effect: this.effect };
    }

    public start(): DarkviewStatus {
        if (this.active) {
            return this.getStatus();
        }

        this.active = true;
        this.effect = 'monitoring';
        this.observeVideoChanges();
        this.bindBestVideo();
        return this.getStatus();
    }

    public stop(): DarkviewStatus {
        if (!this.active) {
            return this.getStatus();
        }

        this.active = false;
        this.generation += 1;
        this.cancelScheduledWork();
        this.mutationObserver?.disconnect();
        this.mutationObserver = undefined;
        this.detachVideo();
        this.removeFilterStyle();
        this.effect = 'off';
        return this.getStatus();
    }

    public toggle(): DarkviewStatus {
        return this.active ? this.stop() : this.start();
    }

    public updateSettings(value: unknown): DarkviewStatus {
        const previousMode = this.settings.mode;
        this.settings = normalizeSettings(value);
        this.renderFailures = 0;

        if (!this.active || !this.video) {
            return this.getStatus();
        }

        if (this.settings.mode !== previousMode || this.effect === 'fallback') {
            this.configureVideo();
            return this.getStatus();
        }

        if (this.settings.mode === 'always') {
            this.applyFilter('applied');
            return this.getStatus();
        }

        // the overlay reads the new options on the next frame; repaint paused frames now
        this.ensureTimeline();
        this.renderOnce();
        return this.getStatus();
    }

    private readonly handleDocumentVisibility = (): void => {
        if (!this.active || !this.video || this.settings.mode !== 'adaptive') {
            return;
        }

        if (this.document.hidden) {
            this.cancelRendering();
        } else {
            this.renderOnce();
            this.scheduleNextRender();
        }
    };

    private readonly handleVideoAvailable = (): void => {
        if (!this.active || !this.video) {
            return;
        }
        this.configureVideo();
    };

    private readonly handleVideoPauseOrSeek = (): void => {
        if (!this.active || this.settings.mode !== 'adaptive') {
            return;
        }
        this.cancelRendering();
        this.renderOnce();
        // a seek during playback fires 'seeked' without 'play', so the loop must resume here;
        // the timer branch of scheduleNextRender refuses paused videos
        this.scheduleNextRender();
    };

    private readonly handleVideoPlay = (): void => {
        if (!this.active || this.settings.mode !== 'adaptive') {
            return;
        }
        this.renderOnce();
        this.scheduleNextRender();
    };

    private observeVideoChanges(): void {
        const window = this.document.defaultView;
        if (!window || this.mutationObserver) {
            return;
        }

        this.document.addEventListener('visibilitychange', this.handleDocumentVisibility);
        this.mutationObserver = new window.MutationObserver(() => {
            if (this.rebindTimerIdentifier !== undefined) {
                window.clearTimeout(this.rebindTimerIdentifier);
            }
            this.rebindTimerIdentifier = window.setTimeout(() => {
                this.rebindTimerIdentifier = undefined;
                this.bindBestVideo();
            }, VIDEO_REBIND_DELAY_MS);
        });
        this.mutationObserver.observe(this.document.body, { childList: true, subtree: true });
    }

    private bindBestVideo(): void {
        const candidate = this.findBestVideo();
        if (candidate === this.video) {
            return;
        }

        this.detachVideo();
        this.video = candidate;
        this.renderFailures = 0;
        if (!candidate) {
            this.effect = 'monitoring';
            return;
        }

        candidate.addEventListener('emptied', this.handleVideoAvailable);
        candidate.addEventListener('loadeddata', this.handleVideoAvailable);
        candidate.addEventListener('pause', this.handleVideoPauseOrSeek);
        candidate.addEventListener('play', this.handleVideoPlay);
        candidate.addEventListener('seeked', this.handleVideoPauseOrSeek);
        this.configureVideo();
    }

    private findBestVideo(): HTMLVideoElement | undefined {
        let bestVideo: HTMLVideoElement | undefined;
        let bestArea = 0;

        for (const video of this.document.querySelectorAll('video')) {
            const dimensions = video.getBoundingClientRect();
            const area = dimensions.width * dimensions.height;
            if (video.isConnected && area > bestArea) {
                bestVideo = video;
                bestArea = area;
            }
        }

        return bestVideo;
    }

    private configureVideo(): void {
        this.cancelRendering();
        this.renderFailures = 0;

        if (!this.video) {
            this.detachOverlay();
            this.effect = 'monitoring';
            return;
        }

        if (this.settings.mode === 'always') {
            this.detachOverlay();
            this.applyFilter('applied');
            return;
        }

        this.removeFilter(this.video);
        if (!this.attachOverlay(this.video)) {
            this.applyFilter('fallback');
            return;
        }

        this.gate.reset();
        this.ensureTimeline();
        this.effect = 'applied';
        this.renderOnce();
        this.scheduleNextRender();
    }

    private ensureTimeline(): void {
        const factory = this.timelineFactory;
        const href = this.document.defaultView?.location.href;
        if (!factory || !href) {
            return;
        }

        // pre-analysis is the user's choice; off means the live gate decides alone
        const videoId = this.settings.preanalysis ? videoIdFromUrl(href) : undefined;
        if (!videoId) {
            this.timeline = undefined;
            this.timelineVideoId = undefined;
            return;
        }
        if (videoId === this.timelineVideoId) {
            return;
        }

        this.timelineVideoId = videoId;
        this.timeline = undefined;
        const generation = this.generation;
        void factory(videoId)
            .then((timeline) => {
                if (generation !== this.generation || this.timelineVideoId !== videoId) {
                    return;
                }
                this.timeline = timeline;
                // repaint the current (possibly paused) frame with the new knowledge
                this.renderOnce();
            })
            .catch(() => undefined);
    }

    private attachOverlay(video: HTMLVideoElement): boolean {
        try {
            this.overlay ??= this.overlayFactory(this.document);
            if (!this.overlayAttached) {
                this.overlay.attach(video);
                this.overlayAttached = true;
            }
            return true;
        } catch {
            return false;
        }
    }

    private detachOverlay(): void {
        if (this.overlayAttached) {
            this.overlay?.detach();
            this.overlayAttached = false;
        }
    }

    private overlayOptions(): OverlayOptions {
        return {
            blockSize: BLOCK_SIZE,
            intensity: this.settings.intensity,
            ...SENSITIVITY_PROFILES[this.settings.sensitivity],
            ...(this.timeline ? { timeline: this.timeline } : {}),
        };
    }

    private renderOnce(): void {
        const video = this.video;
        if (
            !this.active ||
            !video ||
            this.settings.mode !== 'adaptive' ||
            this.effect !== 'applied' ||
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            return;
        }

        try {
            this.overlay?.render(video, this.overlayOptions(), this.gate);
            this.renderFailures = 0;
        } catch {
            this.renderFailures += 1;
            if (this.renderFailures >= MAX_RENDER_FAILURES) {
                this.cancelRendering();
                this.detachOverlay();
                this.applyFilter('fallback');
            }
        }
    }

    private scheduleNextRender(): void {
        const window = this.document.defaultView;
        const video = this.video as VideoWithFrameCallback | undefined;
        if (
            !window ||
            !this.active ||
            !video ||
            this.settings.mode !== 'adaptive' ||
            this.effect !== 'applied' ||
            this.document.hidden ||
            this.timerIdentifier !== undefined ||
            this.frameCallbackIdentifier !== undefined
        ) {
            return;
        }

        const generation = this.generation;
        const renderAndContinue = (): void => {
            if (generation !== this.generation || !this.active) {
                return;
            }
            this.renderOnce();
            this.scheduleNextRender();
        };

        if (typeof video.requestVideoFrameCallback === 'function') {
            // fires once per presented frame and stays silent while paused or hidden
            this.frameCallbackIdentifier = video.requestVideoFrameCallback(() => {
                this.frameCallbackIdentifier = undefined;
                renderAndContinue();
            });
            return;
        }

        if (video.paused) {
            return;
        }
        this.timerIdentifier = window.setTimeout(() => {
            this.timerIdentifier = undefined;
            renderAndContinue();
        }, RENDER_INTERVAL_MS);
    }

    private cancelRendering(): void {
        const window = this.document.defaultView;
        const video = this.video as VideoWithFrameCallback | undefined;
        if (window && this.timerIdentifier !== undefined) {
            window.clearTimeout(this.timerIdentifier);
        }
        if (
            video &&
            this.frameCallbackIdentifier !== undefined &&
            typeof video.cancelVideoFrameCallback === 'function'
        ) {
            video.cancelVideoFrameCallback(this.frameCallbackIdentifier);
        }
        this.timerIdentifier = undefined;
        this.frameCallbackIdentifier = undefined;
    }

    private cancelScheduledWork(): void {
        const window = this.document.defaultView;
        this.cancelRendering();
        if (window && this.rebindTimerIdentifier !== undefined) {
            window.clearTimeout(this.rebindTimerIdentifier);
        }
        this.rebindTimerIdentifier = undefined;
        this.document.removeEventListener('visibilitychange', this.handleDocumentVisibility);
    }

    private detachVideo(): void {
        this.cancelRendering();
        this.detachOverlay();
        if (!this.video) {
            return;
        }

        this.video.removeEventListener('emptied', this.handleVideoAvailable);
        this.video.removeEventListener('loadeddata', this.handleVideoAvailable);
        this.video.removeEventListener('pause', this.handleVideoPauseOrSeek);
        this.video.removeEventListener('play', this.handleVideoPlay);
        this.video.removeEventListener('seeked', this.handleVideoPauseOrSeek);
        this.removeFilter(this.video);
        this.video = undefined;
    }

    private applyFilter(effect: 'applied' | 'fallback'): void {
        if (!this.video) {
            return;
        }

        this.ensureFilterStyle();
        this.video.setAttribute(FILTER_ATTRIBUTE, 'active');
        this.video.style.setProperty(FILTER_INTENSITY_PROPERTY, String(this.settings.intensity));
        this.effect = effect;
    }

    private removeFilter(video: HTMLVideoElement): void {
        video.removeAttribute(FILTER_ATTRIBUTE);
        video.style.removeProperty(FILTER_INTENSITY_PROPERTY);
    }

    private ensureFilterStyle(): void {
        if (this.document.getElementById(FILTER_STYLE_ID)) {
            return;
        }

        const style = this.document.createElement('style');
        style.id = FILTER_STYLE_ID;
        style.textContent = `
            video[${FILTER_ATTRIBUTE}="active"] {
                filter: invert(1) hue-rotate(180deg)
                    brightness(var(${FILTER_INTENSITY_PROPERTY}, 0.9))
                    contrast(0.92) saturate(0.9) !important;
            }
        `;
        this.document.head.append(style);
    }

    private removeFilterStyle(): void {
        this.document.getElementById(FILTER_STYLE_ID)?.remove();
    }
}
