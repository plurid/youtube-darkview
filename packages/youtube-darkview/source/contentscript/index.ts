// #region module
const VIDEO_DIV_ID = 'html5-video-container';
const CANVAS_ID = 'yt-darkview-canvas';

let toggled = false;
let interval: NodeJS.Timeout | undefined;


const blockSize = 20;
const threshold = 0.6;
const limit = 255;



const getComputes = (
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

const computeDarkviewRaw = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    const {
        ctx,
        imageData,
        data,
        whiteThreshold,
    } = getComputes(canvas, video);

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

const computeDarkviewQuadTree = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    const {
        ctx,
        imageData,
        data,
        whiteThreshold,
    } = getComputes(canvas, video);

    // const quadtree = new QuadTreeNode(0, 0, canvas.width);
    // quadtree.update(imageData, whiteThreshold);
    // quadtree.invertColors(imageData, 3);
    // ctx.putImageData(imageData, 0, 0);
}

const computeDarkview = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    computeDarkviewRaw(canvas, video);
    // computeDarkviewQuadTree(canvas, video);
}

const drawDarkview = () => {
    const video = document.getElementsByTagName('video')[0];
    if (!video) {
        return;
    }

    const videoDimensions = video.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    canvas.id = CANVAS_ID;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.right = '0';
    canvas.style.margin = '0 auto';
    canvas.style.width = videoDimensions.width + 'px';
    canvas.style.height = videoDimensions.height + 'px';
    canvas.style.zIndex = '58';
    canvas.style.pointerEvents = 'none';

    const container = document.getElementsByClassName(VIDEO_DIV_ID)[0];
    if (!container) {
        return;
    }
    container.appendChild(canvas);

    setTimeout(() => {
        const videoContentWidth = videoDimensions.width;
        const videoContentHeight = videoDimensions.height;

        const aspectRatio = videoContentWidth / videoContentHeight;
        const canvasWidth = videoContentWidth;
        const canvasHeight = canvasWidth / aspectRatio;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // 30 frames per second (1000 ms / 30 frames ≈ 33 ms per frame)
        const FPS_TIMEOUT = 33;

        interval = setInterval(() => {
            computeDarkview(canvas, video);
        }, FPS_TIMEOUT);
    }, 200);
}

const cleanupDarkview = () => {
    if (interval) {
        clearInterval(interval);
    }

    const previousCanvas = document.getElementById(CANVAS_ID);
    if (previousCanvas) {
        previousCanvas.remove();
    }
}

const toggleDarkview = async () => {
    cleanupDarkview();

    if (!toggled) {
        drawDarkview();
    }

    toggled = !toggled;
}



const main = async () => {
    try {
        document.addEventListener('keydown', (event) => {
            try {
                if (event.altKey && event.code === 'KeyD') {
                    toggleDarkview();
                    return;
                }
            } catch (error) {
                return;
            }
        });

        window.addEventListener('resize', () => {
            try {
                if (toggled) {
                    cleanupDarkview();
                    toggleDarkview();
                }
            } catch (error) {
                return;
            }
        });
    } catch (error) {
        return;
    }
}

main().catch(() => {});
// #endregion module
