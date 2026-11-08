@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ==============================================
echo   KINOPODBOR - SECURE KINOPOISK API SETUP
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
echo [1/4] Checking Cloudflare login...
npx --yes wrangler whoami
if errorlevel 1 (
  echo.
  echo A browser will open. Sign in to your Cloudflare account and allow Wrangler.
  npx --yes wrangler login
  if errorlevel 1 goto fail
)
echo.
echo [2/4] Entering your Kinopoisk.dev token as a protected Cloudflare Secret.
echo The token is NOT written into the website files.
echo The token is supplied by this setup file and sent directly to Cloudflare as a Secret.
set "KINOPOISK_TOKEN=XK90XQW-TXAM49F-NABY1WJ-3HD5AQB"
echo %KINOPOISK_TOKEN%| npx --yes wrangler secret put KINOPOISK_TOKEN
set "KINOPOISK_TOKEN="
if errorlevel 1 goto fail
echo.
echo [3/4] Publishing the API Worker...
npx --yes wrangler deploy
if errorlevel 1 goto fail
echo.
echo [4/4] Done. Copy the workers.dev URL printed above.
echo Open KinoPodbor, Settings, and paste that URL into Cloudflare Worker address.
pause
exit /b 0
:fail
echo.
echo Setup failed. Read the error above, then try again.
pause
exit /b 1
