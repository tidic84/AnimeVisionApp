@echo off
cd /d "%~dp0"
echo Fermez le service Scan-Manga avant cette verification.
call npm --prefix catalog-server run browser
if errorlevel 1 pause
