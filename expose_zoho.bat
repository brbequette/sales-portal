@echo off
cd /d "%~dp0"
echo ===================================================
echo Titan Diamond Sales Portal - Secure HTTPS Tunnel
echo ===================================================
echo.
echo Launching a secure HTTPS link for your Zoho Web Tab...
echo Keep this window open while using Zoho!
echo.
call npx localtunnel --port 8888 --subdomain titan-diamond-sales
pause
