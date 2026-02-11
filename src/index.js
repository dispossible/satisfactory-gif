import puppeteer, { Browser } from "puppeteer";
import fsSync from "fs";
import GIFEncoder from "gif-encoder-2";
import { Canvas, createCanvas } from "canvas";
import path from "path";
import {
    OUTPUT_PATH,
    SCREENSHOTS_PATH,
    TRANSPARENT_PATH,
    RESOLUTION,
    CONCURRENCY,
    FPS,
    TRANSITION_FRAMES,
    FRAME_PATH,
} from "./vars.js";
import { ensureDirectories, copySaveFiles } from "./setup.js";
import { screenshotFileFn } from "./utils/browser.js";
import { clearFrames, getSaveFiles } from "./utils/files.js";
import { getMapBounds, getZoomBounds, loadImage, validateScreenshot } from "./utils/image.js";
import { lerp } from "./utils/math.js";
import { replaceLastLog } from "./utils/ask.js";
import { convertFramesToVideo } from "./utils/video.js";

/** @typedef {import("./utils/files.js").SaveFile} SaveFile */
/** @typedef {import("./vars.js").PxColor} PxColor */

(async () => {
    await ensureDirectories();
    let saves = await getSaveFiles();

    if (!saves.length) {
        console.log("No saves to process, running import script");
        await copySaveFiles();
        saves = await getSaveFiles();
    }

    const savesToProcess = await getFilesForScreenshot(saves);
    await runWithConcurrency(savesToProcess);

    const sessionName = saves[0].session;

    clearFrames();

    const gifName = `animation-${sessionName}.gif`;
    await createGif(saves, gifName);

    await convertFramesToVideo(gifName.replace(".gif", ".mp4"));
})();

/**
 * Run promises with concurrency limit
 * @param {SaveFile[]} saveFiles
 * @returns {Promise<void>}
 */
async function runWithConcurrency(saveFiles) {
    const jobQueue = saveFiles.map((saveFile) => {
        return {
            jobFn: screenshotFileFn(saveFile),
            retries: 0,
        };
    });

    let failedJobs = 0;

    const workers = new Array(CONCURRENCY).fill("").map(async () => {
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: {
                width: RESOLUTION,
                height: RESOLUTION,
                deviceScaleFactor: 1,
            },
        });

        while (jobQueue.length > 0) {
            const job = jobQueue.shift();
            if (job) {
                const idx = saveFiles.length - jobQueue.length;
                console.log(`Running screenshot job: ${idx} / ${saveFiles.length}`);
                try {
                    await job.jobFn(browser);
                } catch (err) {
                    console.error(err);
                    if (job.retries < 5) {
                        console.error("Job failed, retrying");
                        job.retries += 1;
                        jobQueue.unshift(job);
                    } else {
                        console.error("Job failed, skipping");
                        failedJobs++;
                    }
                }
            }
        }

        await browser.close();
    });

    await Promise.all(workers);

    if (failedJobs > 0) {
        throw new Error(`${failedJobs} screenshots failed to complete`);
    }
}

/**
 * @param {SaveFile[]} saves
 */
async function getFilesForScreenshot(saves) {
    console.log("");
    return saves.filter((save, i) => {
        replaceLastLog(`Checking screenshot: ${i + 1} / ${saves.length} - ${save.imageName}`);
        if (!save.hasScreenshot || !save.hasTransparent) {
            return true;
        }
        return !validateScreenshot(path.join(SCREENSHOTS_PATH, save.imageName));
    });
}

/**
 * @param {SaveFile[]} saveFiles
 * @param {string} gifName
 * @returns {Promise<void>}
 */
