#!/bin/bash

# Satisfactory GIF - Linux Execution Script

# 1. Declare directory variables
# Standard Linux Satisfactory save paths (Proton/Steam)
MASTER_SAVES_PROTON="$HOME/.local/share/Steam/steamapps/compatdata/526870/pfx/drive_c/users/steamuser/AppData/Local/FactoryGame/Saved/SaveGames"
# Native Linux (if applicable)
MASTER_SAVES_NATIVE="$HOME/.config/Epic Games Launcher/FactoryGame/Saved/SaveGames"
LOCAL_SAVES_DIR="saves"
OUTPUT_DIR="output"
OUTPUT_1_DIR="output/1"
OUTPUT_2_DIR="output/2"

# 2. Create local directories if they don't exist
mkdir -p "$LOCAL_SAVES_DIR"
mkdir -p "$OUTPUT_1_DIR"
mkdir -p "$OUTPUT_2_DIR"

echo "Creating output directories..."

# 3. Copy all files from the master directory to the local 'saves' directory
if [ ! "$(ls -A "$LOCAL_SAVES_DIR" 2>/dev/null)" ]; then
    # Check Proton path first, then native Linux path
    MASTER_SAVES=""
    if [ -d "$MASTER_SAVES_PROTON" ]; then
        MASTER_SAVES="$MASTER_SAVES_PROTON"
        echo "Found Proton Satisfactory saves directory"
    elif [ -d "$MASTER_SAVES_NATIVE" ]; then
        MASTER_SAVES="$MASTER_SAVES_NATIVE"
        echo "Found native Linux Satisfactory saves directory"
    fi

    if [ -z "$MASTER_SAVES" ]; then
        echo "Error: Satisfactory saves directory not found"
        echo "Expected location: $MASTER_SAVES_PROTON"
        exit 1
    fi

    echo "Checking for saves in: $MASTER_SAVES"

    # Find numeric folder in MASTER_SAVES
    NUMERIC_FOLDER=""
    for dir in "$MASTER_SAVES"/*; do
        if [ -d "$dir" ]; then
            DIR_NAME=$(basename "$dir")
            # Check if directory name is all digits
            if [[ "$DIR_NAME" =~ ^[0-9]+$ ]]; then
                echo "Found save folder: $DIR_NAME"
                NUMERIC_FOLDER="$DIR_NAME"
                break
            fi
        fi
    done

    if [ -z "$NUMERIC_FOLDER" ]; then
        echo "Error: No player folder found in $MASTER_SAVES"
        exit 1
    fi

    echo "Copying save files from $MASTER_SAVES/$NUMERIC_FOLDER to local saves directory..."
    FILE_COUNT=0
    for file in "$MASTER_SAVES/$NUMERIC_FOLDER"/*; do
        if [ -f "$file" ]; then
            cp "$file" "$LOCAL_SAVES_DIR/"
            FILENAME=$(basename "$file")
            echo "Copied: $FILENAME"
            ((FILE_COUNT++))
        fi
    done

    if [ $FILE_COUNT -eq 0 ]; then
        echo "Error: No save files found in $MASTER_SAVES/$NUMERIC_FOLDER"
        exit 1
    fi

    echo "Copied $FILE_COUNT save files."
else
    echo "Local saves directory already contains files. Continuing with these files."
fi

# 4. Ensure Node.js is installed
echo "Checking for Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo "Found Node.js version: $NODE_VERSION"
fi

# 5. Run npm install
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error: npm install failed"
    exit 1
fi

# 6. Run the node start script from package.json
echo "Starting gif creation..."
npm start
