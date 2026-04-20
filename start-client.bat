@echo off
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
  echo.
  echo [start-client] Build failed. Please check the error above.
  pause
  exit /b 1
)

call npx electron .
if errorlevel 1 (
  echo.
  echo [start-client] Electron exited with an error.
  pause
  exit /b 1
)
