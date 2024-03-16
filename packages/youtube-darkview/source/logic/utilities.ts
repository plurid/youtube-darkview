export function debounce(
    callback: any,
    delay = 300,
) {
    let timer: any;

    return (...args: any) => {
        return new Promise((resolve, reject) => {
            clearTimeout(timer);

            timer = setTimeout(() => {
                try {
                    let output = callback(...args);
                    resolve(output);
                } catch (err) {
                    reject(err);
                }
            }, delay);
        });
    }
}


export const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    return tab;
}
