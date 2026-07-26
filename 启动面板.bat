@echo off
cd /d "%~dp0"

REM Find a Python interpreter that can actually create a Tk window.
REM Preference order: user-installed Python (PATH) first, WorkBuddy managed
REM pythonw last. (import alone is not enough: some managed pythons import
REM  tkinter but lack a working tcl/tk runtime, crashing silently under pythonw.)

set "PYTHON="

REM 1) pythonw in PATH (standard Python install, e.g. the one the user installed)
if not defined PYTHON (
  where pythonw >nul 2>nul
  if not errorlevel 1 (
    pythonw -c "import tkinter; r=tkinter.Tk(); r.withdraw(); r.destroy()" >nul 2>nul
    if not errorlevel 1 set "PYTHON=pythonw"
  )
)

REM 2) python in PATH (shows a console window, but works)
if not defined PYTHON (
  where python >nul 2>nul
  if not errorlevel 1 (
    python -c "import tkinter; r=tkinter.Tk(); r.withdraw(); r.destroy()" >nul 2>nul
    if not errorlevel 1 set "PYTHON=python"
  )
)

REM 3) WorkBuddy managed pythonw (any version) - last resort
for /d %%d in ("C:\Users\%USERNAME%\.workbuddy\binaries\python\versions\*") do (
  if not defined PYTHON (
    if exist "%%d\pythonw.exe" (
      "%%d\pythonw.exe" -c "import tkinter; r=tkinter.Tk(); r.withdraw(); r.destroy()" >nul 2>nul
      if not errorlevel 1 set "PYTHON=%%d\pythonw.exe"
    )
  )
)

if not defined PYTHON (
  powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('Python / tkinter not found. The launch panel cannot start.\n\nInstall Python with tcl/tk checked, or install WorkBuddy, then try again.', 'Launch Panel Failed', 0x10)" >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] No usable Python interpreter (tkinter). Install Python or WorkBuddy.
    pause
  )
  exit /b 1
)

REM Launch with the verified interpreter
start "" "%PYTHON%" "%~dp0control_panel_tk.py"
