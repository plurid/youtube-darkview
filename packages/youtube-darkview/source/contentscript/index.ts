import { reportError } from '~common/utilities';
import { type DarkviewResponse, isDarkviewRequest, loadSettings, settingsFromChanges } from '~data';

import { DarkviewEngine } from './engine';
import { cachedTimelineFactory } from './mapcache';
import { isDarkviewShortcut, isEditableTarget } from './shortcut';

const main = async (): Promise<void> => {
    const engine = new DarkviewEngine({
        timelineFactory: (videoId) => cachedTimelineFactory(videoId),
    });

    // listeners come before the settings await so the shortcut and the popup
    // are never dead during a slow storage read
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

    // not `once`: a bfcache-restored page can be activated again and must
    // still clean up on its next pagehide (stop is idempotent)
    window.addEventListener('pagehide', () => engine.stop());

    engine.updateSettings(
        await loadSettings().catch((error: unknown) => {
            reportError('Could not load stored settings; using defaults', error);
            return undefined;
        }),
    );
};

void main().catch((error: unknown) => {
    reportError('Could not initialize the content script', error);
});
