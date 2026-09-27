@echo off
title Local AI Document Converter - Control Panel
setlocal enabledelayedexpansion

:: Get current folder path of the batch file
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ======================================================================
echo           Local AI Bank Statement and Document Converter Setup
echo ======================================================================
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found in your system PATH.
    echo Please download and install Python 3.10+ from: https://www.python.org/downloads/
    echo Make sure to check the box "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not found in your system PATH.
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Python and Node.js are installed.
echo.

:: Setup Backend
echo Checking Python virtual environment...
set USE_VENV=1

if not exist "backend\venv" (
    echo [INFO] Attempting to create virtual environment in backend\venv...
    python -m venv "backend\venv" >nul 2>&1
)

:: Test if virtual environment Python works (to check for Device Guard/AppLocker blocking)
if exist "backend\venv\Scripts\python.exe" (
    "backend\venv\Scripts\python.exe" -c "import sys" >nul 2>&1
    if !errorlevel! neq 0 (
        echo [WARNING] Virtual environment python was blocked by Device Guard or system policy.
        echo [INFO] Falling back to global system Python interpreter.
        set USE_VENV=0
    )
) else (
    set USE_VENV=0
)

if "!USE_VENV!"=="1" (
    echo [INFO] Installing/Updating Python dependencies inside virtual environment...
    call "backend\venv\Scripts\activate.bat"
    python -m pip install --upgrade pip
    python -m pip install -r "backend\requirements.txt"
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install backend dependencies in virtual environment.
        call deactivate
        pause
        exit /b 1
    )
    call deactivate
) else (
    echo [INFO] Installing/Updating Python dependencies globally/user-level...
    python -m pip install --upgrade pip
    python -m pip install --user -r "backend\requirements.txt"
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install backend dependencies.
        pause
        exit /b 1
    )
)

:: Setup Frontend
echo Checking Node modules...
if not exist "frontend\node_modules" (
    echo [INFO] Installing frontend npm packages...
    cd /d "%ROOT_DIR%frontend"
    call npm install --legacy-peer-deps
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to install frontend npm packages.
        cd /d "%ROOT_DIR%"
        pause
        exit /b 1
    )
    cd /d "%ROOT_DIR%"
)

echo.
echo ======================================================================
echo Setup completed successfully! Starting services...
echo ======================================================================
echo.

:: Start Services
call :StartBackend
call :StartFrontend

echo Waiting for services to initialize...
timeout /t 6 /nobreak >nul

echo Opening web browser...
start http://localhost:3000

:: Dashboard Loop
:Dashboard
cd /d "%ROOT_DIR%"
cls
echo ======================================================================
echo                 Local AI Converter Dashboard
echo ======================================================================
echo.
echo   [+] Backend Service: Running (Port 8000)
echo   [+] Frontend Web App: Running (Port 3000)
echo.
echo   Press [1] to open the Web App in your browser again
echo   Press [2] to restart the Backend Service
echo   Press [3] to restart the Frontend Service
echo   Press [4] to stop all services and exit cleanly
echo.
echo ======================================================================
echo.

set /p choice="Enter choice (1-4): "

if "%choice%"=="1" (
    start http://localhost:3000
    goto Dashboard
)
if "%choice%"=="2" (
    echo Restarting Backend...
    call :StopBackend
    call :StartBackend
    timeout /t 3 /nobreak >nul
    goto Dashboard
)
if "%choice%"=="3" (
    echo Restarting Frontend...
    call :StopFrontend
    call :StartFrontend
    timeout /t 3 /nobreak >nul
    goto Dashboard
)
if "%choice%"=="4" (
    echo Stopping all services...
    call :StopBackend
    call :StopFrontend
    echo.
    echo Services stopped successfully.
    timeout /t 2 /nobreak >nul
    exit /b 0
)

echo Invalid choice. Please select 1, 2, 3, or 4.
timeout /t 2 /nobreak >nul
goto Dashboard


:: Helper functions

:StartBackend
echo Starting Backend Service...
if "%USE_VENV%"=="1" (
    start "Local AI Backend" cmd /c "cd /d "%ROOT_DIR%backend" && call venv\Scripts\activate.bat && python run.py"
) else (
    start "Local AI Backend" cmd /c "cd /d "%ROOT_DIR%backend" && python run.py"
)
exit /b 0

:StartFrontend
echo Starting Frontend Service...
start "Local AI Frontend" cmd /c "cd /d "%ROOT_DIR%frontend" && npm run dev"
exit /b 0

:StopBackend
echo Stopping Backend Service...
taskkill /fi "windowtitle eq Local AI Backend*" /f /t >nul 2>&1
:: Also force-kill any process listening on port 8000 to prevent port binding conflicts
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
exit /b 0

:StopFrontend
echo Stopping Frontend Service...
taskkill /fi "windowtitle eq Local AI Frontend*" /f /t >nul 2>&1
:: Also force-kill any process listening on port 3000 to prevent port binding conflicts
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)
exit /b 0
