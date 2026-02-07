import puppeteer, { Browser } from "puppeteer";
import fs from "fs/promises";
import fsSync from "fs";
import GIFEncoder from "gif-encoder-2";
import { createCanvas, Image } from "canvas";
import path from "path";
import { OUTPUT_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH, FRAME_PATH } from "./vars.js";
import { ensureDirectories, copySaveFiles } from "./setup.js";
import { getScreenshotName } from "./utils/files.js";
import { screenshotFile } from "./utils/browser.js";
import { getSaveFilesToScreenshot, getScreenshotFiles, getSessionName } from "./utils/files.js";

const SCALE = 4096;
const CONCURRENCY = 2;

(async () => {
    await ensureDirectories();
    let saves = await getSaveFilesToScreenshot();

    if (!saves.length) {
        console.log("No saves to process, attempting import");
        await copySaveFiles();
        saves = await getSaveFilesToScreenshot();
    }

    const savesToProcess = await getFilteredFileList(saves);
    const processingTasks = savesToProcess.map((saveFile) => screenshotFile(saveFile));
    await runWithConcurrency(processingTasks, CONCURRENCY);

    const sessionName = await getSessionName(saves[0]);

    await createGif(saves, `animation-${sessionName}.gif`);
})();

/**
 * Run promises with concurrency limit
 * @template T
 * @param {((browser: Browser) => Promise<T>)[]} promises
 * @param {number} concurrentAmount
 * @returns {Promise<T[]>}
 */
async function runWithConcurrency(promises, concurrentAmount) {
    const jobQueue = [...promises];
    /** @type {T[]} */
    const results = [];

    return new Promise((resolveQueue, rejectQueue) => {
        const workers = new Array(concurrentAmount).fill("").map(async () => {
            const browser = await puppeteer.launch({
                headless: false,
                defaultViewport: {
                    width: SCALE,
                    height: SCALE,
                    deviceScaleFactor: 1,
                },
            });

            while (jobQueue.length > 0) {
                const job = jobQueue.shift();
                if (job) {
                    try {
                        const result = await job(browser);
                        results.push(result);
                    } catch (err) {
                        console.error("Job failed, retrying");
                        jobQueue.push(job);
                    }
                }
            }

            await browser.close();
        });

        Promise.all(workers)
            .then(() => resolveQueue(results))
            .catch((err) => {
                rejectQueue(err);
            });
    });
}

/**
 * @param {string[]} saves
 */
async function getFilteredFileList(saves) {
    const outputs = await getScreenshotFiles();
    const savesToProcess = saves.filter((save) => !outputs.includes(getScreenshotName(save)));
    console.log(`Found ${saves.length} saves, ${outputs.length} outputs, ${savesToProcess.length} to process`);
    return savesToProcess.sort((a, b) => getScreenshotName(a).localeCompare(getScreenshotName(b)));
}

/**
 * @param {string[]} saveFiles
 * @param {string} filename
 * @returns {Promise<void>}
 */
async function createGif(saveFiles, filename = "animation.gif") {
    const filesInFolder = await fs.readdir(SCREENSHOTS_PATH);
    const expectedFiles = saveFiles.map((save) => getScreenshotName(save));
    const images = filesInFolder
        .filter((fileName) => fileName.endsWith(".png") && expectedFiles.includes(fileName))
        .sort();

    if (saveFiles.length < images.length) {
        throw new Error(`Missing ${images.length - saveFiles.length} screenshot files`);
    }

    const firstImage = await loadImage(path.join(SCREENSHOTS_PATH, images[0]));
    const { x, y, width, height } = getMapBounds(firstImage);

    console.log("Map bounds: ", { x, y, width, height });

    const stream = mapImagesToGif(SCREENSHOTS_PATH, images, filename, width, height);
    for await (const { image, ctx, index, length, encoder, canvas } of stream) {
        ctx.drawImage(image, 0 - x, 0 - y);

        // Save the frame
        const imageStream = canvas.createPNGStream();
        const frameFile = fsSync.createWriteStream(path.join(FRAME_PATH, images[index]));
        imageStream.pipe(frameFile);
        await new Promise((resolve) => {
            frameFile.on("finish", resolve);
        });

        if (index === length - 1) {
            encoder.setDelay(5000);
        }
    }
}

