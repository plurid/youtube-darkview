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
};


export const OPTIONS_KEY = 'youtubeDarkviewOptions';
// #endregion module
