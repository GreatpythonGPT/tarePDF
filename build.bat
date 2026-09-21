@echo off
setlocal
cd /d "%~dp0"
call npm ci
if errorlevel 1 exit /b 1
call npm run check
if errorlevel 1 exit /b 1
call npm test
if errorlevel 1 exit /b 1
call npm run dist
if errorlevel 1 exit /b 1
echo Build completed. See dist\ for the portable executable.
endlocal
