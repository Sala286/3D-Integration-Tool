# ES Module Compatibility Issue

## Problem
The Three.js loader files (GLTFLoader.js, DRACOLoader.js, OrbitControls.js) are ES module versions that use `import`/`export` syntax. These require:
1. All dependencies to be available
2. Proper module resolution
3. Browser ES module support

## Current Issue
GLTFLoader.js imports from `../utils/BufferGeometryUtils.js` which may not exist in your setup.

## Solutions

### Option 1: Use CDN Versions (Easiest)

Replace the local files with CDN versions in `index.html`:

```html
<!-- Use from CDN -->
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/"
  }
}
</script>

<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

window.THREE = THREE;
window.THREE.GLTFLoader = GLTFLoader;
window.THREE.DRACOLoader = DRACOLoader;
window.THREE.OrbitControls = OrbitControls;
</script>
```

**Note**: This requires internet connection. For offline, download all dependencies.

### Option 2: Download Browser-Compatible Versions

Download UMD (Universal Module Definition) versions that work without ES modules:

1. Look for "examples/js/loaders/" versions (legacy, but browser-compatible)
2. Or use a bundler to convert ES modules to browser-compatible code

### Option 3: Fix Missing Dependencies

If using ES modules, ensure all dependencies exist:
- `BufferGeometryUtils.js` from Three.js examples/utils/
- All other imported utilities

## Quick Fix for Testing

For now, the HTML has been updated to use ES modules. If errors occur:
1. Open browser console (F12)
2. Check error messages
3. Download missing dependencies or use CDN version

