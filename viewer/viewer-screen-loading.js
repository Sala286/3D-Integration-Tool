// Additional GLTFViewer methods (continued from viewer-screen-indicators.js)
GLTFViewer.prototype._clearLoadedModelsFallback = function() {
        // Minimal clear routine used before viewer-view.js registers the full clear()
        
        // Clear material manager data first
        if (this.materialManager && typeof this.materialManager.clear === 'function') {
            this.materialManager.clear();
        }
        
        if (this.boundaryBoxHelper) {
            this.scene.remove(this.boundaryBoxHelper);
            if (this.boundaryBoxHelper.geometry) this.boundaryBoxHelper.geometry.dispose();
            if (this.boundaryBoxHelper.material) this.boundaryBoxHelper.material.dispose();
            this.boundaryBoxHelper = null;
        }
        this.boundaryBoxVisible = false;
        this.boundaryBoxCenter = null;
        
        if (this.loadedModels && this.loadedModels.length > 0) {
            this.loadedModels.forEach(modelData => {
                if (modelData && modelData.model && this.scene) {
                    this.scene.remove(modelData.model);
                }
            });
        }
        this.loadedModels = [];
        
        if (this.mixers && this.mixers.length > 0) {
            this.mixers.forEach(mixer => {
                if (mixer && typeof mixer.stopAllAction === 'function') {
                    mixer.stopAllAction();
                }
            });
        }
        this.mixers = [];
        this.animations = [];
        
        if (this.originalMaterials && typeof this.originalMaterials.clear === 'function') {
            this.originalMaterials.clear();
        }
        this.selectedPartUUIDs = [];
        this.partsList = [];
        
        const treeContainer = document.getElementById('tree-container');
        if (treeContainer) {
            treeContainer.innerHTML = '<div id="tree-placeholder" style="padding: 20px; color: #999; text-align: center;">No model loaded. Open a GLTF/GLB file to see parts.</div>';
        }
        
        const searchContainer = document.getElementById('tree-search');
        if (searchContainer) {
            searchContainer.style.display = 'none';
        }
        const searchInput = document.getElementById('tree-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
    };
    
GLTFViewer.prototype._updateActiveCameraProjection = function(aspect) {
        if (!this.camera || !aspect || !isFinite(aspect)) {
            return;
        }
        
        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = aspect;
            this.camera.updateProjectionMatrix();
        } else if (this.camera.isOrthographicCamera) {
            const frustumHeight = this._orthoFrustumHeight || 10;
            const halfH = frustumHeight / 2;
            const halfW = halfH * aspect;
            this.camera.left = -halfW;
            this.camera.right = halfW;
            this.camera.top = halfH;
            this.camera.bottom = -halfH;
            this.camera.updateProjectionMatrix();
        }
    };
    
GLTFViewer.prototype._createOrthographicCamera = function(aspect) {
        const perspective = this.perspectiveCamera || this.camera || new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        const target = this.controls && this.controls.target
            ? this.controls.target.clone()
            : new THREE.Vector3(0, 0, 0);
        const distance = perspective.position.distanceTo(target) || 5;
        const frustumHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2));
        const halfH = frustumHeight / 2;
        const halfW = halfH * aspect;
        const ortho = new THREE.OrthographicCamera(
            -halfW, halfW, halfH, -halfH, perspective.near, perspective.far * 4
        );
        ortho.position.copy(perspective.position);
        ortho.quaternion.copy(perspective.quaternion);
        ortho.up.copy(perspective.up);
        this._orthoFrustumHeight = frustumHeight;
        this._orthoFrustumDistance = distance;
        return ortho;
    };
    
GLTFViewer.prototype._updatePerspectiveButtonState = function() {
        const btn = document.getElementById('perspective-btn');
        if (btn) {
            const isPerspective = this.cameraMode !== 'orthographic';
            btn.classList.toggle('active', isPerspective);
            btn.setAttribute('aria-pressed', isPerspective ? 'true' : 'false');
            btn.setAttribute('data-tooltip', isPerspective ? 'Perspective Projection' : 'Orthographic Projection');
        }
    };
    
