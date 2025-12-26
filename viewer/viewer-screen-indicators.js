// Additional GLTFViewer methods (continued from viewer-screen-core.js)
GLTFViewer.prototype.handleViewportIndicatorClick = function(event) {
        if (!this.viewportIndicatorCanvas || !this.viewportAxisEndpoints) return;
        
        const rect = this.viewportIndicatorCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        
        const scaleX = this.viewportIndicatorCanvas.width / rect.width;
        const scaleY = this.viewportIndicatorCanvas.height / rect.height;
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;
        
        const hitTest = (x, y, radius) => {
            const dx = canvasX - x;
            const dy = canvasY - y;
            return Math.sqrt(dx * dx + dy * dy) <= radius;
        };
        
        let targetAxis = null;
        for (const [label, info] of this.viewportAxisEndpoints.entries()) {
            if (hitTest(info.x, info.y, info.radius || 10)) {
                targetAxis = label;
                break;
            }
        }
        
        if (!targetAxis && Array.isArray(this.viewportAxisBaseCircles)) {
            for (const circle of this.viewportAxisBaseCircles) {
                if (hitTest(circle.x, circle.y, circle.radius || 8)) {
                    targetAxis = circle.label;
                    break;
                }
            }
        }
        
        if (targetAxis) {
            this.alignCameraToAxis(targetAxis);
        }
    };
    
GLTFViewer.prototype.alignCameraToAxis = function(axisLabel) {
        if (!this.camera) return;
        
        const pivot = (this.controls && this.controls.target)
            ? this.controls.target.clone()
            : new THREE.Vector3(0, 0, 0);
        const distance = this.camera.position.distanceTo(pivot) || 5;
        
        let baseDir, upVector;
        switch (axisLabel.toUpperCase()) {
            case 'X':
                baseDir = new THREE.Vector3(1, 0, 0);
                upVector = new THREE.Vector3(0, 1, 0);
                break;
            case 'Y':
                baseDir = new THREE.Vector3(0, 1, 0);
                upVector = new THREE.Vector3(0, 0, 1);
                break;
            case 'Z':
                baseDir = new THREE.Vector3(0, 0, 1);
                upVector = new THREE.Vector3(0, 1, 0);
                break;
            default:
                return;
        }
        
        const currentDir = new THREE.Vector3().subVectors(this.camera.position, pivot).normalize();
        let viewDir = baseDir.clone();
        const alignment = currentDir.dot(viewDir);
        
        if (alignment > 0.9) {
            viewDir.negate();
        } else if (alignment < -0.9) {
            viewDir.copy(baseDir);
        }
        
        const newCameraPos = pivot.clone().add(viewDir.multiplyScalar(distance));
        this.camera.position.copy(newCameraPos);
        this.camera.up.copy(upVector);
        this.camera.lookAt(pivot);
        
        if (this.controls) {
            this.controls.target.copy(pivot);
            this.controls.update();
        }
        
        this._lastInteractionTime = Date.now();
        if (typeof this.updateRotationPivotIndicator === 'function') {
            this.updateRotationPivotIndicator();
        }
    };
    
GLTFViewer.prototype._getVisibleGeometryCenter = function() {
        // Calculate center of all visible geometry (meshes)
        // This is what the model should rotate around
        if (!this.loadedModels || this.loadedModels.length === 0) {
            return null;
        }
        
        const box = new THREE.Box3();
        let hasVisible = false;
        
        this.loadedModels.forEach(modelData => {
            if (!modelData || !modelData.model) return;
            
            modelData.model.traverse(child => {
                if (child.isMesh && child.visible) {
                    const childBox = new THREE.Box3().setFromObject(child);
                    if (!childBox.isEmpty()) {
                        if (!hasVisible) {
                            box.copy(childBox);
                            hasVisible = true;
                        } else {
                            box.union(childBox);
                        }
                    }
                }
            });
        });
        
        if (!hasVisible) {
            return null;
        }
        
        return box.getCenter(new THREE.Vector3());
    };
    
