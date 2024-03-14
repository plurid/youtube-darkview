// #region module
const CANVAS_ID = 'yt-darkview-canvas';

let toggled = false;
let interval: NodeJS.Timeout | undefined;


const blockSize = 20;
const threshold = 0.6;
const limit = 255;


const toggleDarkview = async () => {
    const canvas = document.getElementById(CANVAS_ID);
    if (canvas) {
        canvas.remove();
    }

    const video = document.getElementsByTagName('video')[0];
    if (!video) {
        return;
    }

    if (interval) {
        clearInterval(interval);
    }

    if (!toggled) {
        const videoDimensions = video.getBoundingClientRect();

        const canvas = document.createElement('canvas');
        canvas.id = CANVAS_ID;
        canvas.style.position = 'absolute';
        canvas.style.top = '56px';
        canvas.style.left = '0';
        canvas.style.right = '0';
        canvas.style.margin = '0 auto';
        canvas.style.width = videoDimensions.width + 'px';
        canvas.style.height = videoDimensions.height + 'px';
        canvas.style.zIndex = '58';
        canvas.style.pointerEvents = 'none';

        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d', {
            willReadFrequently: true,
        });

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

            interval = setInterval(function() {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                const blocksWide = Math.ceil(canvas.width / blockSize);
                const blocksHigh = Math.ceil(canvas.height / blockSize);
                const whiteThreshold = 255 * threshold;
                const whiteBlocks = [];

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
                        }
                    }
                }

                for (const block of whiteBlocks) {
                    const startX = block.x * blockSize;
                    const endX = Math.min(startX + blockSize, canvas.width);
                    const startY = block.y * blockSize;
                    const endY = Math.min(startY + blockSize, canvas.height);

                    for (let blockY = startY; blockY < endY; blockY++) {
                        for (let blockX = startX; blockX < endX; blockX++) {
                            const dataIndex = (blockY * canvas.width + blockX) * 4;
                            // Invert colors
                            data[dataIndex] = 255 - data[dataIndex]; // Red
                            data[dataIndex + 1] = 255 - data[dataIndex + 1]; // Green
                            data[dataIndex + 2] = 255 - data[dataIndex + 2]; // Blue
                        }
                    }
                }

                ctx.putImageData(imageData, 0, 0);
            }, FPS_TIMEOUT);
        }, 200);
    }

    toggled = !toggled;
}



const main = async () => {
    try {
        console.log('darkview');
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
    } catch (error) {
        return;
    }
}

main().catch(() => {});
// #endregion module
