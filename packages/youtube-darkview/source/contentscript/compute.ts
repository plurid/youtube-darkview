import {
    blockSize,
    threshold,
} from '../data/constants/contentscript';



export const getCanvasData = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const whiteThreshold = 255 * threshold;

    return {
        ctx,
        imageData,
        data,
        whiteThreshold,
    };
}

export const computeDarkviewRaw = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    const {
        ctx,
        imageData,
        data,
        whiteThreshold,
    } = getCanvasData(canvas, video);

    // const start = Date.now();

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blocksWide = Math.ceil(canvas.width / blockSize);
    const blocksHigh = Math.ceil(canvas.height / blockSize);
    const whiteBlocks = [];
    const staticBlocks = [];

    for (let y = 0; y < blocksHigh; y++) {
        for (let x = 0; x < blocksWide; x++) {
            let whitePixelCount = 0;
            const startX = x * blockSize;
            const endX = Math.min(startX + blockSize, canvas.width);
            const startY = y * blockSize;
            const endY = Math.min(startY + blockSize, canvas.height);

            for (let blockY = startY; blockY < endY; blockY++) {
                for (let blockX = startX; blockX < endX; blockX++) {
                    const dataIndex = (blockY * canvas.width + blockX) * 4;
                    const r = data[dataIndex];
                    const g = data[dataIndex + 1];
                    const b = data[dataIndex + 2];
                    // Check if pixel is white
                    if (r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold) {
                        whitePixelCount++;
                    }
                }
            }

            const whitePixelPercentage = whitePixelCount / (blockSize * blockSize);

            if (whitePixelPercentage >= threshold) {
                whiteBlocks.push({ x, y, whitePixelPercentage });
            } else {
                staticBlocks.push({ x, y, whitePixelPercentage });
            }
        }
    }

    for (const block of whiteBlocks) {
        const startX = block.x * blockSize;
        const endX = Math.min(startX + blockSize, canvas.width);
        const startY = block.y * blockSize;
        const endY = Math.min(startY + blockSize, canvas.height);

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const dataIndex = (y * canvas.width + x) * 4;
                data[dataIndex] = 255 - data[dataIndex]; // Invert red channel
                data[dataIndex + 1] = 255 - data[dataIndex + 1]; // Invert green channel
                data[dataIndex + 2] = 255 - data[dataIndex + 2]; // Invert blue channel
                // Alpha channel remains unchanged
            }
        }
    }

    // console.log({
    //     whiteBlocks, staticBlocks,
    // });
    // const endCompute = Date.now();
    // console.log('compute', endCompute - start);

    ctx.putImageData(imageData, 0, 0);

    // const endPaint = Date.now();
    // console.log('paint', endPaint - endCompute);
    // console.log('---');
}

export const computeDarkviewQuadTree = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    const {
        ctx,
        imageData,
        data,
        whiteThreshold,
    } = getCanvasData(canvas, video);

    // const quadtree = new QuadTreeNode(0, 0, canvas.width);
    // quadtree.update(imageData, whiteThreshold);
    // quadtree.invertColors(imageData, 3);
    // ctx.putImageData(imageData, 0, 0);
}

export const computeDarkview = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    computeDarkviewRaw(canvas, video);
    // computeDarkviewQuadTree(canvas, video);
}