async function createGif(saveFiles, gifName = "animation.gif") {
    const firstScreenshotPath = path.join(SCREENSHOTS_PATH, saveFiles[0].imageName);
    const { x, y, size } = getMapBounds(firstScreenshotPath);

    let previousBounds = {
        x: 0,
        y: 0,
        size,
    };
    let prevScreenshot = await loadImage(firstScreenshotPath);

    const outputSize = size / 4;

    const stream = mapImagesToGif(saveFiles, gifName, outputSize, outputSize);
    for await (const { screenshot, transparent, ctx, index, encoder, canvas } of stream) {
        const zoomBounds = await getZoomBounds(transparent, x, y, size, size);

        const srcX = x + zoomBounds.x;
        const srcY = y + zoomBounds.y;

        if (index === 0) {
            console.log("");
            encoder.setDelay(2000);
            ctx.drawImage(screenshot, x, y, size, size, 0, 0, outputSize, outputSize);
            encoder.addFrame(ctx);
            await saveFrames(canvas, 2000);
        }

        // encoder.setDelay(1000 / FPS);
        const diff = getMotionDiff(previousBounds, zoomBounds);
        const transitionFrames = Math.round(TRANSITION_FRAMES * diff);
        for (let i = 0; i <= transitionFrames; i++) {
            const distance = i / transitionFrames;
            replaceLastLog(`Encoding frame: ${index + 1} / ${saveFiles.length} - ${Math.round(distance * 100)}%`);
            const transitionX = lerp(x + previousBounds.x, x + zoomBounds.x, distance);
            const transitionY = lerp(y + previousBounds.y, y + zoomBounds.y, distance);
            const transitionSize = lerp(previousBounds.size, zoomBounds.size, distance);
            ctx.drawImage(
                prevScreenshot,
                transitionX,
                transitionY,
                transitionSize,
                transitionSize,
                0,
                0,
                outputSize,
                outputSize,
            );
            ctx.globalAlpha = distance;
            ctx.drawImage(screenshot, transitionX, transitionY, transitionSize, transitionSize, 0, 0, outputSize, outputSize);
            ctx.globalAlpha = 1;
            //encoder.addFrame(ctx);
            await saveFrame(canvas);
        }

        ctx.drawImage(screenshot, srcX, srcY, zoomBounds.size, zoomBounds.size, 0, 0, outputSize, outputSize);
        await saveFrame(canvas);

        if (index === saveFiles.length - 1) {
            await saveFrames(canvas, 5000);
            encoder.setDelay(5000);
        } else {
            encoder.setDelay(250);
        }
        encoder.addFrame(ctx);
        previousBounds = zoomBounds;
        prevScreenshot = screenshot;
    }
}

const MOTION_FACTOR = 500;

/**
 * @typedef {{
 *     x: number;
 *     y: number;
 *     size: number;
 * }} Bounds
 */
/**
 * @param {Bounds} a
 * @param {Bounds} b
 */
function getMotionDiff(a, b) {
    const diffX = Math.abs(a.x - b.x);
    const diffY = Math.abs(a.y - b.y);
    const diffSize = Math.abs(a.size - b.size);
    const maxDiff = Math.max(diffX, diffY, diffSize);
    return 1 + maxDiff / MOTION_FACTOR;
}

/**
 * @param {SaveFile[]} files
 * @param {string} outputFilename
 * @param {number} width
 * @param {number} height
 * @returns
 */
async function* mapImagesToGif(files, outputFilename, width, height) {
    console.log("Creating GIF");

    const gifPath = path.join(OUTPUT_PATH, outputFilename);
    const stream = fsSync.createWriteStream(gifPath);
    const result = new Promise((r) => stream.on("close", r));

    const encoder = new GIFEncoder(width, height);

    encoder.createReadStream().pipe(stream);
    encoder.start();

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    for await (const [index, file] of files.entries()) {
        const screenshot = await loadImage(path.join(SCREENSHOTS_PATH, file.imageName));
        const transparent = await loadImage(path.join(TRANSPARENT_PATH, file.imageName));

        // We expect the caller to draw the image to the ctx and the encoder
        yield { screenshot, transparent, ctx, index, encoder, file, canvas };
    }

    encoder.finish();
    await result;

    console.log(`GIF created: ${gifPath}`);
}

let frameCount = 0;

/**
 * @param {Canvas} canvas
 */
async function saveFrame(canvas) {
    const frameName = frameCount.toString().padStart(6, "0") + ".png";
    const imageStream = canvas.createPNGStream();
    const frameFile = fsSync.createWriteStream(path.join(FRAME_PATH, frameName));
    imageStream.pipe(frameFile);
    await new Promise((resolve) => {
        frameFile.on("finish", resolve);
    });
    frameCount++;
}

/**
 * @param {Canvas} canvas
 * @param {number} ms
 */
async function saveFrames(canvas, ms) {
    const frames = (ms / 1000) * FPS;
    for (let i = 0; i < frames; i++) {
        await saveFrame(canvas);
    }
}
