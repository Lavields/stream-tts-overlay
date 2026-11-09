@echo off
setlocal
title StreamVoice
cd /d "%~dp0"
if not exist "runtime\node\node.exe" (
  echo Falta el motor incluido. Extrae TODO el ZIP antes de abrir INICIAR.cmd.
  pause
  exit /b 1
)
"runtime\node\node.exe" "launcher.mjs" %*
if errorlevel 1 (
  echo.
  echo No se pudo iniciar StreamVoice. Revisa el mensaje anterior.
  pause
)
endlocal
