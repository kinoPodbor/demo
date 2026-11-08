@echo off
chcp 65001 >nul
cd /d "%~dp0"
title KINOPODBOR - START
 echo ==============================================
 echo          KINOPODBOR - ONE CLICK START
 echo ==============================================
where py >nul 2>nul
if %errorlevel%==0 (set PY=py) else (set PY=python)
%PY% --version >nul 2>nul
if errorlevel 1 (
 echo Python not found. Install Python from https://www.python.org/downloads/ and enable Add Python to PATH.
 pause
 exit /b 1
)
echo Starting local preview...
start "KinoPodbor server" /min cmd /c "%PY% -m http.server 8765 --bind 0.0.0.0"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:8765/
echo.
echo The app is open in your browser.
echo To stop the preview, close the KinoPodbor server window in the taskbar.
echo For iPhone access, follow PUBLISH_TO_IPHONE_RU.txt.
pause
