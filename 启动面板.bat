@echo off
cd /d "%~dp0"

REM Locate pythonw (no console window)
set "MPYW="
REM 1) Prefer WorkBuddy managed pythonw (scan any version)
for /d %%d in ("C:\Users\%USERNAME%\.workbuddy\binaries\python\versions\*") do (
  if exist "%%d\pythonw.exe" set "MPYW=%%d\pythonw.exe"
)
REM 2) Fallback: pythonw in PATH (standard Python install)
if not defined MPYW (
  where pythonw >nul 2>nul && set "MPYW=pythonw"
)
REM 3) Last resort: python (shows a console window but works)
if not defined MPYW set "MPYW=python"

REM Availability check (avoid silent crash / flash)
"%MPYW%" -c "import tkinter" >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Python / tkinter not found. The launch panel cannot start.\n\nInstall Python with \"tcl/tk and IDLE\" checked, or install WorkBuddy, then try again.', 'Launch Panel Failed', 0x10)" >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] No usable Python interpreter (tkinter). Install Python or WorkBuddy.
    pause
  )
  exit /b 1
)

REM Launch tkinter main program with pythonw (no black window)
start "" "%MPYW%" "%~dp0control_panel_tk.py"
