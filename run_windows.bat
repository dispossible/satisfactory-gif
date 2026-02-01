@echo off
setlocal enabledelayedexpansion
:: Satisfactory GIF - Windows Execution Script

:: 1. Declare directory variables
set MASTER_SAVES=%localappdata%\FactoryGame\Saved\SaveGames
set LOCAL_SAVES_DIR=saves
set OUTPUT_DIR=output
set OUTPUT_1_DIR=output\1
set OUTPUT_2_DIR=output\2

:: 2. Create local directories if they don't exist
if not exist "%LOCAL_SAVES_DIR%" (
    echo Creating local saves directory...
    mkdir "%LOCAL_SAVES_DIR%"
)

if not exist "%OUTPUT_DIR%" (
    echo Creating output directory...
    mkdir "%OUTPUT_DIR%"
)

if not exist "%OUTPUT_1_DIR%" mkdir "%OUTPUT_1_DIR%"
if not exist "%OUTPUT_2_DIR%" mkdir "%OUTPUT_2_DIR%"

:: 3. Copy all files from the master directory to the local 'saves' directory
:: Check if local saves directory already has files
if not exist "%LOCAL_SAVES_DIR%\*" (
    echo Checking for saves in: %MASTER_SAVES%
    if exist "%MASTER_SAVES%" (
        :: Find the numeric folder inside MASTER_SAVES
        set NUMERIC_FOLDER=
        :: for /d %%D in ("%MASTER_SAVES%\*") do (
        for /f "delims=" %%D in ('dir /b /ad "%MASTER_SAVES%"') do (
            set DIR_NAME=%%D
            echo Checking folder: !DIR_NAME!
            :: Check if directory name is all digits
            echo !DIR_NAME!| findstr /r "^[0-9][0-9]*$" >nul
            echo Result: !errorlevel!
            if !errorlevel! equ 0 (
                echo Found save folder: !DIR_NAME!
                set NUMERIC_FOLDER=!DIR_NAME!
            )
        )

        if "!NUMERIC_FOLDER!"=="" (
            echo No player folder found in %MASTER_SAVES%
            pause
            exit /b 1
        )
        
        echo Copying save files from %MASTER_SAVES%\!NUMERIC_FOLDER! to local saves directory...
        set FILE_COUNT=0
        for %%F in ("%MASTER_SAVES%\!NUMERIC_FOLDER!\*") do (
            set FILENAME=%%~nxF
            copy "%%F" "%LOCAL_SAVES_DIR%\" >nul
            set /a FILE_COUNT+=1
            echo Copied: !FILENAME!
        )

        if !FILE_COUNT! equ 0 (
            echo No save files found in %MASTER_SAVES%\!NUMERIC_FOLDER!
            pause
            exit /b 1
        )

        echo Copied !FILE_COUNT! save files.
    ) else (
        echo Game saves directory not found at %MASTER_SAVES%
        pause
        exit /b 1
    )
) else (
    echo Local saves directory already contains files. Continuing with these files.
)

:: 4. Ensure Node.js is installed
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

:: 5. Run npm install
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
)

:: 6. Run the node start script from package.json
echo Starting gif creation...
call npm start

pause
