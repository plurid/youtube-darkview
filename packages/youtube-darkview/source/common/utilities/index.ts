export const reportError = (context: string, error: unknown): void => {
    if (process.env.NODE_ENV !== 'production') {
        console.error(`youtube-darkview :: ${context}`, error);
    }
};
