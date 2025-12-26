/**
 * GLTF Viewer - Random Colour Viewing Module
 * Applies temporary random colours to meshes for visual inspection only.
 */

(function() {
    if (typeof GLTFViewer === 'undefined') {
        console.warn('Random colour module: GLTFViewer is not defined.');
        return;
    }
    
    const proto = GLTFViewer.prototype;
    
    const ensureState = (viewer) => {
        if (!viewer.randomColorMaterialMap) {
            viewer.randomColorMaterialMap = new Map();
        }
        if (typeof viewer.randomColorsEnabled !== 'boolean') {
            viewer.randomColorsEnabled = false;
        }
        if (typeof viewer._randomColorsPaused !== 'boolean') {
            viewer._randomColorsPaused = false;
        }
    };
    
    const originalClear = proto.clear;
    proto.clear = function() {
        if (this.randomColorMaterialMap && this.randomColorMaterialMap.size > 0) {
            this.restoreRandomColors({ disposeRandom: true, clearMap: true, silent: true });
        }
        if (typeof originalClear === 'function') {
            return originalClear.apply(this, arguments);
        }
    };
    
    proto.toggleRandomColors = function(forceValue = null) {
        ensureState(this);
        const targetState = (typeof forceValue === 'boolean') ? forceValue : !this.randomColorsEnabled;
        this.setRandomColorsEnabled(targetState);
    };
    
    proto.setRandomColorsEnabled = function(enabled, options = {}) {
        ensureState(this);
        const { silent = false, force = false } = options;
        if (!force && enabled === this.randomColorsEnabled) {
            return;
        }
        
        if (enabled) {
            this.randomColorMaterialMap.clear();
            this.randomColorsEnabled = true;
            this.applyRandomColors({ skipExisting: false });
        } else {
            this.randomColorsEnabled = false;
            this.restoreRandomColors({ disposeRandom: true, clearMap: true, silent: true });
        }
        
        if (!silent) {
            this.updateRandomColorButtonState();
        }
    };
    
    proto.applyRandomColors = function(options = {}) {
        ensureState(this);
        const skipExisting = options.skipExisting ?? false;
        if (!this.loadedModels || this.loadedModels.length === 0) {
            return;
        }
        this.loadedModels.forEach(modelData => {
            this._applyRandomColorsToObject(modelData.model, { skipExisting });
        });
    };
    
    proto._applyRandomColorsToObject = function(object, options = {}) {
        ensureState(this);
        if (!object) return;
        const skipExisting = options.skipExisting ?? true;
        object.traverse(child => {
            if (!child.isMesh || !child.material) return;
            if (skipExisting && this.randomColorMaterialMap.has(child.uuid)) {
                return;
            }
            
            if (!skipExisting && this.randomColorMaterialMap.has(child.uuid)) {
                const existing = this.randomColorMaterialMap.get(child.uuid);
                if (existing) {
                    child.material = existing.original;
                    this._disposeMaterial(existing.random);
                    this.randomColorMaterialMap.delete(child.uuid);
                }
            }
            
            const originalMaterial = child.material;
            const randomMaterial = this._createRandomColorMaterial(originalMaterial);
            this.randomColorMaterialMap.set(child.uuid, {
                original: originalMaterial,
                random: randomMaterial
            });
            child.material = randomMaterial;
        });
    };
    
    proto._createRandomColorMaterial = function(material) {
        const randomColor = new THREE.Color().setHSL(Math.random(), 0.65, 0.5);
        return this._cloneMaterialWithColor(material, randomColor);
    };
    
    proto._cloneMaterialWithColor = function(material, color) {
        if (Array.isArray(material)) {
            return material.map(mat => this._cloneSingleMaterialWithColor(mat, color));
        }
        return this._cloneSingleMaterialWithColor(material, color);
    };
    
    proto._cloneSingleMaterialWithColor = function(material, color) {
        let cloned;
        if (material && typeof material.clone === 'function') {
            cloned = material.clone();
        } else {
            cloned = new THREE.MeshStandardMaterial();
        }
        if (cloned.color && cloned.color.isColor) {
            cloned.color.copy(color);
        } else {
            cloned.color = color.clone();
        }
        cloned.map = null;
        cloned.emissiveMap = null;
        cloned.lightMap = null;
        cloned.roughnessMap = null;
        cloned.metalnessMap = null;
        cloned.alphaMap = null;
        cloned.needsUpdate = true;
        return cloned;
    };
    
    proto._disposeMaterial = function(material) {
        if (!material) return;
        if (Array.isArray(material)) {
            material.forEach(mat => this._disposeMaterial(mat));
            return;
        }
        if (typeof material.dispose === 'function') {
            material.dispose();
        }
    };
    
    proto.restoreRandomColors = function(options = {}) {
        ensureState(this);
        const { disposeRandom = true, clearMap = true, silent = false } = options;
        if (!this.randomColorMaterialMap || this.randomColorMaterialMap.size === 0) {
            if (!silent) {
                this.updateRandomColorButtonState();
            }
            return;
        }
        this.randomColorMaterialMap.forEach((data, uuid) => {
            if (!data || !data.original) return;
            const mesh = this.scene ? this.scene.getObjectByProperty('uuid', uuid) : null;
            if (!mesh) return;
            if (mesh.material !== data.original) {
                if (disposeRandom) {
                    this._disposeMaterial(mesh.material);
                }
                mesh.material = data.original;
            }
            if (disposeRandom && data.random) {
                this._disposeMaterial(data.random);
            }
        });
        if (clearMap) {
            this.randomColorMaterialMap.clear();
        }
        if (!silent) {
            this.updateRandomColorButtonState();
        }
    };
    
    proto.reapplyStoredRandomColors = function() {
        ensureState(this);
        if (!this.randomColorMaterialMap || this.randomColorMaterialMap.size === 0) {
            return;
        }
        this.randomColorMaterialMap.forEach((data, uuid) => {
            if (!data || !data.random) return;
            const mesh = this.scene ? this.scene.getObjectByProperty('uuid', uuid) : null;
            if (!mesh) return;
            mesh.material = data.random;
        });
    };
    
    proto.pauseRandomColors = function() {
        ensureState(this);
        if (!this.randomColorsEnabled || this._randomColorsPaused || !this.randomColorMaterialMap || this.randomColorMaterialMap.size === 0) {
            return null;
        }
        this._randomColorsPaused = true;
        this.restoreRandomColors({ disposeRandom: false, clearMap: false, silent: true });
        const resume = () => {
            this._randomColorsPaused = false;
            this.reapplyStoredRandomColors();
        };
        return resume;
    };
    
    proto.updateRandomColorButtonState = function() {
        const btn = document.getElementById('random-color-btn');
        if (!btn) return;
        if (this.randomColorsEnabled) {
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-pressed', 'false');
        }
    };
    
    window.toggleRandomColors = function(forceValue = null) {
        if (window.viewer && typeof window.viewer.toggleRandomColors === 'function') {
            window.viewer.toggleRandomColors(forceValue);
        }
    };
})();

