@echo off
cd /d "%~dp0"
if exist "dist-desktop\win-unpacked\AnimeVision.exe" (
  start "" "dist-desktop\win-unpacked\AnimeVision.exe"
) else (
  call npm run desktop
  if errorlevel 1 pause
)
