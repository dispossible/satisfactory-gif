import { Image, createCanvas } from "canvas";
import { SEA_COLOR, VOID_COLOR, ZOOM_PADDING, MAP_PADDING } from "../vars.js";
import fsSync from "fs";
import { PNG } from "pngjs";
/** @typedef {import("../vars.js").PxColor} PxColor */

/**
 * @param {string} imagePath
 * @returns {Promise<Image>}
 */
export async function loadImage(imagePath) {
    return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            resolve(image);
        };
        image.onerror = reject;
        image.src = imagePath;
    });
}

/**
 * @param {PxColor} colorA
 * @param {PxColor} colorB
 */
function matchesPxColor(colorA, colorB) {
    return colorA.r === colorB.r && colorA.g === colorB.g && colorA.b === colorB.b;
}

/**
 * @param {string} path
 */
export function getMapBounds(path) {
    const imageData = fsSync.readFileSync(path);
    const png = PNG.sync.read(imageData);
    const imgData = png.data;

    let width = png.width;
    let height = png.height;
    let left = 0;
    let top = 0;
    let right = width;
    let bottom = height;
    console.log("Initial image size: ", { width, height });

    /**
     * @param {number} x
     * @param {number} y
     * @returns {PxColor}
     */
    function getPxAt(x, y) {
        const i = (width * y + x) << 2;
        const [r, g, b] = [imgData[i], imgData[i + 1], imgData[i + 2]];
        return { r, g, b };
    }

    for (let posX = 0, posY = 0; posX < width && posY < height; posX += 1, posY += 1) {
        const px = getPxAt(posX, posY);
        if (matchesPxColor(px, SEA_COLOR)) {
            left = posX;
            top = posY;
            break;
        }
    }

    let leftPx = getPxAt(left - 1, top);
    while (matchesPxColor(leftPx, SEA_COLOR)) {
        left -= 1;
        leftPx = getPxAt(left - 1, top);
    }

    let upPx = getPxAt(left, top - 1);
    while (matchesPxColor(upPx, SEA_COLOR)) {
        top -= 1;
        upPx = getPxAt(left, top - 1);
    }

    for (let posX = width - 1, posY = height - 1; posX >= 0 && posY >= 0; posX -= 1, posY -= 1) {
        const px = getPxAt(posX, posY);
        if (matchesPxColor(px, VOID_COLOR)) {
            right = posX;
            bottom = posY;
            break;
        }
    }

    let rightPx = getPxAt(right + 1, bottom);
    while (matchesPxColor(rightPx, VOID_COLOR)) {
        right += 1;
        rightPx = getPxAt(right + 1, bottom);
    }

    let downPx = getPxAt(right, bottom + 1);
    while (matchesPxColor(downPx, VOID_COLOR)) {
        bottom += 1;
        downPx = getPxAt(right, bottom + 1);
    }

    const size = Math.max(right - left, bottom - top);

    return {
        x: left - MAP_PADDING,
        y: top - MAP_PADDING,
        width: size + MAP_PADDING * 2,
        height: size + MAP_PADDING * 2,
    };
}

/**
 * @param {string} path
 */
export function validateScreenshot(path) {
    const imageData = fsSync.readFileSync(path);
    const png = PNG.sync.read(imageData);

    for (let x = 0, y = 0; x < png.width && y < png.height; x++, y++) {
        const idx = (png.width * y + x) << 2;

        const px = {
            r: png.data[idx],
            g: png.data[idx + 1],
            b: png.data[idx + 2],
        };

        if (matchesPxColor(px, SEA_COLOR)) {
            return true;
        }
    }
    return false;
}

/**
 * @param {Image} transparent
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
export async function getZoomBounds(transparent, x, y, width, height) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(transparent, 0 - x, 0 - y);

    const imageData = ctx.getImageData(0, 0, width, height);

    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    let isBlank = true;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (width * y + x) << 2;
            const alpha = imageData.data[idx + 3];
            if (alpha > 0) {
                isBlank = false;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (isBlank) {
        return {
            x: 0,
            y: 0,
            size: Math.min(width, height),
        };
    }

    const areaWidth = maxX - minX;
    const areaHeight = maxY - minY;
    let areaSize = Math.max(areaWidth, areaHeight);

    let areaX = minX - ZOOM_PADDING;
    let areaY = minY - ZOOM_PADDING;
    areaSize += ZOOM_PADDING * 2;

    if (areaSize > Math.min(width, height)) {
        areaSize = Math.min(width, height);
    }

    const areaRight = areaX + areaSize;
    const areaBottom = areaY + areaSize;

    if (areaRight > width) {
        areaX -= areaRight - width;
    }
    if (areaBottom > height) {
        areaY -= areaBottom - height;
    }
    if (areaX < 0) {
        areaX = 0;
    }
    if (areaY < 0) {
        areaY = 0;
    }

    return {
        x: areaX,
        y: areaY,
        size: areaSize,
    };
}
