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
// border blocks flip only near-black ink besides background, so bold glyph
// bodies stay readable while mid-gray photo edges keep their tone
const DARK_INK_MAX_LUMINANCE = 90;

// measured on real lecture videos: light-background slides span roughly
// 0.40-0.75 light ratio even when dense with figures, while dark and
// colorful footage stays well below 0.3 - the gate ratios sit in that gap
export const SENSITIVITY_PROFILES: Readonly<Record<DarkviewSensitivity, SensitivityProfile>> = {
    low: { blockFraction: 0.65, gateRatio: 0.45 },
    balanced: { blockFraction: 0.5, gateRatio: 0.35 },
    high: { blockFraction: 0.4, gateRatio: 0.28 },
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

// photo content is what neither color nor brightness can protect: achromatic
// photographs. Their signature is continuous NEUTRAL tone - a high share of
// low-chroma mid-range luminance with real local variance - while slide
// backgrounds are perfectly flat, text is bimodal (measured: slide background
// variance p90 = 0, text mid-tone share <= 0.22, photo content ~0.70), and
// colored content of any kind is already chroma-protected pixel by pixel, so
// it must not seed protection (colored text would keep its background bright)
const MIDTONE_MIN_LUMINANCE = 64;
const MIDTONE_MAX_LUMINANCE = 192;
const MIDTONE_MAX_CHROMA = 41;
const PHOTO_MIN_MIDTONE_SHARE = 0.35;
const PHOTO_MIN_VARIANCE = 50;
// photographs occupy rectangles of many blocks; isolated textured blocks
// (logos, chart glyphs) stay invertible
const PHOTO_MIN_COMPONENT_BLOCKS = 4;

// photos are rectangles: protect the bounding box of every large-enough
// connected component of photo-like blocks, so a photograph's flat backdrop
// and dark regions are covered along with its textured content
const protectPhotoRegions = (
    seeds: Uint8Array,
    blocksWide: number,
    blocksHigh: number,
): Uint8Array => {
    const protectedBlocks = new Uint8Array(blocksWide * blocksHigh);
    const visited = new Uint8Array(blocksWide * blocksHigh);
    const stack: number[] = [];

    for (let start = 0; start < seeds.length; start += 1) {
        if (seeds[start] !== 1 || visited[start] === 1) {
            continue;
        }

        const component: number[] = [];
        stack.push(start);
        visited[start] = 1;
        while (stack.length > 0) {
            const block = stack.pop() as number;
            component.push(block);
            const blockX = block % blocksWide;
            const blockY = (block - blockX) / blocksWide;
            const neighbors = [
                blockX > 0 ? block - 1 : -1,
                blockX < blocksWide - 1 ? block + 1 : -1,
                blockY > 0 ? block - blocksWide : -1,
                blockY < blocksHigh - 1 ? block + blocksWide : -1,
            ];
            for (const neighbor of neighbors) {
                if (neighbor >= 0 && seeds[neighbor] === 1 && visited[neighbor] !== 1) {
                    visited[neighbor] = 1;
                    stack.push(neighbor);
                }
            }
        }

        if (component.length < PHOTO_MIN_COMPONENT_BLOCKS) {
            continue;
        }

        let minX = blocksWide;
        let maxX = -1;
        let minY = blocksHigh;
        let maxY = -1;
        for (const block of component) {
            const blockX = block % blocksWide;
            const blockY = (block - blockX) / blocksWide;
            minX = Math.min(minX, blockX);
            maxX = Math.max(maxX, blockX);
            minY = Math.min(minY, blockY);
            maxY = Math.max(maxY, blockY);
        }
        for (let blockY = minY; blockY <= maxY; blockY += 1) {
            for (let blockX = minX; blockX <= maxX; blockX += 1) {
                protectedBlocks[blockY * blocksWide + blockX] = 1;
            }
        }
    }

    return protectedBlocks;
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
    const backgroundShare = new Float32Array(blocksWide * blocksHigh);
    const photoSeeds = new Uint8Array(blocksWide * blocksHigh);
    const qualified = new Uint8Array(blocksWide * blocksHigh);
    let invertedBlocks = 0;

    for (let blockY = 0; blockY < blocksHigh; blockY += 1) {
        const startY = blockY * blockSize;
        const endY = Math.min(startY + blockSize, height);

        for (let blockX = 0; blockX < blocksWide; blockX += 1) {
            const startX = blockX * blockSize;
            const endX = Math.min(startX + blockSize, width);

            let backgroundPixels = 0;
            let luminanceSum = 0;
            let luminanceSquareSum = 0;
            let midtonePixels = 0;
            for (let y = startY; y < endY; y += 1) {
                let index = (y * width + startX) * 4;
                for (let x = startX; x < endX; x += 1, index += 4) {
                    const red = data[index] ?? 0;
                    const green = data[index + 1] ?? 0;
                    const blue = data[index + 2] ?? 0;
                    if (isBackground(red, green, blue)) {
                        backgroundPixels += 1;
                    }
                    const luminance = (2126 * red + 7152 * green + 722 * blue) / 10000;
                    luminanceSum += luminance;
                    luminanceSquareSum += luminance * luminance;
                    if (
                        luminance >= MIDTONE_MIN_LUMINANCE &&
                        luminance < MIDTONE_MAX_LUMINANCE &&
                        Math.max(red, green, blue) - Math.min(red, green, blue) <=
                            MIDTONE_MAX_CHROMA
                    ) {
                        midtonePixels += 1;
                    }
                }
            }

            const blockPixels = (endX - startX) * (endY - startY);
            const block = blockY * blocksWide + blockX;
            backgroundShare[block] = backgroundPixels / blockPixels;
            const mean = luminanceSum / blockPixels;
            const variance = luminanceSquareSum / blockPixels - mean * mean;
            if (
                midtonePixels / blockPixels >= PHOTO_MIN_MIDTONE_SHARE &&
                variance >= PHOTO_MIN_VARIANCE
            ) {
                photoSeeds[block] = 1;
            }
        }
    }

    const protectedBlocks = protectPhotoRegions(photoSeeds, blocksWide, blocksHigh);
    for (let block = 0; block < qualified.length; block += 1) {
        if (protectedBlocks[block] !== 1 && (backgroundShare[block] ?? 0) >= blockFraction) {
            qualified[block] = 1;
            invertedBlocks += 1;
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
            const block = blockY * blocksWide + blockX;
            if (protectedBlocks[block] === 1) {
                continue;
            }
            const isQualified = qualified[block] === 1;
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
                        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
                        if (chroma > NEUTRAL_INK_MAX_CHROMA) {
                            continue;
                        }
                        if (isBorder) {
                            const luminance = (2126 * red + 7152 * green + 722 * blue) / 10000;
                            if (luminance > DARK_INK_MAX_LUMINANCE) {
                                continue;
                            }
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