GLTFViewer.prototype._getSelectionCenter = function() {
        // Get center of selected parts (for selection-based rotation mode)
        // Use selectedPartUUIDs array for accurate selection tracking
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            // If no selection, use visible geometry center
            return this._getVisibleGeometryCenter();
        }
        
        const selectedObjects = [];
        this.selectedPartUUIDs.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part && part.object && part.visible) {
                selectedObjects.push(part.object);
            }
        });
        
        // If no valid selected objects, use visible geometry center
        if (selectedObjects.length === 0) {
            return this._getVisibleGeometryCenter();
        }
        
        // Calculate bounding box of selected parts only
        const box = new THREE.Box3();
        selectedObjects.forEach(obj => {
            const objBox = new THREE.Box3().setFromObject(obj);
            if (!objBox.isEmpty()) {
                box.union(objBox);
            }
        });
        
        if (box.isEmpty()) {
            return this._getVisibleGeometryCenter();
        }
        
        return box.getCenter(new THREE.Vector3());
    };
    
GLTFViewer.prototype._getScreenCenter3D = function() {
        // Calculate the 3D position of the center of the current screen viewport
        // This is where the center of the screen (0,0 in NDC) projects into 3D space
        // Always shows the center of what's currently visible on screen
        if (!this.camera || !this.controls) {
            return null;
        }
        
        // Always calculate viewport center (screen center), not geometry center
        if (!this.controls.target) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        // Screen center in NDC (Normalized Device Coordinates) - center of viewport
        const screenCenterNDC = new THREE.Vector2(0, 0);
        
        // Create raycaster from camera through screen center
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(screenCenterNDC, this.camera);
        
        // Calculate distance from camera to controls.target
        const targetDistance = this.camera.position.distanceTo(this.controls.target);
        
        // Get camera forward direction (view direction)
        const cameraForward = new THREE.Vector3();
        cameraForward.subVectors(this.controls.target, this.camera.position).normalize();
        
        // If camera forward is invalid, use camera's default forward
        if (cameraForward.length() < 0.001) {
            cameraForward.set(0, 0, -1);
            this.camera.getWorldDirection(cameraForward);
        }
        
        // Create plane perpendicular to camera direction at target distance
        const plane = new THREE.Plane();
        const planePoint = this.camera.position.clone().add(cameraForward.clone().multiplyScalar(targetDistance));
        plane.setFromNormalAndCoplanarPoint(cameraForward, planePoint);
        
        // Find intersection point (screen center in 3D space)
        const screenCenter3D = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, screenCenter3D)) {
            return screenCenter3D;
        }
        
        // Final fallback: use controls.target
        return this.controls.target.clone();
    };
    
