import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs/promises";
import fsSync from "fs";
import GIFEncoder from "gif-encoder-2";
import { createCanvas, Image } from "canvas";
import path from "path";
import setup from "./setup.js";

import { MAP_URL, SAVES_PATH, OUTPUT_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH, FRAME_PATH } from "./vars.js";

import {
    SAVE_INPUT_SELECTOR,
    MODAL_SELECTOR,
    COOKIE_DIALOG_SELECTOR,
    DATA_CONSENT_DIALOG_SELECTOR,
    MONETIZE_SELECTOR,
    LOADING_SELECTOR,
    DOWNLOAD_BUTTON_SELECTOR,
    ZOOM_OUT_SELECTOR,
    ZOOM_IN_SELECTOR,
    SHOW_PURE_NODES_SELECTOR,
    TOGGLE_PURE_NODES_SELECTOR,
    MAP_SELECTOR,
    MAP_BUTTON_SELECTORS,
    OPTIONS_BUTTON_SELECTOR,
    OPTIONS_MODAL_SELECTOR,
    STAT_OPTIONS_SELECTOR,
    CIRCUIT_TOGGLE_SELECTOR,
    OPTIONS_MODAL_CLOSE_SELECTOR,
} from "./selectors.js";

const SCALE = 4096;
const ZOOM_IN_STEPS = 5;
const CONCURRENCY = 3;

(async () => {
    await setup();

    const saves = await getFilteredFileList();

    const processingTasks = saves.map((saveFile) => processAndScreenshot(saveFile));
    await runWithConcurrency(processingTasks, CONCURRENCY);

    await createGif(SCREENSHOTS_PATH, "animation.gif");
})();

/**
 * @param {string} saveFile
 */
function processAndScreenshot(saveFile) {
    /**
     * @param {Browser} browser
     */
    return async (browser) => {
        try {
            const page = await openPage(browser);

            await loadMap(page, saveFile);
            const reloadRequired = await setMapGlobalSettings(page);
            if (reloadRequired) {
                await loadMap(page, saveFile);
            }

            await configureMapView(page);
            await takeScreenshot(page, saveFile);
            await page.close();
        } catch (err) {
            console.error(`Failed: ${saveFile}`, err);
            throw err;
        }
    };
}

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
                    const result = await job(browser);
                    results.push(result);
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

async function getFileList() {
    const filesInFolder = await fs.readdir(SAVES_PATH);
    return filesInFolder.filter(
        (fileName) =>
            fileName.endsWith(".sav") &&
            !fileName.toLowerCase().includes("_autosave_") &&
            !fileName.toLowerCase().includes("_continue.sav"),
    );
}

async function getOutputFileList() {
    const filesInFolder1 = (await fs.readdir(SCREENSHOTS_PATH)).filter((fileName) => fileName.endsWith(".png"));
    const filesInFolder2 = (await fs.readdir(TRANSPARENT_PATH)).filter((fileName) => fileName.endsWith(".png"));
    return filesInFolder1.filter((fileName) => filesInFolder2.includes(fileName));
}

async function getFilteredFileList() {
    const saves = await getFileList();
    const outputs = await getOutputFileList();
    const savesToProcess = saves.filter((save) => !outputs.includes(formatScreenshotName(save)));
    console.log(`Found ${saves.length} saves, ${outputs.length} outputs, ${savesToProcess.length} to process`);
    return savesToProcess.sort((a, b) => formatScreenshotName(a).localeCompare(formatScreenshotName(b)));
}

/**
 * @param {Browser} browser
 */