GLTFViewer.prototype.togglePerspectiveMode = function() {
        const container = document.getElementById('container');
        if (!container) return;
        const canvasWidth = container.clientWidth - this.sidebarWidth;
        const canvasHeight = container.clientHeight;
        const aspect = canvasWidth / Math.max(canvasHeight, 1);
        
        if (this.cameraMode === 'perspective') {
            if (!this.orthographicCamera) {
                this.orthographicCamera = this._createOrthographicCamera(aspect);
            }
            this.orthographicCamera.position.copy(this.camera.position);
            this.orthographicCamera.quaternion.copy(this.camera.quaternion);
            this.orthographicCamera.up.copy(this.camera.up);
            this.orthographicCamera.zoom = 1;
            this.orthographicCamera.updateProjectionMatrix();
            this.camera = this.orthographicCamera;
            this.cameraMode = 'orthographic';
            const target = this.controls && this.controls.target ? this.controls.target : new THREE.Vector3(0, 0, 0);
            this._orthoFrustumDistance = this.camera.position.distanceTo(target);
            if (!this._orthoFrustumHeight) {
                this._orthoFrustumHeight = 2 * (this._orthoFrustumDistance || 5) * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera ? this.perspectiveCamera.fov / 2 : 45));
            }
            this._updateActiveCameraProjection(aspect);
        } else {
            if (!this.perspectiveCamera) {
                const persp = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
                this.perspectiveCamera = persp;
            }
            this.perspectiveCamera.position.copy(this.camera.position);
            this.perspectiveCamera.quaternion.copy(this.camera.quaternion);
            this.perspectiveCamera.up.copy(this.camera.up);
            this.camera = this.perspectiveCamera;
            this.cameraMode = 'perspective';
            this._updateActiveCameraProjection(aspect);
        }
        
        if (this.controls) {
            this.controls.object = this.camera;
            this.controls.update();
        }
        
        this.onWindowResize();
        this._updatePerspectiveButtonState();
        
        if (typeof this.updateRotationPivotIndicator === 'function') {
            this.updateRotationPivotIndicator();
        }
    };
    
GLTFViewer.prototype.checkIfDraco = function(gltf) {
        // Check if model uses Draco compression
        let isDraco = false;
        gltf.scene.traverse((object) => {
            if (object.isMesh && object.geometry) {
                const attributes = object.geometry.attributes;
                if (attributes.position && attributes.position.isInterleavedBufferAttribute) {
                    isDraco = true;
                }
            }
        });
        return isDraco;
    };
    
GLTFViewer.prototype.collectStats = function(object) {
        let vertices = 0;
        let faces = 0;
        let materials = new Set();
        let textures = new Set();
        
        object.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) {
                    const pos = child.geometry.attributes.position;
                    if (pos) {
                        vertices += pos.count;
                        faces += pos.count / 3;
                    }
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => materials.add(mat));
                    } else {
                        materials.add(child.material);
                    }
                    
                    // Check for textures
                    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
                    if (mat.map) textures.add(mat.map);
                    if (mat.normalMap) textures.add(mat.normalMap);
                    if (mat.roughnessMap) textures.add(mat.roughnessMap);
                    if (mat.metalnessMap) textures.add(mat.metalnessMap);
                }
            }
        });
        
        return {
            vertices: Math.floor(vertices),
            faces: Math.floor(faces),
            materials: materials.size,
            textures: textures.size
        };
    };
    
GLTFViewer.prototype.setupPreview = function() {
        // Create preview overlay elements if they don't exist
        let previewOverlay = document.getElementById('preview-overlay');
        if (!previewOverlay) {
            previewOverlay = document.createElement('div');
            previewOverlay.id = 'preview-overlay';
            const dimmer = document.createElement('div');
            dimmer.id = 'preview-dimmer';
            const previewBox = document.createElement('div');
            previewBox.id = 'preview-box';
            previewOverlay.appendChild(dimmer);
            previewOverlay.appendChild(previewBox);
            document.getElementById('container').appendChild(previewOverlay);
        }
        
        this.previewOverlay = previewOverlay;
        this.previewBox = document.getElementById('preview-box');
        
        // Update preview box position and size on window resize
        window.addEventListener('resize', () => {
            if (this.previewActive) {
                this.updatePreviewBox();
            }
        });
    };
    
