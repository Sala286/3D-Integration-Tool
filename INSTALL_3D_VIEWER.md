# How to Make 3D Model Visible

## Problem
The 3D model is loaded but not visible in the viewer. This is because we need 3D rendering libraries.

## Solution Options

### Option 1: Install Python 3D Rendering Libraries (Recommended - No Browser)

**Install required packages:**
```bash
pip install PyOpenGL PyOpenGL-accelerate trimesh numpy
```

**After installation:**
- Restart the application
- The OpenGL-based viewer will automatically be used
- Models will render directly in the application window
- No browser window needed
- No Three.js libraries needed

**Pros:**
- Fully embedded in application
- No external dependencies
- Works offline
- Native Python rendering

**Cons:**
- Requires installation of additional packages
- May not support all GLTF features (animations, complex materials)

### Option 2: Download Three.js Libraries (Browser-based)

If you prefer web-based rendering with full GLTF support:

**Download these files to `viewer/` directory:**
1. `three.min.js` - https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js
2. `GLTFLoader.js` - Browser-compatible version needed
3. `DRACOLoader.js` - For Draco compression support
4. `OrbitControls.js` - For camera controls
5. `draco_decoder_gltf.js` - https://www.gstatic.com/draco/v1/decoders/draco_decoder_gltf.js

**After downloading:**
- The browser-based viewer will work
- Models will open in your default browser
- Full GLTF feature support

**Pros:**
- Full GLTF feature support
- High-quality rendering
- Works with all GLTF features

**Cons:**
- Opens in separate browser window
- Requires Three.js library downloads

## Quick Fix (Option 1 - Recommended)

Run this command to install native 3D rendering:

```bash
pip install PyOpenGL PyOpenGL-accelerate trimesh numpy
```

Then restart the application. The model should now be visible!

## Check Current Status

Run this to check what's available:
```bash
python check_libraries.py
```

This will tell you:
- Which libraries are missing
- What viewer mode will be used
- What you need to install

