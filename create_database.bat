@echo off
cd /d "%~dp0"
echo ===================================================
echo Provisioning Netlify Database...
echo ===================================================
echo.
call npx netlify database create
echo.
pause
