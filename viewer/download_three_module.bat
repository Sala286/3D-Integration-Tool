@echo off
echo Downloading three.module.js for ES module compatibility...
echo.

REM Download three.module.js (ES module version)
curl -L -o three.module.js "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js"

if exist three.module.js (
    echo.
    echo Success! three.module.js downloaded.
    echo Now update index.html to use three.module.js instead of three.min.js
) else (
    echo.
    echo Error: Failed to download three.module.js
    echo Please download manually from:
    echo https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js
    echo Save as: viewer/three.module.js
)

pause

