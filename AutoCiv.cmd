@echo off
setlocal EnableDelayedExpansion
title AutoCiv v3

rem  Restarts the dev server and opens the game on localhost.
rem  Double-click this file. Closing the window stops the server.
rem
rem  v3 has no node_modules of its own -- it runs on the ROOT install, so this
rem  launches the root's vite with v3 as its root directory.

cd /d "%~dp0"

set PORT=5174

rem --- find node, whether or not it is on PATH -------------------------------
set NODE=node
where node >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set NODE="%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo.
    echo   Node.js was not found. Install it from https://nodejs.org and re-run.
    echo.
    pause
    exit /b 1
  )
)

if not exist "node_modules\vite\bin\vite.js" (
  echo.
  echo   Dependencies are missing. Run "npm install" in this folder first.
  echo.
  pause
  exit /b 1
)

rem --- stop whatever is already holding the port -----------------------------
echo   Freeing port %PORT% ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr LISTENING') do (
  taskkill /F /PID %%p >nul 2>&1
)

echo.
echo   AutoCiv v3
echo   ----------------------------------------
echo     game    http://localhost:%PORT%/
echo     editor  http://localhost:%PORT%/editor.html
echo   ----------------------------------------
echo   Close this window to stop the server.
echo.

rem Open the browser a moment later, so Vite is listening by the time it lands.
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start """" http://localhost:%PORT%/"

%NODE% node_modules\vite\bin\vite.js v3 --port %PORT%

echo.
echo   Server stopped.
pause
