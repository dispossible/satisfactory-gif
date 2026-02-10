import fs from "fs/promises";
import fsSync from "fs";
import path from "node:path";
import { Parser } from "@etothepii/satisfactory-file-parser";
import { FRAME_PATH, SAVES_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH } from "../vars.js";
import { askQuestion, replaceLastLog } from "./ask.js";
import readline from "node:readline";
import { validateScreenshot } from "./image.js";

/**
 * @typedef {{
 *     fileName: string;
 *     session: string | null;
 *     date: Date;
 *     imageName: string;
 *     hasScreenshot: boolean;
 *     hasTransparent: boolean;
 *     hasFrame: boolean;
 * }} SaveFile
 */

/**
 * @param {string} name
 * @param {Date} date
 */
export function getImageName(name, date) {
    const year = `${date.getFullYear()}`;
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    const seconds = `${date.getSeconds()}`.padStart(2, "0");
    return year + month + day + hours + minutes + seconds + "__" + name.replace(/\.sav$/, "") + ".png";
}

/**
 * @returns {Promise<SaveFile[]>}
 */
export async function getSaveFiles() {
    const saveFiles = await getAllSaveFiles();
    const sessions = await mapFilesToSessions(saveFiles);
    const sessionFiles = await selectSession(sessions);
    return sessionFiles.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function getScreenshotFiles() {
    const filesInFolder1 = (await fs.readdir(SCREENSHOTS_PATH)).filter((fileName) => fileName.endsWith(".png"));
    const filesInFolder2 = (await fs.readdir(TRANSPARENT_PATH)).filter((fileName) => fileName.endsWith(".png"));
    return filesInFolder1.filter((fileName) =>
        filesInFolder2.some((transFileName) => transFileName.startsWith(fileName.replace(".png", ""))),
    );
}

/**
 * @returns {Promise<SaveFile[]>}
 */
async function getAllSaveFiles() {
    console.log("Getting save files");
    const fileNames = await fs.readdir(SAVES_PATH);

    const savFileNames = fileNames.filter(
        (fileName) =>
            path.extname(fileName).toLowerCase() === ".sav" &&
            !fileName.toLowerCase().includes("_autosave_") &&
            !fileName.toLowerCase().includes("_continue.sav"),
    );

    const screenshotNames = (await fs.readdir(SCREENSHOTS_PATH)).filter((fileName) => fileName.endsWith(".png"));
    const transparentNames = (await fs.readdir(TRANSPARENT_PATH)).filter((fileName) => fileName.endsWith(".png"));
    const frameNames = (await fs.readdir(FRAME_PATH)).filter((fileName) => fileName.endsWith(".png"));

    /** @type {SaveFile[]} */
    const fileData = [];
    /** @type {string[]} */
    const oldSaves = [];
    console.log("");
    for (const [i, savFile] of savFileNames.entries()) {
        replaceLastLog(`Reading save file: ${i + 1} / ${savFileNames.length} - ${savFile}`);
        const filePath = path.join(SAVES_PATH, savFile);
        const stat = await fs.stat(filePath);
        const saveDate = stat.mtime;

        const session = await getSessionName(savFile);
        const isOldSave = !!(await getOldSaveSessionName(savFile));
        if (isOldSave) {
            oldSaves.push(savFile);
            continue;
        }

        const imageName = getImageName(session ?? savFile, saveDate);

        fileData.push({
            fileName: savFile,
            session,
            date: saveDate,
            imageName,
            hasScreenshot: screenshotNames.includes(imageName),
            hasTransparent: transparentNames.includes(imageName),
            hasFrame: frameNames.includes(imageName),
        });
    }

    if (oldSaves.length > 0) {
        console.warn(
            `${oldSaves.length} files were skipped due to being older than Update 6, please open them in-game to make them valid`,
        );
    }

    return fileData.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * @param {string} fileName
 */
export async function getSessionName(fileName) {
    let sessionName = getSessionFromFileName(fileName);
    if (!sessionName) {
        sessionName = await getOldSaveSessionName(fileName);
    }
    if (!sessionName) {
        sessionName = (await parseSaveFile(fileName))?.header.sessionName ?? null;
    }
    return sessionName;
}

/**
 * @param {SaveFile[]} files
 * @returns {Promise<Map<string, SaveFile[]>>}
 */
async function mapFilesToSessions(files) {
    console.log("Checking for game sessions");
    /** @type Map<string, SaveFile[]> */
    const sessionNameMap = new Map();

    for (const file of files) {
        if (file.session) {
            if (sessionNameMap.has(file.session)) {
                // @ts-ignore
                sessionNameMap.get(file.session).push(file);
            } else {
                sessionNameMap.set(file.session, [file]);
            }
        }
    }

    return sessionNameMap;
}

/**
 * @param {string} fileName
 * @return {string | null}
 */
function getSessionFromFileName(fileName) {
    const match = fileName.match(/^(.*?)_\d{6}-\d{6}/);
    return match ? match[1] : null;
}

/**
 * @param {string} fileName
 * @return {Promise<string | null>}
 */
async function getOldSaveSessionName(fileName) {
    // Old save files have the session name on the first line of the file
    const content = await readFirstLine(path.join(SAVES_PATH, fileName));
    const match = content.match(/\?sessionName=([^?]*)\?/);
    return match ? match[1] : null;
}

/**
 * @param {string} fileName
 */
async function parseSaveFile(fileName) {
    try {
        const file = new Uint8Array(fsSync.readFileSync(path.join(SAVES_PATH, fileName))).buffer;
        const save = Parser.ParseSave(fileName, file, { throwErrors: true });
        return save;
    } catch (err) {
        // @ts-ignore
        console.error(`Error: Failed to parse save file ${fileName}: `, err.message);
    }
}

/**
 * @param {Map<string, SaveFile[]>} sessionNameMap
 * @returns {Promise<SaveFile[]>}
 */
async function selectSession(sessionNameMap) {
    if (sessionNameMap.size > 1) {
        const gameNames = Array.from(sessionNameMap.keys());
        console.log("Multiple save sessions found");
        const response = await askQuestion(
            gameNames.map((name, i) => `${i + 1}. ${name}`).join("\n") +
                "\nEnter the number of the session you want to process: ",
        );
        const selectedIndex = parseInt(response) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= gameNames.length) {
            throw new Error("Invalid session selection");
        }
        // @ts-ignore
        return sessionNameMap.get(gameNames[selectedIndex]);
    }

    return sessionNameMap.values().next().value ?? [];
}

/**
 * @param {string} fileName
 * @returns {Promise<string>}
 */
async function readFirstLine(fileName) {
    const fileStream = fsSync.createReadStream(fileName);
    const rl = readline.createInterface({
        input: fileStream,
    });

    for await (const line of rl) {
        return line;
    }

    throw new Error(`File ${fileName} is empty`);
}
