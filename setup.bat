@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   多维表录入工具 - 一键安装启动
echo ============================================
echo.

set "WB_NODE=C:\Users\%USERNAME%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if exist "%WB_NODE%" (
  echo [OK] 找到 WorkBuddy 内置 Node
) else (
  where node >nul 2>nul
  if %errorlevel%==0 (
    echo [OK] 找到系统 Node
  ) else (
    echo [错误] 未找到 Node.js，请先安装 Node.js LTS 并勾选 Add to PATH
    pause
    exit /b 1
  )
)

echo.
echo [1/2] 安装 npm 依赖(express)...
call npm install
if errorlevel 1 (
  echo [错误] npm install 失败，请检查网络后重试
  pause
  exit /b 1
)

echo.
echo [2/2] 启动控制面板（后台运行）...
start "" "%~dp0启动面板.bat"

echo.
echo ============================================
echo   完成！控制面板已启动
echo   浏览器打开 http://localhost:3599
echo   关闭服务请在控制面板点「停止」或「退出」
echo ============================================
echo.
pause
