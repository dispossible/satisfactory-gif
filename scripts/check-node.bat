@echo off
setlocal enabledelayedexpansion

:: 1. Ensure Node.js is installed
echo Checking for Node.js installation...
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
    echo Found Node.js version: !NODE_VERSION!
)

:: 2. Run npm install
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
)
