@echo off
setlocal enabledelayedexpansion

call scripts/check-node.bat
call npm run import-saves

pause
