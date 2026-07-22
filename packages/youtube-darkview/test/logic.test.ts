import { describe, expect, it, jest } from '@jest/globals';

import { getActiveTab } from '~logic/utilities';

describe('active tab lookup', () => {
    it('returns a usable active tab', async () => {
        globalThis.chrome = {
            tabs: { query: jest.fn(async () => [{ id: 7 }]) },
        } as unknown as typeof chrome;

        await expect(getActiveTab()).resolves.toMatchObject({ id: 7 });
    });

    it('rejects a missing tab or tab id', async () => {
        globalThis.chrome = {
            tabs: { query: jest.fn(async () => [{}]) },
        } as unknown as typeof chrome;

        await expect(getActiveTab()).rejects.toThrow('No active browser tab');
    });
});
