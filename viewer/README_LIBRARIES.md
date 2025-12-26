# Three.js Libraries Required

The following JavaScript libraries need to be placed in this directory:

1. **three.min.js** - Three.js core library
   - Download from: https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js
   - Or: https://github.com/mrdoob/three.js/releases

2. **GLTFLoader.js** - GLTF file loader
   - Download from: https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/GLTFLoader.js
   - Save as: GLTFLoader.js

3. **DRACOLoader.js** - Draco compression decoder
   - Download from: https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/DRACOLoader.js
   - Save as: DRACOLoader.js

4. **OrbitControls.js** - Camera controls
   - Download from: https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/controls/OrbitControls.js
   - Save as: OrbitControls.js

5. **draco_decoder_gltf.js** - Draco decoder worker (for DRACOLoader)
   - Download from: https://www.gstatic.com/draco/v1/decoders/draco_decoder_gltf.js
   - Place in this directory

6. **draco_decoder_gltf.wasm** - Draco decoder WASM (optional, faster)
   - Download from: https://www.gstatic.com/draco/v1/decoders/draco_decoder_gltf.wasm
   - Place in this directory

Note: These files will be bundled with the executable by PyInstaller, so they work offline.

