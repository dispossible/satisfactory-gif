import puppeteer, { Browser } from "puppeteer";
import fsSync from "fs";
import GIFEncoder from "gif-encoder-2";
import { createCanvas } from "canvas";
import path from "path";
import { OUTPUT_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH, FRAME_PATH, RESOLUTION, CONCURRENCY } from "./vars.js";
import { ensureDirectories, copySaveFiles } from "./setup.js";
import { screenshotFile } from "./utils/browser.js";
import { getSaveFiles } from "./utils/files.js";
import { getMapBounds, getZoomBounds, loadImage } from "./utils/image.js";

/** @typedef {import("./utils/files.js").SaveFile} SaveFile */
/** @typedef {import("./vars.js").PxColor} PxColor */

(async () => {
    await ensureDirectories();
    let saves = await getSaveFiles();

    if (!saves.length) {
        console.log("No saves to process, attempting import");
        await copySaveFiles();
        saves = await getSaveFiles();
    }

    const savesToProcess = await getFilesForScreenshot(saves);
    const processingTasks = savesToProcess.map((saveFile) => screenshotFile(saveFile));
    await runWithConcurrency(processingTasks, CONCURRENCY);

    const sessionName = saves[0].session;

    await createGif(saves, `animation-${sessionName}.gif`);
})();

/**
 * Run promises with concurrency limit
 * @template T
 * @param {((browser: Browser) => Promise<T>)[]} jobs
 * @param {number} concurrentAmount
 * @returns {Promise<T[]>}
 */
async function runWithConcurrency(jobs, concurrentAmount) {
    const jobQueue = jobs.map((fn) => {
        return {
            jobFn: fn,
            retries: 0,
        };
    });
    /** @type {T[]} */
    const results = [];

    return new Promise((resolveQueue, rejectQueue) => {
        const workers = new Array(concurrentAmount).fill("").map(async () => {
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
                    console.log(`Starting job, ${jobQueue.length} remaining`);
                    try {
                        const result = await job.jobFn(browser);
                        results.push(result);
                    } catch (err) {
                        console.error(err);
                        if (job.retries < 3) {
                            console.error("Job failed, retrying");
                            job.retries += 1;
                            jobQueue.unshift(job);
                        } else {
                            console.error("Job failed, skipping");
                        }
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
 * @param {SaveFile[]} saves
 */
async function getFilesForScreenshot(saves) {
    return saves.filter((save) => {
        return !save.hasScreenshot || !save.hasTransparent;
    });
}

/**
 * @param {SaveFile[]} saveFiles
 * @param {string} gifName
 * @returns {Promise<void>}
 */
async function createGif(saveFiles, gifName = "animation.gif") {
    const { x, y, width, height } = getMapBounds(path.join(SCREENSHOTS_PATH, saveFiles[0].imageName));

    console.log("Map bounds: ", { x, y, width, height });

    const stream = mapImagesToGif(saveFiles, gifName, width, height);
    for await (const { screenshot, transparent, ctx, index, encoder, file } of stream) {
        const zoomBounds = await getZoomBounds(transparent, x, y, width, height);
        ctx.drawImage(screenshot, 0 - x, 0 - y);

        ctx.strokeStyle = "#0ff";
        ctx.strokeRect(zoomBounds.x, zoomBounds.y, zoomBounds.size, zoomBounds.size);

        if (index === saveFiles.length - 1) {
            encoder.setDelay(5000);
        }
        encoder.addFrame(ctx);
    }
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

    const stream = fsSync.createWriteStream(path.join(OUTPUT_PATH, outputFilename));
    const result = new Promise((r) => stream.on("close", r));

    const encoder = new GIFEncoder(width, height);

    encoder.createReadStream().pipe(stream);
    encoder.start();
    encoder.setDelay(250); // frame length in ms

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    for await (const [index, file] of files.entries()) {
        console.log(`Encoding frame: ${index + 1} / ${files.length}`);

        const screenshot = await loadImage(path.join(SCREENSHOTS_PATH, file.imageName));
        const transparent = await loadImage(path.join(TRANSPARENT_PATH, file.imageName));

        if (file.hasFrame) {
            const frame = await loadImage(path.join(FRAME_PATH, file.imageName));
            ctx.drawImage(frame, 0, 0);
            encoder.addFrame(ctx);
        } else {
            // We expect the caller to draw the image to the ctx and the encoder
            yield { screenshot, transparent, ctx, index, encoder, file };

            // Save the frame
            const imageStream = canvas.createPNGStream();
            const frameFile = fsSync.createWriteStream(path.join(FRAME_PATH, file.imageName));
            imageStream.pipe(frameFile);
            await new Promise((resolve) => {
                frameFile.on("finish", resolve);
            });
        }
    }

    encoder.finish();
    console.log("GIF created");

    await result;
}
