@echo off
setlocal
cd /d "%~dp0"

if not exist "index.html" (
  echo ERROR: index.html was not found in "%~dp0".
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js and npm were not found. Install Node.js 18 or newer.
  pause
  exit /b 1
)

if not exist "node_modules\xlsx\package.json" (
  echo ERROR: Project dependencies are not installed.
  echo Open a terminal in "%~dp0" and run: npm ci
  pause
  exit /b 1
)

echo Starting CampusCare at http://127.0.0.1:3000/index.html
echo Email mode defaults to test mode. Press Ctrl+C to stop.
start "" http://127.0.0.1:3000/index.html
npm start
set "SERVER_EXIT=%errorlevel%"
if not "%SERVER_EXIT%"=="0" echo ERROR: The CampusCare server stopped with an error.
pause
exit /b %SERVER_EXIT%
