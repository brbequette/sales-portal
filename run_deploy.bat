@echo off
cd /d "%~dp0"
echo ===================================================
echo Titan Diamond Sales Portal - Local Build and Deploy
echo ===================================================
echo.
echo 1. Generating database client...
call npx prisma generate
echo.
echo 2. Compiling Next.js project to static HTML...
call npx next build
echo.
echo 3. Deploying to Netlify Production...
set NETLIFY_SITE_ID=61a15791-b7ec-4746-b495-7772abd22840
call npx netlify deploy --prod --site 61a15791-b7ec-4746-b495-7772abd22840

echo.
echo Deployment finished! Your site is now live.
pause