GLTFViewer.prototype.updatePreviewBox = function() {
        if (!this.previewBox || !this.previewActive) return;
        
        const container = document.getElementById('container');
        const canvasWidth = container.clientWidth - this.sidebarWidth;
        const canvasHeight = container.clientHeight;
        
        // Calculate 4:3 aspect ratio box
        const aspectRatio = 4 / 3;
        let boxWidth, boxHeight;
        
        // Fit box within canvas (excluding sidebar)
        if (canvasWidth / canvasHeight > aspectRatio) {
            // Canvas is wider, height is limiting
            boxHeight = canvasHeight * 0.8; // 80% of canvas height
            boxWidth = boxHeight * aspectRatio;
        } else {
            // Canvas is taller, width is limiting
            boxWidth = canvasWidth * 0.8; // 80% of canvas width
            boxHeight = boxWidth / aspectRatio;
        }
        
        // Center the box
        const left = (canvasWidth - boxWidth) / 2;
        const top = (canvasHeight - boxHeight) / 2;
        
        this.previewBox.style.left = left + 'px';
        this.previewBox.style.top = top + 'px';
        this.previewBox.style.width = boxWidth + 'px';
        this.previewBox.style.height = boxHeight + 'px';
        
        // No dimming effect - just clear the dimmer
        const dimmer = document.getElementById('preview-dimmer');
        if (dimmer) {
            dimmer.innerHTML = '';
        }
    };
    
GLTFViewer.prototype.togglePreview = function() {
        this.previewActive = !this.previewActive;
        const btn = document.getElementById('preview-btn');
        
        if (this.previewActive) {
            // Show preview overlay
            if (this.previewOverlay) {
                this.previewOverlay.classList.add('active');
            }
            this.updatePreviewBox();
            
            if (btn) {
                btn.classList.add('active');
            }
        } else {
            // Hide preview overlay
            if (this.previewOverlay) {
                this.previewOverlay.classList.remove('active');
            }
            
            if (btn) {
                btn.classList.remove('active');
            }
        }
    };
    
    // Old capturePreviewImage method removed - now using image-capture.js module
GLTFViewer.prototype.capturePreviewImage = function() {
        // Delegate to new ImageCapture module
        if (this.imageCapture && typeof this.imageCapture.capturePreviewImage === 'function') {
            return this.imageCapture.capturePreviewImage();
        }
        return null;
    };
    
GLTFViewer.prototype.showLoading = function(message = 'Loading...') {
        const loading = document.getElementById('loading');
        loading.textContent = message;
        loading.classList.add('show');
    };
    
GLTFViewer.prototype.hideLoading = function() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.remove('show');
        }
    };
    
GLTFViewer.prototype.showError = function(message) {
        const error = document.getElementById('error');
        if (error) {
            error.textContent = message;
            error.classList.add('show');
            console.error('Viewer error:', message);
        }
    };
    
GLTFViewer.prototype.hideError = function() {
        const error = document.getElementById('error');
        if (error) {
            error.classList.remove('show');
        }
    };
    
GLTFViewer.prototype.setupManualControls = function() {
        // Simple manual controls if OrbitControls is not available
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            // Rotate camera around origin
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(this.camera.position);
            spherical.theta -= deltaX * 0.01;
            spherical.phi += deltaY * 0.01;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            
            this.camera.position.setFromSpherical(spherical);
            this.camera.lookAt(0, 0, 0);
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const distance = this.camera.position.length();
            const newDistance = distance * (1 + e.deltaY * 0.001);
            this.camera.position.normalize().multiplyScalar(Math.max(0.5, Math.min(100, newDistance)));
        });
    };
    
GLTFViewer.prototype.setupMessageListener = function() {
        // Listen for messages from Python
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.onLoadGLTF = (filePath) => {
                this.loadGLTF(filePath);
            };
            
            window.pywebview.api.onResetView = () => {
                if (typeof this.resetView === 'function') {
                    this.resetView();
                }
            };
            
            window.pywebview.api.onToggleWireframe = () => {
                if (typeof this.toggleWireframe === 'function') {
                    this.toggleWireframe();
                }
            };
            
            window.pywebview.api.onClear = () => {
                if (typeof this.clear === 'function') {
                    this.clear();
                }
            };
        }
    };