/**
 * @param {Image} image
 */
function getMapBounds(image) {
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    let left = 0;
    let top = 0;
    let right = width;
    let bottom = height;
    console.log("Initial image size: ", { width, height });

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);

    /**
     * @param {number} x
     * @param {number} y
     * @returns
     */
    function getPxAt(x, y) {
        const i = (y * width + x) * 4;
        const [r, g, b] = [imgData.data[i], imgData.data[i + 1], imgData.data[i + 2]];
        return { r, g, b };
    }

    /**
     * @typedef {{r: number; g: number; b: number;}} PxColor
     */
    /**
     * @param {PxColor} colorA
     * @param {PxColor} colorB
     */
    function matchesPxColor(colorA, colorB) {
        return colorA.r === colorB.r && colorA.g === colorB.g && colorA.b === colorB.b;
    }

    const seaColor = { r: 75, g: 111, b: 120 };
    const voidColor = { r: 5, g: 3, b: 4 };

    const imgData = ctx.getImageData(0, 0, width, height);
    for (let posX = 0, posY = 0; posX < width && posY < height; posX += 1, posY += 1) {
        const px = getPxAt(posX, posY);
        if (matchesPxColor(px, seaColor)) {
            left = posX;
            top = posY;
            break;
        }
    }

    let leftPx = getPxAt(left - 1, top);
    while (matchesPxColor(leftPx, seaColor)) {
        left -= 1;
        leftPx = getPxAt(left - 1, top);
    }

    let upPx = getPxAt(left, top - 1);
    while (matchesPxColor(upPx, seaColor)) {
        top -= 1;
        upPx = getPxAt(left, top - 1);
    }

    for (let posX = width - 1, posY = height - 1; posX >= 0 && posY >= 0; posX -= 1, posY -= 1) {
        const px = getPxAt(posX, posY);
        if (matchesPxColor(px, voidColor)) {
            right = posX;
            bottom = posY;
            break;
        }
    }

    let rightPx = getPxAt(right + 1, bottom);
    while (matchesPxColor(rightPx, voidColor)) {
        right += 1;
        rightPx = getPxAt(right + 1, bottom);
    }

    let downPx = getPxAt(right, bottom + 1);
    while (matchesPxColor(downPx, voidColor)) {
        bottom += 1;
        downPx = getPxAt(right, bottom + 1);
    }

    return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    };
}

/**
 *
 * @param {string} imagePath
 * @param {string[]} imageNames
 * @param {string} outputFilename
 * @param {number} width
 * @param {number} height
 * @returns
 */
async function* mapImagesToGif(imagePath, imageNames, outputFilename, width, height) {
    console.log("Creating GIF");

    const stream = fsSync.createWriteStream(path.join(OUTPUT_PATH, outputFilename));
    const result = new Promise((r) => stream.on("close", r));

    const encoder = new GIFEncoder(width, height);

    encoder.createReadStream().pipe(stream);
    encoder.start();
    encoder.setDelay(250); // frame length in ms

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const imageProcessor = processImages(imagePath, imageNames);

    let index = 0;
    for await (const image of imageProcessor) {
        console.log(`Encoding frame: ${index + 1} / ${imageNames.length}`);
        // We expect the caller to draw the image to the ctx
        yield { image, ctx, index, length: imageNames.length, encoder, canvas };
        encoder.addFrame(ctx);
        index++;
    }

    encoder.finish();
    console.log("GIF created");

    await result;
}

/**
 * @param {string} imagePath
 * @param {string[]} imageNames
 */
async function* processImages(imagePath, imageNames) {
    for (const imgName of imageNames) {
        const image = await loadImage(path.join(imagePath, imgName));
        yield image;
    }
}

/**
 * @param {string} imagePath
 * @returns {Promise<Image>}
 */
async function loadImage(imagePath) {
    return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            resolve(image);
        };
        image.onerror = reject;
        image.src = imagePath;
    });
}
