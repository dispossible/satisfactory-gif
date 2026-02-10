import fsSync from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { SAVES_PATH, OUTPUT_PATH, SCREENSHOTS_PATH, TRANSPARENT_PATH, FRAME_PATH } from "./vars.js";
import { askYesNoQuestion, replaceLastLog } from "./utils/ask.js";

export default async function setup() {
    await ensureDirectories();
    await copySaveFiles();
    console.log("Setup complete");
}

// Platform-specific master saves path
function getMasterSavesPath() {
    const platform = process.platform;

    if (platform === "win32" && process.env.LOCALAPPDATA) {
        return path.join(process.env.LOCALAPPDATA, "FactoryGame", "Saved", "SaveGames");
    } else if (platform === "darwin" && process.env.HOME) {
        return path.join(
            process.env.HOME,
            "Library/Application Support/Epic Games Library/FactoryGame/Saved/SaveGames",
        );
    } else if (platform === "linux" && process.env.HOME) {
        // Linux - check both Proton and native paths
        const protonPath = path.join(
            process.env.HOME,
            ".local/share/Steam/steamapps/compatdata/526870/pfx/drive_c/users/steamuser/AppData/Local/FactoryGame/Saved/SaveGames",
        );
        const nativePath = path.join(process.env.HOME, ".config/Epic Games Launcher/FactoryGame/Saved/SaveGames");

        if (fsSync.existsSync(protonPath)) {
            return protonPath;
        }
        return nativePath;
    }
    throw new Error("Unsupported platform or environment variables not set");
}

export async function ensureDirectories() {
    console.log("Setting up directories");
    await fsAsync.mkdir(SAVES_PATH, { recursive: true });
    await fsAsync.mkdir(OUTPUT_PATH, { recursive: true });
    await fsAsync.mkdir(SCREENSHOTS_PATH, { recursive: true });
    await fsAsync.mkdir(TRANSPARENT_PATH, { recursive: true });
    await fsAsync.mkdir(FRAME_PATH, { recursive: true });
}

export async function copySaveFiles() {
    const localSavesExist = fsSync.existsSync(SAVES_PATH) && fsSync.readdirSync(SAVES_PATH).length > 0;

    if (localSavesExist) {
        console.log("Local saves directory already contains files");
        const overwrite = await askYesNoQuestion(
            "Do you want to overwrite the local saves with the latest ones from the game? (y/n): ",
        );
        if (!overwrite) {
            console.log("Using existing local saves");
            return;
        }
        await fsAsync.rm(SAVES_PATH, { recursive: true, force: true });
        await fsAsync.mkdir(SAVES_PATH, { recursive: true });
    }

    const masterSavesPath = getMasterSavesPath();
    console.log(`Checking for saves in: ${masterSavesPath}`);

    if (!fsSync.existsSync(masterSavesPath)) {
        throw new Error(`Error: Game saves directory not found at ${masterSavesPath}`);
    }

    // Find numeric folder (player ID)
    const folders = fsSync.readdirSync(masterSavesPath);
    let numericFolder = null;

    for (const folder of folders) {
        const folderPath = path.join(masterSavesPath, folder);
        const stat = fsSync.statSync(folderPath);

        if (stat.isDirectory() && /^\d+$/.test(folder)) {
            numericFolder = folder;
            console.log(`Found save folder: ${numericFolder}`);
            break;
        }
    }

    if (!numericFolder) {
        throw new Error(`Error: No player folder found in ${masterSavesPath}`);
    }

    const sourceDir = path.join(masterSavesPath, numericFolder);
    const files = fsSync.readdirSync(sourceDir);
    let fileCount = 0;

    console.log(`Copying save files from ${sourceDir} to local saves directory`);

    console.log("");
    for (const file of files) {
        const sourcePath = path.join(sourceDir, file);
        const destPath = path.join(SAVES_PATH, file);
        const stat = fsSync.statSync(sourcePath);

        if (
            stat.isFile() &&
            path.extname(file).toLowerCase() === ".sav" &&
            !file.toLowerCase().includes("_autosave_") &&
            !file.toLowerCase().includes("_continue.sav")
        ) {
            fsSync.copyFileSync(sourcePath, destPath);
            replaceLastLog(`Copied: ${file}`);
            fileCount++;
        }
    }

    if (fileCount === 0) {
        throw new Error(`Error: No save files found in ${sourceDir}`);
    }

    console.log(`Copied ${fileCount} save files`);
}
