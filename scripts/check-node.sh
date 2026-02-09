#!/bin/bash

# 1. Ensure Node.js is installed
echo "Checking for Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo "Found Node.js version: $NODE_VERSION"
fi

# 2. Ensure FFmpeg is installed
echo "Checking for FFmpeg installation..."
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: FFmpeg is not installed or not in PATH"
    echo "Please install FFmpeg from https://ffmpeg.org/"
    exit 1
else
    FFMPEG_VERSION=$(ffmpeg -version | head -n 1)
    echo "Found FFmpeg: $FFMPEG_VERSION"
fi

# 3. Run npm install
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error: npm install failed"
    exit 1
fi
