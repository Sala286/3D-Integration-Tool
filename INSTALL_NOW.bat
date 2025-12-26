@echo off
echo Installing 3D Rendering Libraries...
echo.

python -m pip install PyOpenGL PyOpenGL-accelerate trimesh numpy

echo.
echo Installation complete!
echo.
echo Please restart the application to see 3D models.
pause

