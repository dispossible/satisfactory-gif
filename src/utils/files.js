import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { Parser } from "@etothepii/satisfactory-file-parser";
import { SAVES_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH } from "../vars.js";
import { askQuestion } from "./ask.js";
import readline from "node:readline";
/**
 * @param {string} savFileName
 */
export function getScreenshotName(savFileName) {
    return savFileName.replace(/\.sav$/, ".png");
}

/**
 * @returns {Promise<string[]>}
 */
export async function getSaveFilesToScreenshot() {
    const saveFiles = await getAllSaveFiles();
    const saveFilesWithDates = await addModifiedDateToFileNames(saveFiles);
    const sessions = await mapFilesToSessions(saveFilesWithDates);
    const sessionFiles = await selectSession(sessions);
    return sessionFiles;
}

export async function getScreenshotFiles() {
    const filesInFolder1 = (await fs.readdir(SCREENSHOTS_PATH)).filter((fileName) => fileName.endsWith(".png"));
    const filesInFolder2 = (await fs.readdir(TRANSPARENT_PATH)).filter((fileName) => fileName.endsWith(".png"));
    return filesInFolder1.filter((fileName) =>
        filesInFolder2.some((transFileName) => transFileName.startsWith(fileName.replace(".png", ""))),
    );
}

async function getAllSaveFiles() {
    console.log("Getting save files");
    const filesInFolder = await fs.readdir(SAVES_PATH);

    const filesToProcess = filesInFolder.filter(
        (fileName) =>
            path.extname(fileName).toLowerCase() === ".sav" &&
            !fileName.toLowerCase().includes("_autosave_") &&
            !fileName.toLowerCase().includes("_continue.sav"),
    );

    return filesToProcess;
}

/**
 * @param {string[]} filesToProcess
 * @returns {Promise<string[]>}
 */
async function addModifiedDateToFileNames(filesToProcess) {
    console.log("Assigning modified dates");
    const renamedFiles = [...filesToProcess];
    // Prepend the modified date to ensure ordering
    for (const [i, fileName] of filesToProcess.entries()) {
        if (!/^\d{14}__/.test(fileName)) {
            const filePath = path.join(SAVES_PATH, fileName);
            const stat = await fs.stat(filePath);
            const createdAt = stat.mtime;

            const year = String(createdAt.getFullYear());
            const month = String(createdAt.getMonth() + 1).padStart(2, "0");
            const day = String(createdAt.getDate()).padStart(2, "0");
            const hours = String(createdAt.getHours()).padStart(2, "0");
            const minutes = String(createdAt.getMinutes()).padStart(2, "0");
            const seconds = String(createdAt.getSeconds()).padStart(2, "0");

            const newName = `${year}${month}${day}${hours}${minutes}${seconds}__${fileName}`;

            await fs.rename(filePath, path.join(SAVES_PATH, newName));
            renamedFiles[i] = newName;
        }
    }
    return renamedFiles.sort((a, b) => a.localeCompare(b));
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
 * @param {string[]} files
 * @returns {Promise<Map<string, string[]>>}
 */
async function mapFilesToSessions(files) {
    console.log("Checking for game sessions");
    /** @type Map<string, string[]> */
    const sessionNameMap = new Map();

    for (const fileName of files) {
        console.log(`Checking session name for ${fileName}`);

        const sessionName = await getSessionName(fileName);
        if (sessionName) {
            console.log(`Session name found: ${sessionName}`);
            if (sessionNameMap.has(sessionName)) {
                // @ts-ignore
                sessionNameMap.get(sessionName).push(fileName);
            } else {
                sessionNameMap.set(sessionName, [fileName]);
            }
        } else {
            console.error(`Failed to find session name`);
        }
    }

    return sessionNameMap;
}

/**
 * @param {string} fileName
 * @return {string | null}
 */
function getSessionFromFileName(fileName) {
    const match = fileName.match(/^\d{14}__(.*?)_\d{6}-\d{6}/);
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
        console.error(`Error: Failed to parse save file ${fileName} for session name`, err);
    }
}

/**
 * @param {Map<string, string[]>} sessionNameMap
 * @returns {Promise<string[]>}
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
