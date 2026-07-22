import { describe, expect, it } from '@jest/globals';

import { isDarkviewRequest, isDarkviewResponse } from '~data/messages';

describe('message validation', () => {
    it('accepts only supported requests', () => {
        expect(isDarkviewRequest({ type: 'GET_STATE' })).toBe(true);
        expect(isDarkviewRequest({ type: 'TOGGLE' })).toBe(true);
        expect(isDarkviewRequest({ type: 'DELETE' })).toBe(false);
        expect(isDarkviewRequest({})).toBe(false);
        expect(isDarkviewRequest(null)).toBe(false);
    });

    it('accepts only complete status responses', () => {
        expect(isDarkviewResponse({ ok: true, status: { active: true, effect: 'applied' } })).toBe(
            true,
        );
        expect(isDarkviewResponse({ ok: false })).toBe(false);
        expect(isDarkviewResponse({ ok: true, status: { active: 'yes', effect: 'off' } })).toBe(
            false,
        );
        expect(isDarkviewResponse({ ok: true, status: { active: false, effect: 'unknown' } })).toBe(
            false,
        );
        expect(isDarkviewResponse(undefined)).toBe(false);
    });
});
