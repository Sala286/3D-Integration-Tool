# Fix "Loading..." Issue

## Problem
Browser shows "Loading..." but model doesn't appear. This is because:

1. **ES Module Incompatibility**: GLTFLoader.js, DRACOLoader.js, OrbitControls.js are ES module versions that import from 'three' as ES module
2. **three.min.js is UMD**: The three.min.js file is a UMD bundle, not an ES module
3. **Module Resolution**: ES modules can't directly import from UMD bundles

## Quick Fix Options

### Option 1: Download three.module.js (Recommended)

1. Download `three.module.js` instead of `three.min.js`:
   - URL: https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js
   - Save as: `viewer/three.module.js`

2. Update `index.html` to use three.module.js:
   ```html
   <script type="module">
   import * as THREE from './three.module.js';
   window.THREE = THREE;
   // ... rest of code
   </script>
   ```

### Option 2: Download Browser-Compatible Loaders

Download UMD/browser versions of loaders from Three.js legacy examples:
- Look for `examples/js/loaders/GLTFLoader.js` (older but browser-compatible)
- These don't use ES modules

### Option 3: Use CDN (Requires Internet)

Update `index.html` to load from CDN:
```html
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/GLTFLoader.js';
// ... etc
</script>
```

## Current Status

The HTML has been updated to handle ES modules, but you need either:
- `three.module.js` file, OR
- Browser-compatible UMD versions of loaders

## Check Browser Console

Open browser console (F12) and check for:
- Module resolution errors
- Missing file errors
- Import errors

The console will show exactly what's missing.