// Initialize viewer when page loads
let viewer;

// Check if file URL is in URL parameters
function getFileUrlFromParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('file') || null;
}

// Wait for Three.js to be available
function waitForThree(callback, maxWait = 50) {
    let waited = 0;
    function check() {
        if (typeof THREE !== 'undefined') {
            console.log('THREE.js is available');
            callback();
        } else if (waited < maxWait) {
            waited++;
            setTimeout(check, 100);
        } else {
            console.error('THREE.js not available after waiting');
            document.getElementById('error').textContent = 'Three.js not loaded. Please check three.min.js file.';
            document.getElementById('error').classList.add('show');
            document.getElementById('loading').classList.remove('show');
        }
    }
    check();
}

// Initialize when DOM is ready AND all scripts are loaded
// Check if scripts are already loaded (from index.html)
if (window.__viewerScriptsLoaded) {
    // Scripts already loaded, initialize immediately
    initViewer();
} else {
    // Wait for scripts to load or DOM to be ready
    const tryInit = () => {
        if (window.__viewerScriptsLoaded || document.readyState === 'complete') {
            // Wait a bit more to ensure all scripts are parsed
            setTimeout(() => {
                if (!window.__viewerInitialized) {
    initViewer();
                }
            }, 100);
        } else {
            setTimeout(tryInit, 50);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
}

function initViewer() {
    // Prevent multiple initializations
    if (window.__viewerInitialized) {
        console.log('Viewer already initialized, skipping...');
        return;
    }
    
    console.log('Initializing viewer...');
    // Wait for Three.js to load
    waitForThree(() => {
        // Wait a bit more for loaders and all scripts to be parsed
        setTimeout(() => {
            try {
                viewer = new GLTFViewer();
                window.viewer = viewer; // Make viewer globally accessible
                window.__viewerInitialized = true; // Mark as initialized

                const initialRotationMode = window.__rotationModePreference || 'screen';
                if (viewer && typeof viewer.setRotationPivotMode === 'function') {
                    viewer.setRotationPivotMode(initialRotationMode);
                } else if (viewer) {
                    viewer.rotationPivotMode = initialRotationMode;
                }
                console.log('Viewer initialized');
                
                // Check for file in URL parameters
                const fileUrl = getFileUrlFromParams();
                if (fileUrl) {
                    // Decode the file URL - handle multiple encoding (some files might be double-encoded)
                    let decodedUrl = fileUrl;
                    try {
                        decodedUrl = decodeURIComponent(fileUrl);
                        // Try decoding again if it looks encoded (contains %)
                        if (decodedUrl.includes('%')) {
                            try {
                                decodedUrl = decodeURIComponent(decodedUrl);
                            } catch (e) {
                                // Already decoded, use as-is
                            }
                        }
                    } catch (e) {
                        console.warn('Error decoding URL, using original:', e);
                        decodedUrl = fileUrl;
                    }
                    
                    console.log('Loading file from URL:', decodedUrl);
                    
                    // Build full URL properly
                    let fullUrl;
                    if (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://')) {
                        fullUrl = decodedUrl;
                    } else if (decodedUrl.startsWith('/')) {
                        fullUrl = window.location.origin + decodedUrl;
                    } else {
                        fullUrl = window.location.origin + '/' + decodedUrl;
                    }
                    
                    console.log('Resolved file URL:', fullUrl);
                    
                    // Load the file after ensuring viewer is ready
                    setTimeout(() => {
                        if (viewer) {
                            console.log('Calling loadGLTF...');
                            viewer.loadGLTF(fullUrl);
                        } else {
                            console.error('Viewer not initialized');
                        }
                    }, 1000);
                } else {
                    console.log('No file URL in parameters');
                    document.getElementById('loading').textContent = 'Ready - No file loaded';
                }
            } catch (e) {
                console.error('Error initializing viewer:', e);
                document.getElementById('error').textContent = 'Error: ' + e.message;
                document.getElementById('error').classList.add('show');
                document.getElementById('loading').classList.remove('show');
            }
        }, 500);
    });
}

// Function to request file selection from desktop app
async function requestAddModel() {
    if (!viewer) {
        console.error('Viewer not initialized');
        return;
    }
    
    // Get server port from current URL
    const serverPort = window.location.port || '8765';
    const apiUrl = `http://localhost:${serverPort}/api/add-model`;
    
    // Show loading state
    if (typeof viewer.showLoading === 'function') {
        viewer.showLoading('Requesting file selection from desktop app...');
    }
    
    try {
        // Send POST request to desktop app
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success && result.fileUrl) {
            // Build full URL for the file
            const fullFileUrl = `http://localhost:${serverPort}${result.fileUrl}`;
            const fileName = result.fileName;
            
            // Load the model with addMode=true
            if (viewer) {
                viewer.loadGLTF(fullFileUrl, fileName, true);
            }
            
            // Update the browser URL so refresh keeps the same file
            updateBrowserUrl(result.fileUrl);
        } else {
            // User cancelled or error - just hide loading, don't show error message
            if (typeof viewer.hideLoading === 'function') {
                viewer.hideLoading();
            }
            // Hide any existing error message
            if (typeof viewer.hideError === 'function') {
                viewer.hideError();
            }
            // Silently handle cancellation - don't show error message
            // Only show error if it's an actual error (not a cancellation)
            const errorMsg = result.error ? result.error.toLowerCase() : '';
            const isCancellation = !result.error || 
                                  errorMsg.includes('cancelled') || 
                                  errorMsg.includes('cancel') ||
                                  errorMsg.includes('no file selected') ||
                                  errorMsg.includes('file selection cancelled') ||
                                  !result.success; // If success is false and no error, treat as cancellation
            
            if (!isCancellation && result.error) {
                // Only show error if it's not a cancellation
                if (typeof viewer.showError === 'function') {
                    viewer.showError(result.error);
                } else {
                    console.log('File selection failed:', result.error);
                }
            }
            // If it's a cancellation, do nothing - just hide loading silently
        }
    } catch (error) {
        console.error('Error requesting file selection:', error);
        if (typeof viewer.hideLoading === 'function') {
            viewer.hideLoading();
        }
        // Only show error for actual communication failures, not cancellations
        // Check if it's a network error (not a cancellation)
        if (error.name !== 'AbortError' && !error.message.includes('cancelled')) {
            if (typeof viewer.showError === 'function') {
                viewer.showError('Failed to communicate with desktop app. Please ensure the desktop app is running.');
            }
        }
    }
}

function updateBrowserUrl(relativeFileUrl) {
    try {
        if (!relativeFileUrl) {
            return;
        }
        const encoded = encodeURIComponent(relativeFileUrl);
        const base = window.location.origin + window.location.pathname;
        const newUrl = `${base}?file=${encoded}`;
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState({}, '', newUrl);
        }
    } catch (err) {
        console.warn('Unable to update browser URL:', err);
    }
}

// Handle file input
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const addFileInput = document.getElementById('add-file-input');
    
    // Load Model button - replaces existing models (can use file input or HTTP)
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const fileUrl = URL.createObjectURL(file);
                const fileName = file.name;
                if (viewer) {
                    viewer.loadGLTF(fileUrl, fileName, false);
                } else {
                    // Wait for viewer to initialize
                    setTimeout(() => {
                        if (viewer) {
                            viewer.loadGLTF(fileUrl, fileName, false);
                        }
                    }, 1000);
                }
            }
            // Reset input to allow selecting same file again
            e.target.value = '';
        });
    }
    
    // Add Model button - request from desktop app via HTTP
    // Note: The button in index.html should call requestAddModel() instead of file input
    // Keeping this for fallback if needed
    if (addFileInput) {
        addFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const fileUrl = URL.createObjectURL(file);
                const fileName = file.name;
                if (viewer) {
                    viewer.loadGLTF(fileUrl, fileName, true);
                } else {
                    // Wait for viewer to initialize
                    setTimeout(() => {
                        if (viewer) {
                            viewer.loadGLTF(fileUrl, fileName, true);
                        }
                    }, 1000);
                }
            }
            // Reset input to allow selecting same file again
            e.target.value = '';
        });
    }
});


