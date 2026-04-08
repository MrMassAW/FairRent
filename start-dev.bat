@echo off
setlocal
cd /d "%~dp0"
title FairRent - start dev
echo Opening 2 PowerShell windows: Vite ^(left^) + listing agent ^(right^)...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-side-by-side.ps1"
if errorlevel 1 (
  echo.
  echo Script failed.
  pause
  exit /b 1
)
