@echo off
echo Installing GLTF Viewer dependencies...
echo.

REM Maintain pip at version 25.2
echo Ensuring pip version 25.2...
python -m pip install pip==25.2 --quiet --disable-pip-version-check

REM Install required packages
echo Installing application dependencies...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check

if errorlevel 1 (
    echo.
    echo Installation failed!
    echo.
    echo Note: If you see pythonnet build errors, pywebview will use
    echo alternative backends that don't require pythonnet.
    echo.
    pause
    exit /b 1
)

echo.
echo Installation complete!
echo.
echo Note: pip is maintained at version 25.2
echo.
pause

