// #region module
const CANVAS_ID = 'yt-darkview-canvas';

let toggled = false;
let interval: NodeJS.Timeout | undefined;

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
        canvas.style.width = '100%';
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

                // const imageData = ctx.getImageData(0, 0, 600, 500);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i]; // Red
                    data[i + 1] = 255 - data[i + 1]; // Green
                    data[i + 2] = 255 - data[i + 2]; // Blue
                }
                ctx.putImageData(imageData, 0, 0);

                // ctx.clearRect(0, canvas.height - 60, canvas.width, 50);
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
