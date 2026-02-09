# Satisfactory GIFs

This tool creates an animated GIF / video that shows how a Satisfactory save expands over time using the Satisfactory interactive map.

## Overview

- **What it does**: Records the map view of a Satisfactory save over time and compiles the captured frames into an animated GIF and video so you can watch your factory grow.
- **How it works (high-level)**: The program opens saved games in the [Satisfactory interactive map](https://satisfactory-calculator.com/en/interactive-map), captures screenshots at set intervals/positions, stores the screenshots, and stitches them together into a sequence.

## Quick Start

- **Run on Linux / macOS**: Execute the shell runner from the repository root:

```bash
./run.sh
```

- **Run on Windows**: Double-click `run.bat` or run it from a Command Prompt / PowerShell in the repository folder:

```powershell
.\\run.bat
```

### Prerequisites

- **Node.js**: Make sure you have [Node.js](https://nodejs.org/) installed on your machine to run this script.
- **FFmpeg**: This tool requires [FFmpeg](https://ffmpeg.org/) to be installed and available in your PATH. FFmpeg is used to compile video frames into the final GIF.
- **Satisfactory saves**: You need one or more `.sav` files (Satisfactory save files). The script will automatically import them, but you can put them in the `saves/` folder manually if you prefer or use the separate import script.

### Importing Saves

- **Automatic**: If you run the main program without any save games present, it will run the save import script.
- **Import script**: Use the included import scripts if you want to pull in your save games from your game installation. They are provided as `import-saves.sh` and `import-saves.bat`.
- **Manual import**: If the automatic import doesn't find your saves, manually place `.sav` files into the local `saves/` directory.

### Running the Program

- **Full run**: `./run.sh` or `run.bat` will attempt to process all saves found in `saves/`, render frames, capture screenshots, and produce output files.
- **Interrupt & resume**: The runner attempts to resume a previous run automatically if it was interrupted. If an individual frame fails, the program will retry the frame. If you want a full clean run, delete the `output/` directory.

### Output Structure

- **`output/frames/`**: Raw image frames captured during the run. These are the images stitched into the final GIF.
- **`output/screenshots/`**: Screenshots for each step — useful to inspect visual problems in the map capture.
- **`output/transparent/`**: Contains screenshots with the map layer hidden.
- **Final outputs**: Both a video file and an animated GIF are saved under `output/`. The GIF file can become **very large** (several hundred MB or more), while the video file will be **significantly smaller** and is recommended for sharing.

## Upgrading & Re-running

- **Fresh output**: If upgrading from a previous version or when starting a brand-new run you want to avoid mixing old frames, delete the `output/` directory before running.
- **Partial or bad frames**: If you see visual glitches in the GIF, inspect `output/screenshots/` and remove any bad screenshots or frames, then re-run to regenerate only the missing pieces.

## Performance & Storage

- **Time**: Rendering a full save (many frames) can take a long time — expect lengthy runs for large or many saves.
- **Disk space**: Captured frames consume disk space quickly. Keep an eye on `output/frames/` during large runs and clean up if needed.

## Troubleshooting

- **No saves found**: Ensure `.sav` files are in the `saves/` folder and have the correct extension.
- **Visual artifacts**: Check `output/screenshots/` for broken frames. Delete the affected files and re-run — the script will retry those frames.
- **Script fails immediately**: Check permissions and that the scripts are executable (`chmod +x run.sh` on Linux/macOS). On Windows, ensure the `.bat` files run from a proper command prompt.
