import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '~data/settings';

jest.mock('@plurid/plurid-ui-components-react', () => ({
    InputSwitch: ({
        atChange,
        checked,
        name,
    }: {
        atChange: () => void;
        checked: boolean;
        name: string;
    }) => (
        <button type="button" aria-pressed={checked} onClick={atChange}>
            {name}
        </button>
    ),
    LinkButton: ({ atClick, text }: { atClick: () => void; text: string }) => (
        <button type="button" onClick={atClick}>
            {text}
        </button>
    ),
    Slider: ({
        atChange,
        max,
        min,
        name,
        step,
        value,
    }: {
        atChange: (value: number) => void;
        max: number;
        min: number;
        name: string;
        step: number;
        value: number;
    }) => (
        <input
            aria-label={name}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => atChange(Number(event.currentTarget.value))}
        />
    ),
}));

jest.mock('@plurid/plurid-themes', () => ({
    dewiki: { backgroundColorTertiary: '#222' },
}));

import Popup from '~popup/components/Popup';

const setChrome = ({
    getResult = { [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS },
    messageResult = { ok: true, status: { active: false, effect: 'off' } },
    rejectGet = false,
    rejectMessage = false,
    rejectSet = false,
}: {
    getResult?: Record<string, unknown>;
    messageResult?: unknown;
    rejectGet?: boolean;
    rejectMessage?: boolean;
    rejectSet?: boolean;
} = {}) => {
    const get = jest.fn<(keys?: string | string[] | null) => Promise<Record<string, unknown>>>(
        async () => {
            if (rejectGet) {
                throw new Error('Storage unavailable');
            }
            return getResult;
        },
    );
    const set = jest.fn<(items: Record<string, unknown>) => Promise<void>>(async () => {
        if (rejectSet) {
            throw new Error('Storage unavailable');
        }
    });
    const query = jest.fn<(queryInfo: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>>(
        async () => [{ id: 17 } as chrome.tabs.Tab],
    );
    const sendMessage = rejectMessage
        ? jest.fn<(tabId: number, message: unknown) => Promise<unknown>>(async () => {
              throw new Error('No receiver');
          })
        : jest.fn<(tabId: number, message: unknown) => Promise<unknown>>(async () => messageResult);
    globalThis.chrome = {
        storage: { local: { get, set } },
        tabs: { query, sendMessage },
    } as unknown as typeof chrome;
    return { get, query, sendMessage, set };
};

describe('Popup', () => {
    it('loads global preferences while displaying page-local state', async () => {
        const api = setChrome({
            getResult: {
                [SETTINGS_STORAGE_KEY]: {
                    ...DEFAULT_SETTINGS,
                    intensity: 0.8,
                    sensitivity: 'high',
                },
            },
        });
        render(<Popup />);

        expect(await screen.findByText(/ready on this page/)).toBeInTheDocument();
        expect(screen.getByText('80%')).toBeInTheDocument();
        expect(screen.getByText('high')).toBeInTheDocument();
        expect(api.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
        expect(api.sendMessage).toHaveBeenCalledWith(17, { type: 'GET_STATE' });
    });

    it('saves mode, sensitivity, intensity, and reset preferences', async () => {
        const user = userEvent.setup();
        const api = setChrome();
        render(<Popup />);
        await screen.findByText(/ready on this page/);

        await user.click(screen.getByRole('button', { name: 'invert' }));
        await waitFor(() =>
            expect(api.set).toHaveBeenLastCalledWith({
                [SETTINGS_STORAGE_KEY]: { ...DEFAULT_SETTINGS, mode: 'always' },
            }),
        );
        expect(screen.queryByRole('slider', { name: 'sensitivity' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'content-aware' }));
        fireEvent.change(screen.getByRole('slider', { name: 'sensitivity' }), {
            target: { value: '2' },
        });
        fireEvent.change(screen.getByRole('slider', { name: 'intensity' }), {
            target: { value: '0.7' },
        });
        await waitFor(() => expect(screen.getByText('70%')).toBeInTheDocument());

        await user.click(screen.getByRole('button', { name: 'reset' }));
        await waitFor(() => expect(screen.getByText('90%')).toBeInTheDocument());
        expect(screen.getByText('balanced')).toBeInTheDocument();
    });

    it('toggles only the current tab and reports the resulting effect', async () => {
        const user = userEvent.setup();
        const api = setChrome({
            messageResult: { ok: true, status: { active: true, effect: 'monitoring' } },
        });
        render(<Popup />);
        await screen.findByText(/waiting for a video/);

        await user.click(screen.getByRole('button', { name: /deactivate \[⌥ \+ D\]/i }));
        await waitFor(() =>
            expect(api.sendMessage).toHaveBeenLastCalledWith(17, { type: 'TOGGLE' }),
        );
    });

    it('keeps preferences usable when the current page has no content script', async () => {
        setChrome({ rejectMessage: true });
        render(<Popup />);

        expect(await screen.findByText(/open a YouTube video/)).toBeInTheDocument();
    });

    it.each([
        ['applied', 'content-aware darkview active'],
        ['fallback', 'content-aware rendering unavailable'],
        ['off', 'darkview is active on this page'],
    ] as const)('describes an active %s effect', async (effect, text) => {
        setChrome({ messageResult: { ok: true, status: { active: true, effect } } });
        render(<Popup />);

        expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    });

    it('treats malformed tab responses as unavailable', async () => {
        setChrome({ messageResult: { ok: true, status: { active: true, effect: 'invalid' } } });
        render(<Popup />);

        expect(await screen.findByText(/open a YouTube video/)).toBeInTheDocument();
    });

    it('reports storage load failures', async () => {
        setChrome({ rejectGet: true });
        render(<Popup />);

        expect(await screen.findByRole('alert')).toHaveTextContent('could not load settings');
    });

    it('rolls back an optimistic preference when saving fails', async () => {
        const user = userEvent.setup();
        setChrome({ rejectSet: true });
        render(<Popup />);
        await screen.findByText(/ready on this page/);

        await user.click(screen.getByRole('button', { name: 'invert' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('could not save that setting');
        expect(screen.getByRole('button', { name: 'content-aware' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });

    it('shows a useful error when toggling fails', async () => {
        const user = userEvent.setup();
        setChrome({ rejectMessage: true });
        render(<Popup />);
        await screen.findByText(/open a YouTube video/);

        await user.click(screen.getByRole('button', { name: /activate \[⌥ \+ D\]/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent('open a YouTube video');
    });
});