GLTFViewer.prototype.updateRotationPivotIndicator = function() {
        // Update rotation pivot indicator based on current rotation mode
        // Aligned with current screen view (not world coordinates)
        if (!this.rotationPivotIndicatorGroup || !this.camera) return;
        
        // Only update if indicator is visible
        if (!this.rotationPivotIndicatorGroup.visible) return;
        
        const mode = this.rotationPivotMode || 'screen';
        
        // For cursor and world modes, pivot is fixed - don't update during pan/zoom
        // Only update during rotation or when explicitly requested
        if ((mode === 'cursor' || mode === 'world') && 
            !this._isRotating && 
            (this._isPanning || this._isZooming)) {
            // Don't update fixed pivots during pan/zoom
            return;
        }
        
        // Get pivot point based on mode and rotation state
        let pivotPoint;
        
        if (this._isRotating && this._lockedRotationPivot) {
            // During rotation: use locked pivot (doesn't change)
            pivotPoint = this._lockedRotationPivot;
        } else {
            // Not rotating: get pivot based on current mode
            switch (mode) {
                case 'screen':
                    // Screen center (viewport center in 3D) - updates with view
                    pivotPoint = this._getScreenCenter3D();
                    break;
                
                case 'world':
                    // World origin - fixed at (0, 0, 0)
                    pivotPoint = new THREE.Vector3(0, 0, 0);
                    break;
                
                case 'cursor':
                    // 3D cursor position - fixed at placed position
                    if (this.cursor3DPosition) {
                        pivotPoint = this.cursor3DPosition.clone();
                    } else {
                        // Fallback to screen center
                        pivotPoint = this._getScreenCenter3D();
                    }
                    break;
                
                case 'selection':
                    // Selected parts bounding box center - updates with selection
                    pivotPoint = this._getSelectionCenter();
                    break;
                
                default:
                    pivotPoint = this._getScreenCenter3D();
            }
        }
        
        if (pivotPoint) {
            // Position indicator at pivot point
            this.rotationPivotIndicatorGroup.position.copy(pivotPoint);
            
            // IMPORTANT: Keep controls.target at pivot point during rotation
            // This makes the model rotate around the viewport center (screen center)
            if (this._isRotating && this.controls && this.controls.target) {
                // Lock controls target to locked pivot during rotation
                // This ensures rotation always happens around the viewport center
                this.controls.target.copy(pivotPoint);
            }
        } else if (this.controls && this.controls.target) {
            // Fallback to controls target
            const target = this.controls.target;
            if (target && target.isVector3) {
                this.rotationPivotIndicatorGroup.position.set(target.x, target.y, target.z);
            }
        }
        
        // Make the box align with screen X/Y (face camera)
        // Skip expensive matrix calculations during active rotation for better performance
        if (!this._isRotating) {
            // Get camera's right and up vectors (screen space directions)
            const cameraRight = new THREE.Vector3();
            const cameraUp = new THREE.Vector3();
            cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
            cameraUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
            
            // Create rotation matrix that aligns box with screen space
            // Box X aligns with screen X (camera right)
            // Box Y aligns with screen Y (camera up)
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeBasis(cameraRight, cameraUp, new THREE.Vector3().crossVectors(cameraRight, cameraUp));
            
            const quaternion = new THREE.Quaternion();
            quaternion.setFromRotationMatrix(rotationMatrix);
            this.rotationPivotIndicatorGroup.quaternion.copy(quaternion);
        }
        // During rotation, keep the last quaternion (indicator stays aligned)
    };
    
GLTFViewer.prototype.setupCursorClickHandler = function() {
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('click', (e) => {
            // Only work if cursor tool is enabled
            if (!this.cursor3DEnabled) {
                return;
            }
            
            // Skip if outside canvas area
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                return;
            }
            
            // Get mouse position
            const rect = canvas.getBoundingClientRect();
            const container = document.getElementById('container');
            const canvasWidth = container.clientWidth - this.sidebarWidth;
            const canvasHeight = container.clientHeight;
            
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const mouse = new THREE.Vector2(
                (mouseX / canvasWidth) * 2 - 1,
                -((mouseY / canvasHeight) * 2 - 1)
            );
            
            // Raycast to find intersection with model
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            
            if (this.loadedModels && this.loadedModels.length > 0) {
                let allIntersects = [];
                this.loadedModels.forEach(modelData => {
                    const intersects = raycaster.intersectObject(modelData.model, true);
                    allIntersects = allIntersects.concat(intersects);
                });
                
                allIntersects.sort((a, b) => a.distance - b.distance);
                
                // Filter only visible objects
                const visibleIntersects = allIntersects.filter(intersect => {
                    let obj = intersect.object;
                    while (obj) {
                        if (!obj.visible) return false;
                        obj = obj.parent;
                    }
                    return true;
                });
                
                if (visibleIntersects.length > 0) {
                    // Place cursor at intersection point
                    const point = visibleIntersects[0].point;
                    this.cursor3DPosition.copy(point);
                    this.cursor3DGroup.position.copy(point);
                    
                    console.log('3D Cursor placed at:', point.x.toFixed(3), point.y.toFixed(3), point.z.toFixed(3));
                }
            }
        }, false); // Use bubble phase - don't capture to avoid conflicts
    };
    
