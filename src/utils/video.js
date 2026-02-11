import Ffmpeg from "fluent-ffmpeg";
import { FPS, FRAME_PATH, OUTPUT_PATH } from "../vars.js";
import path from "node:path";
import { replaceLastLog } from "./ask.js";

/**
 * @param {string} gifName
 */
export async function convertGifToVideo(gifName) {
    const gifPath = path.join(OUTPUT_PATH, gifName);
    const videoPath = gifPath.replace(".gif", ".mp4");
    await new Promise((resolve, reject) => {
        Ffmpeg(gifPath)
            .outputOptions([
                "-c:v libx264", // Use the H.264 video codec
                "-crf 16", // Set quality (lower is better, 18-28 is typical)
                "-preset veryslow", // Better compression/quality ratio (but slower)
                "-pix_fmt yuv420p", // Ensures compatibility with QuickTime/iOS
                "-movflags +faststart", // Allows the video to start playing before fully downloaded
                "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2", // MP4 requires even dimensions
            ])
            .toFormat("mp4")
            .on("start", () => {
                console.log("Converting GIF to MP4");
                console.log("");
            })
            .on("progress", (progress) => {
                const percent = Math.round(progress.percent ?? 0);
                if (percent <= 100 && percent >= 0) {
                    replaceLastLog(`Video progress: ${percent}%`);
                }
            })
            .on("error", (err) => {
                console.error("An error occurred: " + err.message);
                reject(err);
            })
            .save(videoPath)
            .on("end", resolve);
    });
    console.log(`Video created: ${videoPath}`);
}

/**
 * @param {string} videoName
 */
export async function convertFramesToVideo(videoName) {
    const videoPath = path.join(OUTPUT_PATH, videoName);
    const inputPattern = path.join(FRAME_PATH, "%06d.png");
    await new Promise((resolve, reject) => {
        Ffmpeg()
            .input(inputPattern)
            .inputFps(FPS)
            .inputOptions([`-framerate ${FPS}`])
            .outputOptions([
                "-c:v libx264",
                "-crf 16",
                "-preset veryslow",
                "-pix_fmt yuv420p",
                "-movflags +faststart",
                "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
            ])
            .on("start", (command) => {
                console.log("Converting frames to MP4", command);
                console.log("");
            })
            .on("progress", (progress) => {
                const percent = Math.round(progress.percent ?? 0);
                if (percent <= 100 && percent >= 0) {
                    replaceLastLog(`Video progress: ${percent}%`);
                }
            })
            .on("error", (err) => {
                console.error("An error occurred: " + err.message);
                reject(err);
            })
            .save(videoPath)
            .on("end", resolve);
    });
    console.log(`Video created: ${videoPath}`);
}
