import { describe, expect, it, jest } from '@jest/globals';

import {
    DEFAULT_SETTINGS,
    loadSettings,
    normalizeSettings,
    SETTINGS_STORAGE_KEY,
    saveSettings,
    settingsFromChanges,
} from '~data/settings';

describe('settings', () => {
    it('uses safe defaults for missing or unrecognized values', () => {
        expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings({ version: 99, mode: 'always' })).toEqual(DEFAULT_SETTINGS);
    });

    it('normalizes current settings and clamps intensity', () => {
        expect(
            normalizeSettings({
                version: 2,
                mode: 'always',
                sensitivity: 'high',
                intensity: 5,
            }),
        ).toEqual({
            version: 2,
            mode: 'always',
            sensitivity: 'high',
            intensity: 1,
            preanalysis: true,
        });

        expect(
            normalizeSettings({
                version: 2,
                mode: 'invalid',
                sensitivity: 'invalid',
                intensity: Number.NaN,
            }),
        ).toEqual(DEFAULT_SETTINGS);

        expect(normalizeSettings({ ...DEFAULT_SETTINGS, intensity: 0.651 })).toMatchObject({
            intensity: 0.65,
        });
    });

    it.each([
        [{ type: 'content-aware', threshold: 0.4 }, 'adaptive', 'high'],
        [{ type: 'content-aware', threshold: 0.6 }, 'adaptive', 'balanced'],
        [{ type: 'invert', threshold: 0.8 }, 'always', 'low'],
        [{ type: 'invert', threshold: 'bad' }, 'always', 'balanced'],
    ] as const)('migrates legacy settings %#', (legacy, mode, sensitivity) => {
        expect(normalizeSettings(legacy)).toEqual({
            version: 2,
            mode,
            sensitivity,
            intensity: DEFAULT_SETTINGS.intensity,
            preanalysis: true,
        });
    });

    it('respects an explicit pre-analysis choice and defaults anything else', () => {
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, preanalysis: false })).toMatchObject({
            preanalysis: false,
        });
        expect(normalizeSettings({ ...DEFAULT_SETTINGS, preanalysis: 'nope' })).toMatchObject({
            preanalysis: true,
        });
    });

    it('loads and saves through an injected storage interface', async () => {
        const get = jest.fn(async () => ({
            [SETTINGS_STORAGE_KEY]: { ...DEFAULT_SETTINGS, mode: 'always' },
        }));
        const set = jest.fn<(items: Record<string, unknown>) => Promise<void>>(
            async () => undefined,
        );

        await expect(
            loadSettings({ get } as unknown as Pick<chrome.storage.StorageArea, 'get'>),
        ).resolves.toMatchObject({ mode: 'always' });
        await expect(
            saveSettings({ ...DEFAULT_SETTINGS, intensity: 0.7 }, { set } as unknown as Pick<
                chrome.storage.StorageArea,
                'set'
            >),
        ).resolves.toMatchObject({ intensity: 0.7 });
        expect(set).toHaveBeenCalledWith({
            [SETTINGS_STORAGE_KEY]: { ...DEFAULT_SETTINGS, intensity: 0.7 },
        });
    });

    it('extracts only local settings changes', () => {
        const changes = {
            [SETTINGS_STORAGE_KEY]: {
                newValue: { ...DEFAULT_SETTINGS, sensitivity: 'high' },
            },
        } as Record<string, chrome.storage.StorageChange>;

        expect(settingsFromChanges(changes, 'sync')).toBeUndefined();
        expect(settingsFromChanges({}, 'local')).toBeUndefined();
        expect(settingsFromChanges(changes, 'local')).toMatchObject({ sensitivity: 'high' });
    });
});
