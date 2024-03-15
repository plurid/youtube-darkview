import {
    CANVAS_ID,
} from '../data/constants/contentscript';



export const styleCanvas = (
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
) => {
    const videoDimensions = video.getBoundingClientRect();
    const videoTop = window.getComputedStyle(video).top;

    canvas.id = CANVAS_ID;
    canvas.style.position = 'absolute';
    canvas.style.top = videoTop || '0';
    canvas.style.left = '0';
    canvas.style.right = '0';
    canvas.style.margin = '0 auto';
    canvas.style.width = videoDimensions.width + 'px';
    canvas.style.height = videoDimensions.height + 'px';
    canvas.style.zIndex = '58';
    canvas.style.pointerEvents = 'none';
}
