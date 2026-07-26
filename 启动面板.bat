@echo off
cd /d "%~dp0"

REM Find a Python interpreter (pythonw preferred, no black window) that can
REM actually create a Tk window. Import alone is not enough: some managed
REM pythons import tkinter but lack a working tcl/tk runtime and crash silently
REM under pythonw. We test each candidate with a real Tk() round-trip.
REM
REM Selection priority:
REM   1) User-installed Python at the standard location (most reliable, full tcl/tk)
REM   2) pythonw in PATH
REM   3) python in PATH (shows a console window, but works)
REM   4) WorkBuddy managed pythonw (any version) - last resort

set "PYTHON="

REM 1) User-installed Python (standard installer path)
for /d %%d in ("C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python*") do (
  if not defined PYTHON (
    if exist "%%d\pythonw.exe" (
      "%%d\pythonw.exe" -c "import tkinter; r=tkinter.Tk(); r.withdraw(); r.destroy()" >nul 2>nul
      if not errorlevel 1 set "PYTHON=%%d\pythonw.exe"
    )
  )
)

REM 2) pythonw in PATH
if not defined PYTHON (
  where pythonw >nul 2>nul
  if not errorlevel 1 (
    pythonw -c "import tkinter; r=tkinter.Tk(); r.withdraw(); r.destroy()" >nul 2>nul
    if not errorlevel 1 set "PYTHON=pythonw"
  )
)

REM 3) python in PATH (console window, but works)
if not defined PYTHON (
  where python >nul 2>nul
  if not errorlevel 1 (
    python -c "import tkinter; r=tkinter.Tk(); r.withdraw(); r.destroy()" >nul 2>nul
    if not errorlevel 1 set "PYTHON=python"
  )
)

REM 4) WorkBuddy managed pythonw (any version) - last resort
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

REM KDOCS_NO_RELAUNCH: run main() directly in the chosen interpreter (no silent
REM re-launch into a possibly-broken pythonw). The launcher fully owns selection.
set "KDOCS_NO_RELAUNCH=1"
start "" "%PYTHON%" "%~dp0control_panel_tk.py"