GLTFViewer.prototype.onWindowResize = function() {
        const container = document.getElementById('container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // Calculate canvas area excluding sidebar
        const canvasWidth = width - this.sidebarWidth;
        const canvasHeight = height;
        
        // Update camera aspect ratio for visible canvas area
        const aspect = canvasWidth / canvasHeight;
        this._updateActiveCameraProjection(aspect);
        
        if (this.cameraMode === 'orthographic' && this.orthographicCamera) {
            const frustumHeight = this._orthoFrustumHeight || 10;
            const halfH = frustumHeight / 2;
            const halfW = halfH * (canvasWidth / Math.max(canvasHeight, 1));
            this.orthographicCamera.left = -halfW;
            this.orthographicCamera.right = halfW;
            this.orthographicCamera.top = halfH;
            this.orthographicCamera.bottom = -halfH;
            this.orthographicCamera.updateProjectionMatrix();
        }
        
        // Set renderer size to full container
        this.renderer.setSize(width, height);
        // Set viewport to exclude sidebar area
        this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        
        // Update measurement panel position if measurement tool is enabled
        if (this.measurementEnabled && typeof this.updateMeasurementPanelPosition === 'function') {
            this.updateMeasurementPanelPosition();
        }
    };
    
GLTFViewer.prototype.animate = function() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // Update controls (this is lightweight)
        if (this.controls) {
            this.controls.update();
        }
        
        // Check if any interaction stopped (no interaction for 150ms)
        const timeSinceLastInteraction = Date.now() - this._lastInteractionTime;
        if ((this._isRotating || this._isPanning || this._isZooming) && timeSinceLastInteraction > 150) {
            // Mark all interactions as stopped
            this._isRotating = false;
            this._isPanning = false;
            this._isZooming = false;
            // Update indicator to current screen center when interaction stops
            if (typeof this.updateRotationPivotIndicator === 'function') {
                this.updateRotationPivotIndicator();
            }
        }
        
        // Update rotation pivot indicator smoothly during any interaction (rotate, pan, zoom)
        // This makes it move/rotate smoothly while interacting
        if (this.rotationPivotIndicatorGroup && this.rotationPivotIndicatorGroup.visible) {
            if ((this._isRotating || this._isPanning || this._isZooming) && 
                typeof this.updateRotationPivotIndicator === 'function') {
                this.updateRotationPivotIndicator();
            }
        }
        
        // Update 3D cursor scale to maintain fixed screen size
        if (this.cursor3DGroup && this.camera && this.cursor3DPosition) {
            const distance = this.camera.position.distanceTo(this.cursor3DPosition);
            const baseCursorSize = 0.28; // Base cursor size in world units (lineLength 0.2 + circleRadius 0.08)
            const desiredPixelSize = 25; // Desired size in pixels
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseCursorSize;
                this.cursor3DGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseCursorSize;
                this.cursor3DGroup.scale.set(scale, scale, scale);
            }
            
            // Make circle always face camera (billboard effect)
            // Only the circle rotates, axis lines stay in world space
            if (this.cursor3DCircle) {
                // Get direction from cursor to camera
                const direction = new THREE.Vector3();
                direction.subVectors(this.camera.position, this.cursor3DPosition).normalize();
                // Create rotation to face camera (billboard effect)
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
                this.cursor3DCircle.quaternion.copy(quaternion);
            }
        }
        
        // Update part origin indicator scale to maintain fixed screen size
        if (this.partOriginIndicatorGroup && this.partOriginIndicatorGroup.visible && this.camera) {
            const distance = this.camera.position.distanceTo(this.partOriginIndicatorGroup.position);
            const baseSize = this.partOriginIndicatorBaseSize || 0.01;
            const desiredPixelSize = 4; // Very small pixel size - like a point
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.partOriginIndicatorGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.partOriginIndicatorGroup.scale.set(scale, scale, scale);
            }
        }
        
        // Update rotation pivot indicator scale to maintain fixed screen size
        if (this.rotationPivotIndicatorGroup && this.rotationPivotIndicatorGroup.visible && this.camera) {
            const distance = this.camera.position.distanceTo(this.rotationPivotIndicatorGroup.position);
            const baseSize = this.rotationPivotBoxSize || 0.15;
            const desiredPixelSize = 80; // Moderate size in pixels
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.rotationPivotIndicatorGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.rotationPivotIndicatorGroup.scale.set(scale, scale, scale);
            }
        }
        
        // Update viewport axis indicator (HUD)
        if (typeof this.updateViewportAxisIndicator === 'function') {
            this.updateViewportAxisIndicator();
        }
        
        // Update transform gizmo scale to maintain fixed screen size (like 3D cursor)
        if (this.transformGizmoGroup && this.camera) {
            const distance = this.camera.position.distanceTo(this.transformGizmoGroup.position);
            const baseSize = 1.0; // Base arrow length
            const desiredPixelSize = 100; // Desired size in pixels
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.transformGizmoGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.transformGizmoGroup.scale.set(scale, scale, scale);
            }
        }
        
        // Update lighting to follow camera view direction
        // This makes lighting always come from the screen/view direction
        if (this.directionalLight && this.camera && this.controls) {
            // Calculate direction from camera to target (view direction)
            const viewDirection = new THREE.Vector3();
            viewDirection.subVectors(this.controls.target, this.camera.position).normalize();
            
            // Position directional light behind camera (opposite to view direction)
            // So light shines from screen (camera side) towards the model
            const lightDistance = this.camera.position.distanceTo(this.controls.target);
            const lightPosition = this.camera.position.clone().add(
                viewDirection.clone().multiplyScalar(-lightDistance * 2)
            );
            
            // Set light position - this makes the light shine from camera direction
            // The light will always illuminate the front of whatever we're viewing
            this.directionalLight.position.copy(lightPosition);
            
            // Update light matrix to apply changes
            this.directionalLight.updateMatrixWorld();
        }
        
        // Update animations if present (for all models)
        this.mixers.forEach(mixer => {
            if (mixer) {
                mixer.update(delta);
            }
        });
        
        // Render scene - cursor will render on top due to depthTest: false and renderOrder
        this.renderer.render(this.scene, this.camera);
        
        // Note: The violation warning is usually harmless - it just means 
        // the first frame took longer than 16ms. Subsequent frames should be faster.
        // This is common with complex 3D models during initial load.
    };
    
