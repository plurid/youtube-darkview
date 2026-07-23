import { reportError } from '~common/utilities';
import { type DarkviewResponse, isDarkviewRequest, loadSettings, settingsFromChanges } from '~data';

import { DarkviewEngine } from './engine';
import { isDarkviewShortcut, isEditableTarget } from './shortcut';
import { fetchGateTimeline } from './storyboard';

const main = async (): Promise<void> => {
    const engine = new DarkviewEngine({
        timelineFactory: (videoId) => fetchGateTimeline(videoId),
    });
    engine.updateSettings(
        await loadSettings().catch((error: unknown) => {
            reportError('Could not load stored settings; using defaults', error);
            return undefined;
        }),
    );

    document.addEventListener('keydown', (event) => {
        if (isDarkviewShortcut(event) && !isEditableTarget(event.target)) {
            event.preventDefault();
            engine.toggle();
        }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        const settings = settingsFromChanges(changes, areaName);
        if (settings) {
            engine.updateSettings(settings);
        }
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!isDarkviewRequest(message)) {
            return false;
        }

        const status = message.type === 'TOGGLE' ? engine.toggle() : engine.getStatus();
        const response: DarkviewResponse = { ok: true, status };
        sendResponse(response);
        return false;
    });

    window.addEventListener('pagehide', () => engine.stop(), { once: true });
};

void main().catch((error: unknown) => {
    reportError('Could not initialize the content script', error);
});
