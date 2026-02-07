import { Browser, Page } from "puppeteer";
import { MAP_URL, SAVES_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH } from "../vars.js";
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
} from "../selectors.js";
import { retry, wait } from "./wait.js";
import fs from "fs/promises";
import { getScreenshotName } from "./files.js";
import path from "node:path";

/**
 * @param {string} saveFile
 */
export function screenshotFile(saveFile) {
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
            console.error(`Failed: ${saveFile}`, err);
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
    await hideMapViewElements(page);
    await clickButton(page, SHOW_PURE_NODES_SELECTOR);
    await clickButton(page, TOGGLE_PURE_NODES_SELECTOR);
    await setZoomLevel(page);
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
    await page.$eval("body", async () => {
        window.location.hash = "4.25;0;0|gameLayer|";
        await new Promise((res) => setTimeout(res, 1000));
    });
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

    const screenshotName = getScreenshotName(fileName);

    console.log(`Saving map '${screenshotName}'`);

    await page.screenshot({
        path: path.join(SCREENSHOTS_PATH, screenshotName),
        clip: mapBox,
    });
    await saveTransparent(page, screenshotName);
}

/**
 * @param {Page} page
 * @param {string} fileName
 */
async function saveTransparent(page, fileName) {
    const imgData = await page.$eval(CANVAS_SELECTOR, (canvas) => {
        return canvas.toDataURL();
    });
    const offset = await page.$eval(CANVAS_SELECTOR, (canvas) => {
        const wrapper = document.querySelector("#leafletMap");
        if (!wrapper) {
            return { x: 0, y: 0 };
        }
        const canvasPos = canvas.getBoundingClientRect();
        const wrapperPos = wrapper.getBoundingClientRect();
        return {
            x: wrapperPos.x - canvasPos.x,
            y: wrapperPos.y - canvasPos.y,
        };
    });
    const offsetFileName = `${fileName}__${offset.x}|${offset.y}`;
    await fs.writeFile(path.join(TRANSPARENT_PATH, offsetFileName), imgData.split(",")[1], { encoding: "base64" });
}
