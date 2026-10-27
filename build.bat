@echo off
chcp 65001 >nul
call npm ci
if errorlevel 1 exit /b 1
call npm test
if errorlevel 1 exit /b 1
call npm run dist -- --win portable --x64
if errorlevel 1 exit /b 1
echo 构建完成，便携版位于 dist 目录。
pause
