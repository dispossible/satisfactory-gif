import { Browser, Page } from "puppeteer";
import { MAP_URL, SAVES_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH, ZOOM_LEVEL } from "../vars.js";
import {
    MODAL_SELECTOR,
    COOKIE_DIALOG_SELECTOR,
    DATA_CONSENT_DIALOG_SELECTOR,
    MONETIZE_SELECTOR,
    SAVE_INPUT_SELECTOR,
    LOADING_SELECTOR,
    DOWNLOAD_BUTTON_SELECTOR,
    OPTIONS_BUTTON_SELECTOR,
    OPTIONS_MODAL_SELECTOR,
    STAT_OPTIONS_SELECTOR,
    CIRCUIT_TOGGLE_SELECTOR,
    OPTIONS_MODAL_CLOSE_SELECTOR,
    SHOW_PURE_NODES_SELECTOR,
    TOGGLE_PURE_NODES_SELECTOR,
    MAP_BUTTON_SELECTORS,
    MAP_SELECTOR,
    CANVAS_SELECTOR,
    CANVAS_TILES_SELECTOR,
} from "../selectors.js";
import { retry, wait } from "./wait.js";
import fsSync from "fs";
import path from "node:path";
import { PNG } from "pngjs";
import { validateScreenshot } from "./image.js";

/** @typedef {import("./files.js").SaveFile} SaveFile */

/**
 * @param {SaveFile} saveFile
 */
export function screenshotFileFn(saveFile) {
    /**
     * @param {Browser} browser
     */
    return async (browser) => {
        /** @type {Page | undefined} */
        let page;
        try {
            page = await openPage(browser);

            await loadMap(page, saveFile);
            const reloadRequired = await setMapGlobalSettings(page);
            if (reloadRequired) {
                await loadMap(page, saveFile);
            }

            await configureMapView(page);
            await takeScreenshot(page, saveFile);
        } catch (err) {
            console.error(`Failed: ${saveFile.fileName}`);
            throw err;
        } finally {
            page?.close();
        }
    };
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
 * @param {SaveFile} saveFile
 * @returns {Promise<Page>}
 */
async function loadMap(page, saveFile) {
    console.log(`Opening file '${saveFile.fileName}'`);

    await page.waitForSelector(SAVE_INPUT_SELECTOR);
    const input = await page.$(SAVE_INPUT_SELECTOR);

    // @ts-ignore
    await input.uploadFile(path.join(SAVES_PATH, saveFile.fileName));

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
 * @param {Page} page
 */
async function configureMapView(page) {
    console.log("Configuring map view");
    await setZoomLevel(page);
    await hideMapViewElements(page);
    await clickButton(page, SHOW_PURE_NODES_SELECTOR);
    await clickButton(page, TOGGLE_PURE_NODES_SELECTOR);
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
}

/**
 * @param {Page} page
 */
async function setZoomLevel(page) {
    console.log("Setting zoom level");
    await page.$eval(
        "body",
        async (body, ZOOM_LEVEL) => {
            window.location.hash = `${ZOOM_LEVEL};0;0|gameLayer|`;
            await new Promise((res) => setTimeout(res, 1000));
        },
        ZOOM_LEVEL,
    );
}

/**
 * @param {Page} page
 * @param {SaveFile} file
 */
async function takeScreenshot(page, file) {
    console.log(`Saving screenshot: ${file.imageName}`);

    await ensureMapTilesLoaded(page);

    const mapBox = await page.$eval(MAP_SELECTOR, async (element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
    });

    const imagePath = path.join(SCREENSHOTS_PATH, file.imageName);

    await page.screenshot({
        path: imagePath,
        clip: mapBox,
    });

    const isValid = validateScreenshot(imagePath);
    if (!isValid) {
        fsSync.rmSync(imagePath);
        throw new Error(`Screenshot file invalid`);
    }

    file.hasScreenshot = true;

    await saveTransparent(page, file, mapBox);
}

/**
 * @param {Page} page
 * @param {SaveFile} saveFile
 * @param {{ x: number; y: number; width: number; height: number; }} clip
 */
async function saveTransparent(page, saveFile, clip) {
    await page.$eval(CANVAS_SELECTOR, async (canvas) => {
        // @ts-ignore
        canvas.parentElement.style.backgroundColor = "black";
        canvas.style.position = "relative";
        await new Promise((res) => setTimeout(res, 1000));
    });

    const tempPath = path.join(TRANSPARENT_PATH, saveFile.imageName.replace(".png", "_temp.png"));

    await page.screenshot({
        path: tempPath,
        clip,
    });

    const imageData = fsSync.readFileSync(tempPath);
    const png = PNG.sync.read(imageData);

    for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
            const idx = (png.width * y + x) << 2;

            const r = png.data[idx];
            const g = png.data[idx + 1];
            const b = png.data[idx + 2];

            if (r === 0 && g === 0 && b === 0) {
                png.data[idx + 3] = 0;
            }
        }
    }

    const buffer = PNG.sync.write(png);
    fsSync.writeFileSync(path.join(TRANSPARENT_PATH, saveFile.imageName), buffer);

    fsSync.rmSync(tempPath);

    saveFile.hasTransparent = true;
}

/**
 * @param {Page} page
 */
async function ensureMapTilesLoaded(page) {
    await page.$eval(CANVAS_TILES_SELECTOR, async (tiles) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const images = tiles.querySelectorAll("img");
        const imagesLoaded = [...images].map((img) => {
            const testImg = document.createElement("img");
            const loader = new Promise((resolve, reject) => {
                testImg.addEventListener("load", resolve);
                testImg.addEventListener("error", reject);
            });
            testImg.src = img.src;
            return loader;
        });

        await Promise.all(imagesLoaded);
        await new Promise((resolve) => setTimeout(resolve, 1000));
    });
}
