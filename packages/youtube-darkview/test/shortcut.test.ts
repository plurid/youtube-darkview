import { describe, expect, it } from '@jest/globals';

import { isDarkviewShortcut, isEditableTarget, type ShortcutEvent } from '~contentscript/shortcut';

const chord = (overrides: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
    altKey: true,
    code: 'KeyD',
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
});

describe('page shortcut', () => {
    it('matches only a non-repeating, unmodified Alt/Option + D keydown', () => {
        expect(isDarkviewShortcut(chord())).toBe(true);
        expect(isDarkviewShortcut(chord({ altKey: false }))).toBe(false);
        expect(isDarkviewShortcut(chord({ code: 'KeyE' }))).toBe(false);
        expect(isDarkviewShortcut(chord({ repeat: true }))).toBe(false);
        expect(isDarkviewShortcut(chord({ ctrlKey: true }))).toBe(false);
        expect(isDarkviewShortcut(chord({ metaKey: true }))).toBe(false);
    });

    it('recognizes editable targets so typing never toggles the filter', () => {
        document.body.innerHTML = `
            <input id="query" />
            <textarea id="notes"></textarea>
            <div id="comment" contenteditable="true"><p id="line">text</p></div>
            <button id="button" type="button">ok</button>
        `;

        expect(isEditableTarget(document.getElementById('query'))).toBe(true);
        expect(isEditableTarget(document.getElementById('notes'))).toBe(true);
        expect(isEditableTarget(document.getElementById('line'))).toBe(true);
        expect(isEditableTarget(document.getElementById('button'))).toBe(false);
        expect(isEditableTarget(document)).toBe(false);
        expect(isEditableTarget(null)).toBe(false);
    });
});
