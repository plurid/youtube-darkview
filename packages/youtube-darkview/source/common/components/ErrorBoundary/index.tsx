// #region imports
// #region libraries
import React, { type ErrorInfo } from 'react';
// #endregion libraries

// #region external
import { reportError } from '~common/utilities';
// #endregion external
// #region imports

// #region module
export interface ErrorBoundaryProperties {
    fallback: React.ReactNode;
    children: React.ReactNode;
}

export interface ErrorBoundaryState {
    hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProperties, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProperties) {
        super(props);
        this.state = {
            hasError: false,
        };
    }

    static getDerivedStateFromError(_error: unknown): ErrorBoundaryState {
        return {
            hasError: true,
        };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        reportError('The popup view crashed', { error, info });
    }

    override render(): React.ReactNode {
        if (this.state.hasError) {
            return this.props.fallback;
        }

        return this.props.children;
    }
}
// #endregion module

// #region exports
export default ErrorBoundary;
// #endregion exports
