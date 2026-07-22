import type { DarkviewSensitivity } from '~data/settings';

export interface PixelFrame {
    data: {
        readonly length: number;
        [index: number]: number;
    };
    width: number;
    height: number;
}

export interface SensitivityProfile {
    blockFraction: number;
    gateRatio: number;
}

export interface BlockInversionOptions {
    blockSize: number;
    blockFraction: number;
    intensity: number;
}

export const BLOCK_SIZE = 20;
export const MEASURE_STRIDE = 4;

// a pixel reads as light background only when bright AND nearly neutral,
// so pale skin, sepia photos, and sky do not count as invertible white
const BACKGROUND_MIN_LUMINANCE = 204;
const BACKGROUND_MAX_CHROMA = 41;
// within a qualified block, besides background only truly neutral ink flips
// (text glyphs, gray lines); even slightly tinted pixels - photo shadows,
// skin, sepia - keep their color where a block straddles a photo edge
const NEUTRAL_INK_MAX_CHROMA = 24;

export const SENSITIVITY_PROFILES: Readonly<Record<DarkviewSensitivity, SensitivityProfile>> = {
    low: { blockFraction: 0.65, gateRatio: 0.45 },
    balanced: { blockFraction: 0.5, gateRatio: 0.32 },
    high: { blockFraction: 0.4, gateRatio: 0.22 },
};

const validateFrame = (frame: PixelFrame): void => {
    if (frame.width < 1 || frame.height < 1 || frame.data.length < frame.width * frame.height * 4) {
        throw new Error('Invalid pixel frame');
    }
};

const isBackground = (red: number, green: number, blue: number): boolean => {
    const luminance = (2126 * red + 7152 * green + 722 * blue) / 10000;
    if (luminance < BACKGROUND_MIN_LUMINANCE) {
        return false;
    }
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    return chroma <= BACKGROUND_MAX_CHROMA;
};

export const measureLightness = (frame: PixelFrame, stride: number = MEASURE_STRIDE): number => {
    validateFrame(frame);
    const { data, height, width } = frame;

    let background = 0;
    let sampled = 0;
    for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
            const index = (y * width + x) * 4;
            sampled += 1;
            if (isBackground(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0)) {
                background += 1;
            }
        }
    }

    return sampled === 0 ? 0 : background / sampled;
};

export const invertLightBlocks = (frame: PixelFrame, options: BlockInversionOptions): number => {
    validateFrame(frame);
    const { data, height, width } = frame;
    const { blockFraction, blockSize, intensity } = options;
    if (blockSize < 1) {
        throw new Error('Invalid block size');
    }

    const blocksWide = Math.ceil(width / blockSize);
    const blocksHigh = Math.ceil(height / blockSize);
    const qualified = new Uint8Array(blocksWide * blocksHigh);
    let invertedBlocks = 0;

    for (let blockY = 0; blockY < blocksHigh; blockY += 1) {
        const startY = blockY * blockSize;
        const endY = Math.min(startY + blockSize, height);

        for (let blockX = 0; blockX < blocksWide; blockX += 1) {
            const startX = blockX * blockSize;
            const endX = Math.min(startX + blockSize, width);

            let backgroundPixels = 0;
            for (let y = startY; y < endY; y += 1) {
                let index = (y * width + startX) * 4;
                for (let x = startX; x < endX; x += 1, index += 4) {
                    if (
                        isBackground(data[index] ?? 0, data[index + 1] ?? 0, data[index + 2] ?? 0)
                    ) {
                        backgroundPixels += 1;
                    }
                }
            }

            const blockPixels = (endX - startX) * (endY - startY);
            if (backgroundPixels / blockPixels >= blockFraction) {
                qualified[blockY * blocksWide + blockX] = 1;
                invertedBlocks += 1;
            }
        }
    }

    const hasQualifiedNeighbor = (blockX: number, blockY: number): boolean => {
        for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
            for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
                const neighborX = blockX + deltaX;
                const neighborY = blockY + deltaY;
                if (
                    neighborX >= 0 &&
                    neighborY >= 0 &&
                    neighborX < blocksWide &&
                    neighborY < blocksHigh &&
                    qualified[neighborY * blocksWide + neighborX] === 1
                ) {
                    return true;
                }
            }
        }
        return false;
    };

    for (let blockY = 0; blockY < blocksHigh; blockY += 1) {
        const startY = blockY * blockSize;
        const endY = Math.min(startY + blockSize, height);

        for (let blockX = 0; blockX < blocksWide; blockX += 1) {
            const isQualified = qualified[blockY * blocksWide + blockX] === 1;
            // a block bordering an inverted region flips only its unambiguous
            // background pixels, so the background darkens seamlessly up to
            // photo and diagram edges without ever touching their content
            const isBorder = !isQualified && hasQualifiedNeighbor(blockX, blockY);
            if (!isQualified && !isBorder) {
                continue;
            }

            const startX = blockX * blockSize;
            const endX = Math.min(startX + blockSize, width);
            for (let y = startY; y < endY; y += 1) {
                let index = (y * width + startX) * 4;
                for (let x = startX; x < endX; x += 1, index += 4) {
                    const red = data[index] ?? 0;
                    const green = data[index + 1] ?? 0;
                    const blue = data[index + 2] ?? 0;
                    if (!isBackground(red, green, blue)) {
                        if (isBorder) {
                            continue;
                        }
                        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
                        if (chroma > NEUTRAL_INK_MAX_CHROMA) {
                            continue;
                        }
                    }
                    data[index] = (255 - red) * intensity;
                    data[index + 1] = (255 - green) * intensity;
                    data[index + 2] = (255 - blue) * intensity;
                }
            }
        }
    }

    return invertedBlocks;
};

export class FrameGate {
    private entering = 0;
    private exiting = 0;
    private lit = false;

    public get value(): boolean {
        return this.lit;
    }

    public reset(): void {
        this.entering = 0;
        this.exiting = 0;
        this.lit = false;
    }

    public update(qualifies: boolean, stable = false): boolean {
        if (qualifies) {
            this.entering += 1;
            this.exiting = 0;
            if (!this.lit && this.entering >= (stable ? 1 : 2)) {
                this.lit = true;
            }
        } else {
            this.entering = 0;
            this.exiting += 1;
            if (this.lit && this.exiting >= (stable ? 1 : 3)) {
                this.lit = false;
            }
        }

        return this.lit;
    }
}
