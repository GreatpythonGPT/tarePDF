@echo off
echo ========================================
echo    Tare PDF Generator 构建脚本
echo ========================================
echo.

echo [1/4] 清理之前的构建文件...
if exist dist rmdir /s /q dist
if exist node_modules\.cache rmdir /s /q node_modules\.cache
echo 清理完成!
echo.

echo [2/4] 安装依赖包...
npm install
if %errorlevel% neq 0 (
    echo 依赖安装失败!
    pause
    exit /b 1
)
echo 依赖安装完成!
echo.

echo [3/4] 开始构建应用...
npm run build
if %errorlevel% neq 0 (
    echo 构建失败!
    pause
    exit /b 1
)
echo 构建完成!
echo.

echo [4/4] 检查输出文件...
if exist dist\*.exe (
    echo ✓ Windows安装包构建成功!
    echo 输出位置: dist\*.exe
    dir dist\*.exe
) else (
    echo ✗ 未找到安装包文件
)
echo.

echo ========================================
echo           构建完成!
echo ========================================
pause