async function openPage(browser) {
    const page = await browser.newPage();
    await page.goto(MAP_URL, { waitUntil: "domcontentloaded" });
    await wait(5);

    const modal = await page.$(MODAL_SELECTOR);
    if (modal) {
        await page.$eval(MODAL_SELECTOR, (modal) => {
            const closeBtn = modal.querySelector("button.close");
            if (closeBtn instanceof HTMLElement) {
                closeBtn.click();
            }
        });
        await page.waitForSelector(MODAL_SELECTOR, { visible: false, timeout: 0 });
    }

    const cookies = await page.$(COOKIE_DIALOG_SELECTOR);
    if (cookies) {
        await page.$eval(COOKIE_DIALOG_SELECTOR, (dialog) => {
            const closeBtn = dialog.querySelector("a.cc-dismiss");
            if (closeBtn instanceof HTMLElement) {
                closeBtn.click();
            }
        });
        await page.waitForSelector(COOKIE_DIALOG_SELECTOR, { visible: false, timeout: 0 });
    }

    const dataConsent = await page.$(DATA_CONSENT_DIALOG_SELECTOR);
    if (dataConsent) {
        await page.$eval(DATA_CONSENT_DIALOG_SELECTOR, (dialog) => {
            const closeBtn = dialog.querySelector("button.fc-cta-consent");
            if (closeBtn instanceof HTMLElement) {
                closeBtn.click();
            }
        });
        await page.waitForSelector(DATA_CONSENT_DIALOG_SELECTOR, { hidden: true, timeout: 0 });
    }

    const monetize = await page.$(MONETIZE_SELECTOR);
    if (monetize) {
        await page.$eval(MONETIZE_SELECTOR, (monetize) => {
            monetize.remove();
        });
        await page.waitForSelector(MONETIZE_SELECTOR, { hidden: true, timeout: 0 });
    }

    console.log("Page ready");
    return page;
}

/**
 * @param {Page} page
 * @param {string} fileName
 * @returns {Promise<Page>}
 */
