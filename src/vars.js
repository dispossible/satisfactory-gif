import path from "node:path";

export const MAP_URL = "https://satisfactory-calculator.com/en/interactive-map";

export const SAVES_PATH = "./saves";
export const OUTPUT_PATH = "./output";
export const SCREENSHOTS_PATH = path.join(OUTPUT_PATH, "screenshots");
export const TRANSPARENT_PATH = path.join(OUTPUT_PATH, "transparent");
export const FRAME_PATH = path.join(OUTPUT_PATH, "frames");

export const RESOLUTION = 1024 * 8;
export const ZOOM_LEVEL = 5.25;

export const ZOOM_PADDING = 256;
export const MAP_PADDING = 256;

export const CONCURRENCY = 1;

/**
 * @typedef {{r: number; g: number; b: number;}} PxColor
 */

/** @type {PxColor} */
export const SEA_COLOR = { r: 75, g: 111, b: 120 };
/** @type {PxColor} */
export const VOID_COLOR = { r: 5, g: 3, b: 4 };

export const TRANSITION_FRAMES = 8;
export const TRANSITION_FPS = 30;