GLTFViewer.prototype.loadGLTF = function(filePath, fileName = null, addMode = false) {
        this.showLoading();
        this.hideError();
        
        // Check if GLTFLoader is available
        if (typeof THREE.GLTFLoader === 'undefined') {
            this.showError('GLTFLoader is not available. Please ensure GLTFLoader.js is in the viewer directory.');
            this.hideLoading();
            if (window.pywebview && window.pywebview.api) {
                window.pywebview.api.onModelError('GLTFLoader not found');
            }
            return;
        }
        
        // Extract file name from path if not provided
        if (!fileName) {
            // Handle both forward and backslash paths
            const pathParts = filePath.split(/[/\\]/);
            fileName = pathParts[pathParts.length - 1];
            // Remove query parameters if present
            if (fileName.includes('?')) {
                fileName = fileName.split('?')[0];
            }
        }
        
        // Extract display name (without extension)
        const displayName = fileName.replace(/\.(gltf|glb)$/i, '');
        
        // If not in add mode, clear existing models
        if (!addMode) {
            // Clear material manager data first (before clearing models)
            if (this.materialManager && typeof this.materialManager.clear === 'function') {
                this.materialManager.clear();
            }
            
            if (typeof this.clear === 'function') {
                this.clear();
            } else {
                this._clearLoadedModelsFallback();
            }
        }
        
        // Handle special characters in file path - ensure proper URL encoding
        let safeFilePath = filePath;
        try {
            // If path contains special characters, properly encode them
            // But preserve the protocol and domain
            if (safeFilePath.includes('://')) {
                const url = new URL(safeFilePath);
                // Encode the pathname properly
                url.pathname = url.pathname.split('/').map(segment => {
                    // Decode first, then re-encode to handle special characters properly
                    try {
                        return encodeURIComponent(decodeURIComponent(segment));
                    } catch (e) {
                        // If decoding fails, just encode as-is
                        return encodeURIComponent(segment);
                    }
                }).join('/');
                safeFilePath = url.toString();
            } else {
                // Relative path - encode each segment
                safeFilePath = safeFilePath.split('/').map(segment => {
                    try {
                        return encodeURIComponent(decodeURIComponent(segment));
                    } catch (e) {
                        return encodeURIComponent(segment);
                    }
                }).join('/');
            }
        } catch (e) {
            console.warn('Error encoding file path, using original:', e);
            // Use original path if encoding fails
        }
        
        // Setup loaders
        const loader = new THREE.GLTFLoader();
        
        // Note: LoadingManager timeout is handled automatically
        // For large files, the browser will handle timeouts based on network settings
        
        // Helper to start the actual GLTF load (called after Draco configuration)
        const startLoad = () => {
            // Load model with enhanced error handling
            loader.load(
                safeFilePath,
                (gltf) => {
                    const model = gltf.scene;
                    
                    // Extract materials from loaded GLTF
                    if (this.materialManager && typeof this.materialManager.refreshMaterials === 'function') {
                        setTimeout(() => {
                            this.materialManager.refreshMaterials();
                        }, 500);
                    }
                    const modelUuid = THREE.MathUtils.generateUUID();
                    
                    // Setup animations
                    let mixer = null;
                    if (gltf.animations && gltf.animations.length > 0) {
                        mixer = new THREE.AnimationMixer(model);
                        gltf.animations.forEach((clip) => {
                            mixer.clipAction(clip).play();
                        });
                        this.mixers.push(mixer);
                    }
                    
                    // Calculate bounding box (keep model at original coordinates - don't center)
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    
                    // DO NOT center model - keep original coordinates
                    // Model stays at its original position in world space
                    
                    // IMPORTANT: Temporarily hide model to prevent visual jump when camera position changes
                    // Set model visibility to false before positioning camera
                    model.visible = false;
                    
                    // Set camera position BEFORE adding model to scene to avoid visual "jump"
                    // This prevents the model from appearing at the old camera position first
                    // Fit camera to all loaded models
                    if (this.loadedModels.length === 0 || !addMode) {
                        // First model or replacing - check if preview is active
                        if (this.previewActive && typeof resetToPreviewBox === 'function') {
                            // Fit to preview box with isometric angle
                            const container = document.getElementById('container');
                            const canvasWidth = container.clientWidth - this.sidebarWidth;
                            const canvasHeight = container.clientHeight;
                            resetToPreviewBox(canvasWidth, canvasHeight);
                        } else {
                            // Default fit to screen with isometric top view
                            // Use actual model center (not world origin)
                            const size = box.getSize(new THREE.Vector3());
                            const maxDim = Math.max(size.x, size.y, size.z);
                            const distance = maxDim * 2.8; // Increased from 2 to 2.8 for better fit
                            // Set camera to isometric top view position: Z, -X, Y (looking down from top-back-left)
                            // Position camera relative to model center
                            this.camera.position.set(
                                center.x - distance, 
                                center.y + distance, 
                                center.z + distance
                            );
                            this.camera.lookAt(center);
                            
                            if (this.controls) {
                                // Set target to model center (not world origin)
                                this.controls.target.copy(center);
                                this.controls.update();
                            }
                        }
                    }
                    
                    // Add model to loaded models array
                    const modelData = {
                        model: model,
                        fileName: fileName,
                        name: displayName,
                        uuid: modelUuid
                    };
                    this.loadedModels.push(modelData);
                    this.scene.add(model);
                    
                    // Make model visible again after camera is positioned
                    // Use requestAnimationFrame to ensure camera position is applied before showing model
                    requestAnimationFrame(() => {
                        model.visible = true;
                    });
                    
                    // Apply random colours if feature is enabled
                    if (this.randomColorsEnabled && typeof this._applyRandomColorsToObject === 'function') {
                        this._applyRandomColorsToObject(model, { skipExisting: true });
                    }
                    
                    // Fit camera to all models - account for sidebar in aspect ratio
                    const container = document.getElementById('container');
                    const canvasWidth = container.clientWidth - this.sidebarWidth;
                    const canvasHeight = container.clientHeight;
                    const aspect = canvasWidth / canvasHeight;
                    
                    // Update camera aspect for visible area
                    this.camera.aspect = aspect;
                    this.camera.updateProjectionMatrix();
                    
                    // Update renderer viewport to exclude sidebar
                    this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
                    
                    // If adding model (not first model), fit to all models AFTER adding
                    if (this.loadedModels.length > 1 && addMode) {
                        // Adding model - fit to all models
                        if (typeof this.fitScreen === 'function') {
                            this.fitScreen();
                        }
                    }
                    
                    // Build parts tree in sidebar (called from viewer-tree.js)
                    if (typeof this.buildPartsTree === 'function') {
                        this.buildPartsTree();
                    }
                    
                    // Calculate boundary box center (always, for rotation)
                    if (typeof this.calculateBoundaryBoxCenter === 'function') {
                        this.calculateBoundaryBoxCenter();
                    }

                    if (this.sectionManager && typeof this.sectionManager.onSceneBoundsChanged === 'function') {
                        this.sectionManager.onSceneBoundsChanged();
                    }
                    
                    // Update boundary box if it's currently visible
                    if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
                        this.updateBoundaryBox();
                    }
                    
                    // Collect statistics
                    const stats = this.collectStats(model);
                    
                    // Notify Python about successful load
                    if (window.pywebview) {
                        window.pywebview.api.onModelLoaded({
                            vertices: stats.vertices,
                            faces: stats.faces,
                            materials: stats.materials,
                            textures: stats.textures,
                            animations: gltf.animations ? gltf.animations.length : 0,
                            isDraco: this.checkIfDraco(gltf)
                        });
                    }
                    
                    this.hideLoading();
                },
                (progress) => {
                    // Handle progress for large files
                    if (progress.total > 0) {
                        const percent = (progress.loaded / progress.total * 100).toFixed(1);
                        const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(2);
                        const totalMB = (progress.total / (1024 * 1024)).toFixed(2);
                        this.showLoading(`Loading... ${percent}% (${loadedMB}MB / ${totalMB}MB)`);
                    } else {
                        // Unknown total size - show loaded amount
                        const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(2);
                        this.showLoading(`Loading... ${loadedMB}MB loaded...`);
                    }
                },
                (error) => {
                    console.error('Error loading GLTF:', error);
                    
                    // Enhanced error handling for common issues
                    let errorMessage = error.message || 'Unknown error';
                    let userFriendlyMessage = errorMessage;
                    
                    // Handle specific error types
                    if (errorMessage.includes('Unexpected end of JSON input') || 
                        errorMessage.includes('JSON')) {
                        // JSON parse error - could be truncated file, special characters, or large file issue
                        userFriendlyMessage = 'File loading error. This might be due to:\n' +
                            '1. Large file size (try waiting longer)\n' +
                            '2. Special characters in filename\n' +
                            '3. Corrupted or incomplete file\n\n' +
                            'Error: ' + errorMessage;
                        
                        // Try to provide more helpful message
                        console.warn('JSON parse error - possible causes:', {
                            filePath: safeFilePath,
                            error: errorMessage,
                            suggestion: 'File might be too large or contain special characters'
                        });
                    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
                        userFriendlyMessage = 'File loading timeout. The file is too large or network is slow.\n' +
                            'Please try again or use a smaller file.';
                    } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                        userFriendlyMessage = 'File not found. Please check the file path.\n' +
                            'Special characters in filename might need encoding.';
                    } else if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
                        userFriendlyMessage = 'Cross-origin error. File cannot be loaded from this location.';
                    } else if (errorMessage.includes('Aborted') || errorMessage.includes('aborted')) {
                        // Draco decoder memory error - very large single-part mesh
                        userFriendlyMessage = 'DRACO DECOMPRESSION ERROR:\n\n' +
                            'The file contains a very large compressed mesh that exceeds browser memory limits.\n\n' +
                            'SOLUTIONS:\n' +
                            '1. Re-export the GLTF WITHOUT Draco compression\n' +
                            '2. Split the large single mesh into smaller parts (recommended)\n' +
                            '3. Export as multiple files with smaller assemblies\n' +
                            '4. Use GLB format without compression\n\n' +
                            'Note: Files under 100MB or with multiple smaller parts load fine.\n' +
                            'The issue is specifically with ONE very large compressed mesh.';
                    }
                    
                    this.showError(userFriendlyMessage);
                    this.hideLoading();
                    
                    if (window.pywebview) {
                        window.pywebview.api.onModelError(errorMessage);
                    }
                }
            );
        };
        
        // Setup Draco loader if available
        if (typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            // Set decoder path to viewer directory (same directory as index.html)
            dracoLoader.setDecoderPath(window.location.origin + '/');
            // Limit to a single worker to reduce peak memory usage on very large meshes
            if (typeof dracoLoader.setWorkerLimit === 'function') {
                dracoLoader.setWorkerLimit(1);
            }
            
            // Configure with increased memory for large meshes
            // Try to use WASM decoder with maximum memory allocation
            const wasmWrapperUrl = window.location.origin + '/draco_wasm_wrapper.js';
            try {
                fetch(wasmWrapperUrl, { method: 'HEAD', cache: 'no-store' })
                    .then(res => {
                        if (res && res.ok) {
                            // Use WASM decoder - simplified config without custom memory settings
                            // The wasmMemory config was causing byteLength errors
                            dracoLoader.setDecoderConfig({ type: 'wasm' });
                            console.log('Using WASM Draco decoder');
                        } else {
                            // Fallback to JS decoder
                            dracoLoader.setDecoderConfig({ type: 'js' });
                            console.log('Using JS Draco decoder (WASM wrapper not found)');
                        }
                    })
                    .catch(() => {
                        dracoLoader.setDecoderConfig({ type: 'js' });
                        console.log('Using JS Draco decoder (fallback)');
                    })
                    .finally(() => {
                        // Preload the decoder before loading the model
                        try {
                            dracoLoader.preload();
                            console.log('Draco decoder preloaded');
                        } catch (e) {
                            console.warn('Could not preload Draco decoder:', e);
                        }
                        loader.setDRACOLoader(dracoLoader);
                        startLoad();
                    });
            } catch (e) {
                dracoLoader.setDecoderConfig({ type: 'js' });
                loader.setDRACOLoader(dracoLoader);
                console.log('Using JS Draco decoder (exception fallback)');
                startLoad();
            }
        } else {
            // No Draco loader â€“ start immediately
            startLoad();
        }
    }
