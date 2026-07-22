export type DarkviewEffect = 'off' | 'monitoring' | 'applied' | 'fallback';

export interface DarkviewStatus {
    active: boolean;
    effect: DarkviewEffect;
}

export type DarkviewRequest = { type: 'GET_STATE' } | { type: 'TOGGLE' };

export interface DarkviewResponse {
    ok: true;
    status: DarkviewStatus;
}

export const isDarkviewRequest = (value: unknown): value is DarkviewRequest => {
    if (typeof value !== 'object' || value === null || !('type' in value)) {
        return false;
    }

    const { type } = value as { type: unknown };
    return type === 'GET_STATE' || type === 'TOGGLE';
};

export const isDarkviewResponse = (value: unknown): value is DarkviewResponse => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const response = value as Partial<DarkviewResponse>;
    return (
        response.ok === true &&
        typeof response.status?.active === 'boolean' &&
        ['off', 'monitoring', 'applied', 'fallback'].includes(response.status.effect)
    );
};
