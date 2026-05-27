@echo off
cd /d "%~dp0"
echo ===================================================
echo Starting Titan Diamond Sales Portal (Standalone)
echo ===================================================
echo.
echo Launching Netlify Dev Server...
echo This will connect securely to your Cloud Database.
echo.
call npx netlify dev
pause
