import { dewiki } from '@plurid/plurid-themes';
import { InputSwitch, LinkButton, Slider } from '@plurid/plurid-ui-components-react';
import { useEffect, useState } from 'react';

import { reportError } from '~common/utilities';
import {
    type DarkviewMode,
    type DarkviewRequest,
    type DarkviewSensitivity,
    type DarkviewSettings,
    type DarkviewStatus,
    DEFAULT_SETTINGS,
    isDarkviewResponse,
    loadSettings,
    normalizeSettings,
    saveSettings,
} from '~data';
import { getActiveTab } from '~logic/utilities';

import {
    Introduction,
    inputStyle,
    ModeButton,
    ModeControl,
    SettingLabel,
    SettingRow,
    StatusText,
    StyledPopup,
} from './styled';

const SENSITIVITIES: readonly DarkviewSensitivity[] = ['low', 'balanced', 'high'];

const sendToActiveTab = async (request: DarkviewRequest): Promise<DarkviewStatus> => {
    const tab = await getActiveTab();
    const response: unknown = await chrome.tabs.sendMessage(tab.id as number, request);
    if (!isDarkviewResponse(response)) {
        throw new Error('The active tab did not return a Darkview status');
    }
    return response.status;
};

const getStatusText = (status: DarkviewStatus | undefined, mode: DarkviewMode): string => {
    if (!status) {
        return 'open a YouTube video to activate darkview';
    }
    if (!status.active) {
        return 'ready on this page';
    }

    switch (status.effect) {
        case 'applied':
            return mode === 'adaptive'
                ? 'content-aware darkview active: only light regions are inverted'
                : 'the whole video is inverted';
        case 'fallback':
            return 'content-aware rendering unavailable: inverting the whole video';
        case 'monitoring':
            return 'waiting for a video on this page';
        default:
            return 'darkview is active on this page';
    }
};

const Popup = () => {
    const [error, setError] = useState<string>();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<DarkviewSettings>({ ...DEFAULT_SETTINGS });
    const [status, setStatus] = useState<DarkviewStatus>();

    useEffect(() => {
        let cancelled = false;

        const load = async (): Promise<void> => {
            try {
                const storedSettings = await loadSettings();
                if (!cancelled) {
                    setSettings(storedSettings);
                }

                try {
                    const pageStatus = await sendToActiveTab({ type: 'GET_STATE' });
                    if (!cancelled) {
                        setStatus(pageStatus);
                    }
                } catch {
                    if (!cancelled) {
                        setStatus(undefined);
                    }
                }
            } catch (loadError: unknown) {
                reportError('Could not load popup settings', loadError);
                if (!cancelled) {
                    setError('could not load settings: close and reopen the popup');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const updateSettings = async (patch: Partial<DarkviewSettings>): Promise<void> => {
        const previous = settings;
        const next = normalizeSettings({ ...settings, ...patch, version: 2 });
        setSettings(next);
        setError(undefined);
        try {
            await saveSettings(next);
        } catch (saveError: unknown) {
            reportError('Could not save popup settings', saveError);
            setSettings(previous);
            setError('could not save that setting: try again');
        }
    };

    const toggle = async (): Promise<void> => {
        setError(undefined);
        try {
            setStatus(await sendToActiveTab({ type: 'TOGGLE' }));
        } catch (toggleError: unknown) {
            reportError('Could not toggle the active tab', toggleError);
            setStatus(undefined);
            setError('open a YouTube video before activating darkview');
        }
    };

    const setMode = (mode: DarkviewMode): void => {
        void updateSettings({ mode });
    };

    const setSensitivity = (value: number): void => {
        const sensitivity = SENSITIVITIES[Math.round(value)];
        if (sensitivity) {
            void updateSettings({ sensitivity });
        }
    };

    if (loading) {
        return <StyledPopup $active={false} aria-label="Loading YouTube Darkview" />;
    }

    return (
        <StyledPopup $active={status?.active ?? false}>
            <div>
                <h1>YouTube Darkview</h1>
                <Introduction>
                    press alt/option (⌥) + D on a YouTube page to activate darkview
                </Introduction>
            </div>

            <InputSwitch
                name={`${status?.active ? 'deactivate' : 'activate'} [⌥ + D]`}
                checked={status?.active ?? false}
                atChange={() => void toggle()}
                theme={dewiki}
                style={inputStyle}
            />

            <StatusText $error={Boolean(error)} role={error ? 'alert' : 'status'}>
                {error ?? getStatusText(status, settings.mode)}
            </StatusText>

            <ModeControl aria-label="Mode">
                <ModeButton
                    type="button"
                    $location="left"
                    $active={settings.mode === 'always'}
                    aria-pressed={settings.mode === 'always'}
                    onClick={() => setMode('always')}
                >
                    invert
                </ModeButton>
                <ModeButton
                    type="button"
                    $location="right"
                    $active={settings.mode === 'adaptive'}
                    aria-pressed={settings.mode === 'adaptive'}
                    onClick={() => setMode('adaptive')}
                >
                    content-aware
                </ModeButton>
            </ModeControl>

            {settings.mode === 'adaptive' && (
                <SettingRow>
                    <SettingLabel>
                        <span>sensitivity</span>
                        <span>{settings.sensitivity}</span>
                    </SettingLabel>
                    <Slider
                        name="sensitivity"
                        value={SENSITIVITIES.indexOf(settings.sensitivity)}
                        atChange={setSensitivity}
                        min={0}
                        max={2}
                        step={1}
                        width={150}
                        theme={dewiki}
                        level={2}
                    />
                </SettingRow>
            )}

            <SettingRow>
                <SettingLabel>
                    <span>intensity</span>
                    <span>{Math.round(settings.intensity * 100)}%</span>
                </SettingLabel>
                <Slider
                    name="intensity"
                    value={settings.intensity}
                    atChange={(intensity) => void updateSettings({ intensity })}
                    min={0.65}
                    max={1}
                    step={0.05}
                    width={150}
                    theme={dewiki}
                    level={2}
                />
            </SettingRow>

            <LinkButton
                text="reset"
                atClick={() => void updateSettings({ ...DEFAULT_SETTINGS })}
                theme={dewiki}
                style={{ marginTop: '16px' }}
                inline={true}
            />
        </StyledPopup>
    );
};

export default Popup;
