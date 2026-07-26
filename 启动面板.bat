@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM ── 定位 pythonw(无控制台黑窗) ──
set "MPYW="
REM 1) 优先用 WorkBuddy 自带 managed pythonw(扫描任意版本, 避免写死版本号导致找不到)
for /d %%d in ("C:\Users\%USERNAME%\.workbuddy\binaries\python\versions\*") do (
  if exist "%%d\pythonw.exe" set "MPYW=%%d\pythonw.exe"
)
REM 2) 否则在 PATH 里找 pythonw(标准 Python 安装自带, 双击 .py 也不会黑窗)
if not defined MPYW (
  where pythonw >nul 2>nul && set "MPYW=pythonw"
)
REM 3) 兜底: 用 python(会带一个控制台黑窗, 但功能正常)
if not defined MPYW set "MPYW=python"

REM ── 可用性检测(避免静默一闪而过, 出错时弹出明确提示) ──
"%MPYW%" -c "import tkinter" >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('未找到可用的 Python / tkinter 环境，启动面板无法打开。\n\n请在另一台电脑安装 Python 并勾选「tcl/tk 与 IDLE」，或安装 WorkBuddy 后再试。', '启动面板失败', 0x10)" >nul 2>nul
  if errorlevel 1 (
    echo [错误] 未找到可用的 Python 解释器(tkinter)。请安装 Python 或 WorkBuddy。
    pause
  )
  exit /b 1
)

REM 用 pythonw 启动 tkinter 主程序, 无黑窗; start 异步, bat 自动关闭
start "" "%MPYW%" "%~dp0control_panel_tk.py"
