import { SENSITIVITY_PROFILES } from './blocks';

export interface TimelineSample {
    time: number;
    ratio: number;
}

export interface TimelineSegment {
    start: number;
    end: number;
    ratio: number;
    stable: boolean;
}

const GATE_RATIOS = Object.values(SENSITIVITY_PROFILES).map((profile) => profile.gateRatio);

// a slide that is mostly dark imagery still deserves its light margins
// inverted; what separates it from movie footage is temporal stability -
// measured: dark-dominant lecture slides hold their ratio (delta <= 0.05)
// for minutes, while footage never sustains a dim-but-lit ratio at all
export const STABLE_FLOOR_FACTOR = 0.4;
const STABLE_MAX_DELTA = 0.05;
const STABLE_MIN_SECONDS = 24;
const STABLE_MIN_FRAMES = 3;

const decisionThresholds = GATE_RATIOS.flatMap((gateRatio) => [
    gateRatio,
    gateRatio * STABLE_FLOOR_FACTOR,
]);

// two ratios are interchangeable when every sensitivity profile decides them
// identically on both the direct and the stable path, so merging them can
// never change what a viewer sees
const sameDecisions = (left: number, right: number): boolean =>
    decisionThresholds.every((threshold) => left >= threshold === right >= threshold);

const markStability = (sorted: readonly TimelineSample[], frameDuration: number): boolean[] => {
    const minimumRun = Math.max(STABLE_MIN_FRAMES, Math.ceil(STABLE_MIN_SECONDS / frameDuration));
    const stable = new Array<boolean>(sorted.length).fill(false);

    let runStart = 0;
    for (let index = 1; index <= sorted.length; index += 1) {
        const previous = sorted[index - 1];
        const current = sorted[index];
        const continues =
            previous !== undefined &&
            current !== undefined &&
            Math.abs(current.ratio - previous.ratio) <= STABLE_MAX_DELTA;
        if (continues) {
            continue;
        }
        if (index - runStart >= minimumRun) {
            stable.fill(true, runStart, index);
        }
        runStart = index;
    }

    return stable;
};

export const buildSegments = (
    samples: readonly TimelineSample[],
    frameDuration: number,
    duration: number,
): TimelineSegment[] => {
    if (!(frameDuration > 0) || !(duration > 0)) {
        return [];
    }

    // invalid samples are dropped before stability marking so a single bad
    // value cannot break an otherwise stable run
    const sorted = samples
        .filter(
            (sample) =>
                Number.isFinite(sample.time) &&
                sample.time >= 0 &&
                sample.time < duration &&
                Number.isFinite(sample.ratio),
        )
        .sort((left, right) => left.time - right.time);
    const stability = markStability(sorted, frameDuration);
    const segments: TimelineSegment[] = [];

    sorted.forEach((sample, index) => {
        const end = Math.min(sample.time + frameDuration, duration);
        const stable = stability[index] === true;
        const previous = segments[segments.length - 1];
        if (
            previous &&
            previous.end >= sample.time &&
            previous.stable === stable &&
            sameDecisions(previous.ratio, sample.ratio)
        ) {
            const previousSpan = previous.end - previous.start;
            const span = end - sample.time;
            previous.ratio =
                (previous.ratio * previousSpan + sample.ratio * span) / (previousSpan + span);
            previous.end = Math.max(previous.end, end);
            return;
        }

        segments.push({ start: sample.time, end, ratio: sample.ratio, stable });
    });

    return segments;
};

export class GateTimeline {
    public constructor(private readonly segments: readonly TimelineSegment[]) {}

    public litAt(time: number, gateRatio: number): boolean | undefined {
        let low = 0;
        let high = this.segments.length - 1;
        while (low <= high) {
            const middle = (low + high) >> 1;
            const segment = this.segments[middle];
            if (!segment) {
                return undefined;
            }
            if (time < segment.start) {
                high = middle - 1;
            } else if (time >= segment.end) {
                low = middle + 1;
            } else {
                return (
                    segment.ratio >= gateRatio ||
                    (segment.stable && segment.ratio >= gateRatio * STABLE_FLOOR_FACTOR)
                );
            }
        }
        return undefined;
    }
}
