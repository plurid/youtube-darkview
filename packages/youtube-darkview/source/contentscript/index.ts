// #region module
const toggleDarkview = async () => {
}



const main = async () => {
    try {
        document.addEventListener('keydown', (event) => {
            try {
                if (event.altKey && event.code === 'KeyD') {
                    toggleDarkview();
                    return;
                }
            } catch (error) {
                return;
            }
        });
    } catch (error) {
        return;
    }
}

main().catch(() => {});
// #endregion module
