// #region imports
    // #region external
    import {
        Options,
    } from '~data/interfaces';
    // #endregion external
// #endregion imports



// #region module
export const IN_PRODUCTION = process.env.NODE_ENV === 'production';


export const defaultOptions: Options = {
    activated: false,
    type: 'content-aware',
    threshold: 0.6,
    level: 0.6,
    blockSize: 20,
};


export const OPTIONS_KEY = 'youtubeDarkviewOptions';
// #endregion module
