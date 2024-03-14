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
        const canvas = document.createElement('canvas');
        canvas.id = CANVAS_ID;
        canvas.style.position = 'absolute';
        canvas.style.top = '50px';
        canvas.style.left = '0';
        canvas.style.right = '0';
        canvas.style.width = '100%';
        canvas.style.height = '500px';
        canvas.style.pointerEvents = 'none';

        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');

        setTimeout(() => {
            const videoComputedStyle = window.getComputedStyle(video);

            const videoContentWidth = parseInt(videoComputedStyle.width, 10);
            const videoContentHeight = parseInt(videoComputedStyle.height, 10);

            // var aspectRatio = video.videoWidth / video.videoHeight;
            const aspectRatio = videoContentWidth / videoContentHeight;
            const canvasWidth = videoContentWidth;
            const canvasHeight = canvasWidth / aspectRatio;
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;

            // 30 frames per second (1000 ms / 30 frames ≈ 33 ms per frame)
            const FPS_TIMEOUT = 33;

            video.addEventListener('play', function() {
                interval = setInterval(function() {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                    var imageData = ctx.getImageData(0, 0, 800, 500);
                    var data = imageData.data;
                    for (var i = 0; i < data.length; i += 4) {
                        data[i] = 255 - data[i]; // Red
                        data[i + 1] = 255 - data[i + 1]; // Green
                        data[i + 2] = 255 - data[i + 2]; // Blue
                    }
                    ctx.putImageData(imageData, 0, 0);

                    ctx.clearRect(0, canvas.height - 60, canvas.width, 50);
                }, FPS_TIMEOUT);
            }, false);
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
