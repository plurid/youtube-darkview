// #region imports
import {
    VIDEO_CONTAINER,
    CANVAS_ID,
    FPS_TIMEOUT,
} from '../data/constants/contentscript';

import {
    debounce,
} from '../logic/utilities';

import {
    styleCanvas,
} from './canvas';

import {
    computeDarkview,
} from './compute';
// #endregion imports



// #region module
let toggled = false;
let interval: NodeJS.Timeout | undefined;


const drawDarkview = () => {
    const video = document.getElementsByTagName('video')[0];
    if (!video) {
        return;
    }
    const videoDimensions = video.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    styleCanvas(canvas, video);

    const container = document.getElementsByClassName(VIDEO_CONTAINER)[0];
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

        interval = setInterval(() => {
            computeDarkview(canvas, video);
        }, FPS_TIMEOUT);
    }, 200);
}

const cleanupDarkview = () => {
    if (interval) {
        clearInterval(interval);
    }

    const existingCanvas = document.getElementById(CANVAS_ID);
    if (existingCanvas) {
        existingCanvas.remove();
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

        const debouncedResize = debounce(() => {
            try {
                if (toggled) {
                    drawDarkview();
                }
            } catch (error) {
                return;
            }
        });

        window.addEventListener('resize', () => {
            cleanupDarkview();
            debouncedResize();
        });
    } catch (error) {
        return;
    }
}

main().catch(() => {});
// #endregion module
