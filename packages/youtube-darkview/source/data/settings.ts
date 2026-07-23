export const SETTINGS_STORAGE_KEY = 'youtubeDarkviewOptions';

export type DarkviewMode = 'adaptive' | 'always';
export type DarkviewSensitivity = 'low' | 'balanced' | 'high';

export interface DarkviewSettings {
    version: 2;
    mode: DarkviewMode;
    sensitivity: DarkviewSensitivity;
    intensity: number;
    preanalysis: boolean;
}

export const DEFAULT_SETTINGS: Readonly<DarkviewSettings> = Object.freeze({
    version: 2,
    mode: 'adaptive',
    sensitivity: 'balanced',
    intensity: 0.9,
    preanalysis: true,
});

type StorageReader = Pick<chrome.storage.StorageArea, 'get'>;
type StorageWriter = Pick<chrome.storage.StorageArea, 'set'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const isMode = (value: unknown): value is DarkviewMode =>
    value === 'adaptive' || value === 'always';

const isSensitivity = (value: unknown): value is DarkviewSensitivity =>
    value === 'low' || value === 'balanced' || value === 'high';

const clampIntensity = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_SETTINGS.intensity;
    }

    return Math.round(Math.min(1, Math.max(0.65, value)) * 100) / 100;
};

const migrateThreshold = (value: unknown): DarkviewSensitivity => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_SETTINGS.sensitivity;
    }
    if (value <= 0.5) {
        return 'high';
    }
    if (value >= 0.75) {
        return 'low';
    }
    return 'balanced';
};

export const normalizeSettings = (value: unknown): DarkviewSettings => {
    if (!isRecord(value)) {
        return { ...DEFAULT_SETTINGS };
    }

    if (value.version === 2) {
        return {
            version: 2,
            mode: isMode(value.mode) ? value.mode : DEFAULT_SETTINGS.mode,
            sensitivity: isSensitivity(value.sensitivity)
                ? value.sensitivity
                : DEFAULT_SETTINGS.sensitivity,
            intensity: clampIntensity(value.intensity),
            preanalysis:
                typeof value.preanalysis === 'boolean'
                    ? value.preanalysis
                    : DEFAULT_SETTINGS.preanalysis,
        };
    }

    if (value.type === 'invert' || value.type === 'content-aware') {
        return {
            version: 2,
            mode: value.type === 'content-aware' ? 'adaptive' : 'always',
            sensitivity: migrateThreshold(value.threshold),
            intensity: DEFAULT_SETTINGS.intensity,
            preanalysis: DEFAULT_SETTINGS.preanalysis,
        };
    }

    return { ...DEFAULT_SETTINGS };
};

export const loadSettings = async (
    storage: StorageReader = chrome.storage.local,
): Promise<DarkviewSettings> => {
    const result = await storage.get(SETTINGS_STORAGE_KEY);
    return normalizeSettings(result[SETTINGS_STORAGE_KEY]);
};

export const saveSettings = async (
    value: unknown,
    storage: StorageWriter = chrome.storage.local,
): Promise<DarkviewSettings> => {
    const settings = normalizeSettings(value);
    await storage.set({ [SETTINGS_STORAGE_KEY]: settings });
    return settings;
};

export const settingsFromChanges = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
): DarkviewSettings | undefined => {
    if (areaName !== 'local') {
        return undefined;
    }

    const change = changes[SETTINGS_STORAGE_KEY];
    return change ? normalizeSettings(change.newValue) : undefined;
};
