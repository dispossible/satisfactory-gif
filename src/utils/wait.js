/**
 * @param {number} seconds
 */
export async function wait(seconds) {
    return new Promise((res) => {
        setTimeout(res, seconds * 1000);
    });
}

/**
 * @param {() => Promise<any>} func
 * @param {number} attempts
 * @param {number} delay
 */
export async function retry(func, attempts = 5, delay = 2) {
    let attempt = 1;
    let error = null;
    while (attempt < attempts) {
        try {
            const res = await func();
            return res;
        } catch (err) {
            error = err;
            attempt++;
            await wait(delay);
        }
    }
    throw error;
}
