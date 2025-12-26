@echo off
echo Building GLTF Viewer Application...
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed or not in PATH
    echo Please install Python 3.14+ from https://python.org
    pause
    exit /b 1
)

REM Check if PyInstaller is installed
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo PyInstaller is not installed
    echo Installing PyInstaller...
    pip install PyInstaller
)

REM Run PyInstaller with spec file
echo Running PyInstaller...
python -m PyInstaller GLTFViewer.spec

if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Build complete! Executable is in the 'dist' folder.
pause

