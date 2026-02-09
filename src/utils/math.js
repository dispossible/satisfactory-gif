/**
 * @param {number} start
 * @param {number} end
 * @param {number} t
 * @returns number
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}
