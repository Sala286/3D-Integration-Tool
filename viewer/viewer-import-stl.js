/**
 * GLTF Viewer - STL Import Module
 * Adds STL import capability via the desktop app (API) with local file fallback.
 */

(function () {
    if (typeof GLTFViewer === 'undefined') {
        return;
    }

    const IMPORT_MESSAGE = 'Importing STL file...';

    const getDisplayName = (fileName) => {
        if (!fileName) {
            return 'Imported STL';
        }
        return fileName.replace(/\.stl$/i, '') || 'Imported STL';
    };

    const ensureLoaderAvailable = () => {
        if (typeof THREE.STLLoader === 'undefined') {
            alert('STLLoader is not available. Please ensure STLLoader.js is loaded.');
            return false;
        }
        return true;
    };

    const showViewerMessage = (message) => {
        if (typeof viewer !== 'undefined' && viewer && typeof viewer.showLoading === 'function') {
            viewer.showLoading(message);
        }
    };

    const hideViewerMessage = () => {
        if (typeof viewer !== 'undefined' && viewer && typeof viewer.hideLoading === 'function') {
            viewer.hideLoading();
        }
    };

    const ensureViewerReady = () => {
        if (typeof viewer === 'undefined' || !viewer) {
            alert('Viewer not ready. Please wait for initialization.');
            return false;
        }
        return true;
    };

    GLTFViewer.prototype._createSTLObjectFromGeometry = function (geometry, sourceName) {
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.05,
            roughness: 0.75,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;

        const root = new THREE.Group();
        const displayName = getDisplayName(sourceName);
        root.name = displayName;
        mesh.name = displayName;
        root.add(mesh);

        return { root, displayName };
    };

    GLTFViewer.prototype._finalizeSTLImport = function (modelRoot, fileName, displayName, addMode) {
        if (!modelRoot) {
            return;
        }

        if (!addMode && typeof this.clear === 'function') {
            this.clear();
        }

        if (!this.loadedModels) {
            this.loadedModels = [];
        }

        const modelUuid = THREE.MathUtils.generateUUID();
        this.scene.add(modelRoot);
        this.loadedModels.push({
            model: modelRoot,
            fileName,
            name: displayName,
            uuid: modelUuid,
            source: 'stl'
        });

        if (this.randomColorsEnabled && typeof this._applyRandomColorsToObject === 'function') {
            this._applyRandomColorsToObject(modelRoot, { skipExisting: true });
        }

        this._fitCameraToImportedModel(modelRoot, addMode);

        if (typeof this.buildPartsTree === 'function') {
            this.buildPartsTree();
        }

        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
    };

    GLTFViewer.prototype._fitCameraToImportedModel = function (modelRoot, addMode) {
        const container = document.getElementById('container');
        if (!container || !this.camera || !this.renderer) {
            return;
        }

        const canvasWidth = Math.max(1, container.clientWidth - this.sidebarWidth);
        const canvasHeight = Math.max(1, container.clientHeight);
        const aspect = canvasWidth / canvasHeight;

        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);

        const boundingBox = new THREE.Box3().setFromObject(modelRoot);
        const center = boundingBox.getCenter(new THREE.Vector3());
        const size = boundingBox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const distance = maxDim * 2.8;

        if (this.loadedModels.length === 1 || !addMode) {
            this.camera.position.set(
                center.x - distance,
                center.y + distance,
                center.z + distance
            );
            this.camera.lookAt(center);

            if (this.controls) {
                this.controls.target.copy(center);
                this.controls.update();
            }
        } else if (typeof this.fitScreen === 'function') {
            this.fitScreen();
        }
    };

    GLTFViewer.prototype._handleSTLBuffer = function (buffer, sourceName, options = {}) {
        const { addMode = true } = options;

        if (!ensureLoaderAvailable()) {
            return;
        }

        const loader = new THREE.STLLoader();
        const geometry = loader.parse(buffer);

        if (!geometry || !geometry.attributes || !geometry.attributes.position) {
            throw new Error('Invalid STL geometry.');
        }

        const { root, displayName } = this._createSTLObjectFromGeometry(geometry, sourceName);
        this._finalizeSTLImport(root, sourceName, displayName, addMode);
    };

    GLTFViewer.prototype.importSTLFromFile = function (file, options = {}) {
        if (!file) {
            return;
        }

        const { addMode = true } = options;

        const reader = new FileReader();
        reader.onerror = () => {
            hideViewerMessage();
            alert('Failed to read STL file.');
        };

        showViewerMessage(IMPORT_MESSAGE);

        reader.onload = (event) => {
            try {
                this._handleSTLBuffer(event.target.result, file.name || 'Imported STL', { addMode });
            } catch (error) {
                console.error('STL import failed:', error);
                alert('Failed to import STL file. Please verify the file contents.');
            } finally {
                hideViewerMessage();
            }
        };

        reader.readAsArrayBuffer(file);
    };

    GLTFViewer.prototype.importSTLFromUrl = async function (url, fileName, options = {}) {
        const { addMode = true } = options;

        if (!url) {
            return;
        }

        showViewerMessage(IMPORT_MESSAGE);

        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Failed to download STL file (status ${response.status})`);
            }
            const buffer = await response.arrayBuffer();
            this._handleSTLBuffer(buffer, fileName || 'Imported STL', { addMode });
        } catch (error) {
            console.error('STL import failed:', error);
            alert('Failed to import STL file. Please verify the file contents.');
        } finally {
            hideViewerMessage();
        }
    };

    const legacyInputFallback = () => {
        const input = document.getElementById('import-stl-input');
        if (input) {
            input.click();
        } else {
            alert('Import STL is unavailable. Please ensure the desktop app is running.');
        }
    };

    const requestImportSTLFromDesktop = async () => {
        if (!ensureViewerReady()) {
            return;
        }

        const serverPort = window.location.port || '8765';
        const apiUrl = `http://localhost:${serverPort}/api/import-stl`;

        showViewerMessage('Requesting STL file from desktop app...');

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const result = await response.json();

            if (result.success && result.fileUrl) {
                hideViewerMessage();
                const fullFileUrl = `http://localhost:${serverPort}${result.fileUrl}`;
                await viewer.importSTLFromUrl(fullFileUrl, result.fileName, { addMode: true });
            } else {
                hideViewerMessage();
                const errorMsg = (result.error || '').toLowerCase();
                const isCancellation = !result.error ||
                    errorMsg.includes('cancel') ||
                    errorMsg.includes('no file selected');

                if (!isCancellation && result.error) {
                    alert(result.error);
                }
            }
        } catch (error) {
            console.warn('Desktop STL import unavailable, falling back to local file:', error);
            hideViewerMessage();
            legacyInputFallback();
        }
    };

    window.openImportSTLDialog = function () {
        requestImportSTLFromDesktop();
    };

    document.addEventListener('DOMContentLoaded', () => {
        const importInput = document.getElementById('import-stl-input');
        if (!importInput) {
            return;
        }

        importInput.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }

            const addMode = true;

            const invokeImport = () => {
                if (ensureViewerReady()) {
                    viewer.importSTLFromFile(file, { addMode });
                }
            };

            if (typeof viewer === 'undefined' || !viewer) {
                setTimeout(invokeImport, 500);
            } else {
                invokeImport();
            }

            event.target.value = '';
        });
    });
})();

