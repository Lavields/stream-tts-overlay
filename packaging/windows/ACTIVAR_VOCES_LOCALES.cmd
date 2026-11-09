@echo off
setlocal
title StreamVoice - Activar voces sin API
cd /d "%~dp0"
if not exist "runtime\node\node.exe" (
  echo Extrae TODO el ZIP antes de activar las voces.
  pause
  exit /b 1
)
"runtime\node\node.exe" "setup-offline.mjs"
pause
endlocal
