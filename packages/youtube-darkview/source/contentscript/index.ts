// #region imports
import {
    Options,
} from '~data/interfaces';

import {
    OPTIONS_KEY,
    defaultOptions,
} from '~data/constants';

import {
    VIDEO_CONTAINER,
    CANVAS_ID,
    FPS_TIMEOUT,
} from '~data/constants/contentscript';

import {
    debounce,
} from '~logic/utilities';

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
let options = defaultOptions;


const drawDarkview = (
    options: Options,
) => {
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
            computeDarkview(canvas, video, options);
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

const toggleDarkview = async (
    options: Options,
) => {
    cleanupDarkview();

    if (!toggled) {
        drawDarkview(options);
    }

    toggled = !toggled;
}



const main = async () => {
    try {
        const optionsRequest = await chrome.storage.local.get(OPTIONS_KEY);
        if (optionsRequest && optionsRequest[OPTIONS_KEY]) {
            options = optionsRequest[OPTIONS_KEY];
        }

        document.addEventListener('keydown', (event) => {
            try {
                if (event.altKey && event.code === 'KeyD') {
                    toggleDarkview(options);
                    return;
                }
            } catch (error) {
                return;
            }
        });

        const debouncedResize = debounce(() => {
            try {
                if (toggled) {
                    drawDarkview(options);
                }
            } catch (error) {
                return;
            }
        });

        window.addEventListener('resize', () => {
            cleanupDarkview();
            debouncedResize();
        });

        chrome.storage.onChanged.addListener((changes) => {
            try {
                const newOptions = changes[OPTIONS_KEY].newValue as Options;
                if (!newOptions) {
                    return;
                }

                options = newOptions;
                cleanupDarkview();
                debouncedResize();
            } catch (error) {
                return;
            }
        });

        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
            try {
                switch (message.type) {
                    case 'TOGGLE':
                        toggleDarkview(options);
                        break;
                    case 'GET_STATE':
                        sendResponse({
                            toggled,
                        });
                        break;
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
