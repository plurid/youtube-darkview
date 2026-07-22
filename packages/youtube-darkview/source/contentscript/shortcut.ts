export interface ShortcutEvent {
    altKey: boolean;
    code: string;
    ctrlKey: boolean;
    metaKey: boolean;
    repeat: boolean;
}

// AltGr chords report ctrlKey together with altKey, so layouts that type
// characters through AltGr+D must not trigger the shortcut
export const isDarkviewShortcut = (event: ShortcutEvent): boolean =>
    event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyD' && !event.repeat;

const EDITABLE_TARGET_SELECTOR =
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export const isEditableTarget = (target: unknown): boolean =>
    target instanceof Element && target.closest(EDITABLE_TARGET_SELECTOR) !== null;
