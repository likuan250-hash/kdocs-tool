@echo off
cd /d "%~dp0"
echo ============================================
echo   Kdocs Tool - Panel Debug (console mode)
echo   Errors / traceback will show below.
echo ============================================
echo.
python control_panel_tk.py
echo.
echo --------------------------------------------
echo Panel exited with code %errorlevel%.
echo If "python" is not recognized, Python is NOT installed.
echo Install Python with "tcl/tk and IDLE" + "Add to PATH" checked.
echo --------------------------------------------
echo.
pause
