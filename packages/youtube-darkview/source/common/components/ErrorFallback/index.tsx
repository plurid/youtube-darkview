// #region imports
// #region libraries
import type React from 'react';
// #endregion libraries
// #region imports

// #region module
export interface ErrorFallbackProperties {
    errorCode?: string;
}

const ErrorFallback: React.FC<ErrorFallbackProperties> = (properties) => {
    // #region properties
    const { errorCode } = properties;
    // #endregion properties

    // #region render
    return (
        <div
            style={{
                width: '100%',
                display: 'grid',
                placeContent: 'center',
                textAlign: 'center',
                gap: '2rem',
            }}
        >
            <div>YouTube Darkview could not open {errorCode ? `(${errorCode})` : ''}</div>

            <div>Close and reopen the popup. If the problem continues, reload the extension.</div>
        </div>
    );
    // #endregion render
};
// #endregion module

// #region exports
export default ErrorFallback;
// #endregion exports