async function loadMap(page, fileName) {
    console.log(`Opening file '${fileName}'`);

    await page.waitForSelector(SAVE_INPUT_SELECTOR);
    const input = await page.$(SAVE_INPUT_SELECTOR);

    // @ts-ignore
    await input.uploadFile(`${SAVES_PATH}/${fileName}`);

    await page.waitForSelector(LOADING_SELECTOR, { visible: false, timeout: 0 });
    await page.waitForSelector(DOWNLOAD_BUTTON_SELECTOR, { timeout: 0 });

    await page.evaluate(async (LOADING_SELECTOR) => {
        await new Promise((res) => setTimeout(res, 500));
        /** @type HTMLElement | null */
        let loader = document.querySelector(LOADING_SELECTOR);
        await /** @type {Promise<void>} */ (
            new Promise((resolve) => {
                const interval = setInterval(() => {
                    if (loader?.offsetWidth === 0 && loader?.offsetHeight === 0) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 500);
            })
        );
        await new Promise((res) => setTimeout(res, 500));
    }, LOADING_SELECTOR);

    console.log(`File loaded`);
    return page;
}

/**
 * @param {number} seconds
 */
async function wait(seconds) {
    return new Promise((res) => {
        setTimeout(res, seconds * 1000);
    });
}

/**
 * @param {Page} page
 */
async function configureMapView(page) {
    console.log("Configuring map view");
    await hideMapViewElements(page);
    await clickButton(page, SHOW_PURE_NODES_SELECTOR);
    await clickButton(page, TOGGLE_PURE_NODES_SELECTOR);
    await setZoomLevel(page);
}

/**
 * @param {Page} page
 * @returns {Promise<boolean>} requires reload
 */
async function setMapGlobalSettings(page) {
    console.log("Set map settings");
    await clickButton(page, OPTIONS_BUTTON_SELECTOR);
    await page.waitForSelector(OPTIONS_MODAL_SELECTOR);
    await clickButton(page, STAT_OPTIONS_SELECTOR);
    await page.waitForSelector(CIRCUIT_TOGGLE_SELECTOR);
    const reloadRequired = await page.$eval(CIRCUIT_TOGGLE_SELECTOR, (cBox) => {
        if (cBox instanceof HTMLInputElement && cBox.checked) {
            cBox.click();
            return true;
        }
        return false;
    });
    await wait(1);
    await clickButton(page, OPTIONS_MODAL_CLOSE_SELECTOR);
    await page.waitForSelector(OPTIONS_MODAL_SELECTOR, { hidden: true });
    return reloadRequired;
}

/**
 * @param {Page} page
 * @param {string} selector
 */
async function clickButton(page, selector) {
    await retry(async () => {
        await page.waitForSelector(selector);
        await page.$eval(selector, (btn) => {
            if (btn instanceof HTMLElement) btn.click();
        });
        await wait(0.5);
    });
}

/**
 * @param {() => Promise<any>} func
 * @param {number} attempts
 * @param {number} delay
 */
async function retry(func, attempts = 5, delay = 2) {
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

/**
 * @param {Page} page
 */
async function hideMapViewElements(page) {
    for (const buttonSelector of MAP_BUTTON_SELECTORS) {
        const button = await page.$(buttonSelector);
        if (button) {
            await page.$eval(buttonSelector, async (button) => {
                if (button instanceof HTMLElement) {
                    while (button.classList.contains("btn-outline-warning")) {
                        button.click();
                        await new Promise((res) => setTimeout(res, 500));
                    }
                }
            });
        }
    }
    await wait(5);
}

/**
 * @param {Page} page
 */
async function setZoomLevel(page) {
    console.log("Setting zoom level");
    await page.$eval(ZOOM_OUT_SELECTOR, async (zoomOut) => {
        if (zoomOut instanceof HTMLElement) {
            while (zoomOut.getAttribute("aria-disabled") !== "true") {
                zoomOut.click();
                await new Promise((res) => setTimeout(res, 1000));
            }
        }
    });
    await page.$eval(
        ZOOM_IN_SELECTOR,
        async (zoomIn, ZOOM_IN_STEPS) => {
            if (zoomIn instanceof HTMLElement) {
                for (let i = 0; i < ZOOM_IN_STEPS; i++) {
                    zoomIn.click();
                    await new Promise((res) => setTimeout(res, 1000));
                }
            }
        },
        ZOOM_IN_STEPS,
    );
}

/**
 * @param {Page} page
 * @param {string} fileName
 */
async function takeScreenshot(page, fileName) {
    await wait(10);

    const mapBox = await page.$eval(MAP_SELECTOR, (element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
    });

    const screenshotName = formatScreenshotName(fileName);

    console.log(`Saving map '${screenshotName}'`);

    await page.screenshot({
        path: `${SCREENSHOTS_PATH}/${screenshotName}`,
        clip: mapBox,
    });
    await saveTransparent(page, `${TRANSPARENT_PATH}/${screenshotName}`);
}

/**
 * @param {string} savFileName
 */
function formatScreenshotName(savFileName) {
    return savFileName.replace(".sav", "").replace(/(\d{2})(\d{2})(\d{2})(-\d{6})/, "$3-$2-$1$4") + ".png";
}

/**
 * @param {Page} page
 * @param {string} filePath
 */
async function saveTransparent(page, filePath) {
    const imgData = await page.$eval(".leaflet-overlay-pane canvas", (canvas) => {
        return canvas.toDataURL();
    });
    await fs.writeFile(filePath, imgData.split(",")[1], { encoding: "base64" });
}

/**
 * @param {string} imagePath
 * @param {string} filename
 * @returns {Promise<void>}
 */
async function createGif(imagePath = SCREENSHOTS_PATH, filename = "animation.gif") {
    const filesInFolder = await fs.readdir(imagePath);
    const images = filesInFolder.filter((fileName) => fileName.endsWith(".png")).sort();

    const firstImage = await loadImage(path.join(imagePath, images[0]));
    const { x, y, width, height } = getMapBounds(firstImage);

    console.log("Map bounds: ", { x, y, width, height });

    const stream = mapImagesToGif(imagePath, images, filename, width, height);
    for await (const { image, ctx, index, length, encoder } of stream) {
        ctx.drawImage(image, 0 - x, 0 - y);
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
        console.log(`Frame: ${index + 1} / ${imageNames.length}`);
        // We expect the caller to draw the image to the ctx
        yield { image, ctx, index, length: imageNames.length, encoder };
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
