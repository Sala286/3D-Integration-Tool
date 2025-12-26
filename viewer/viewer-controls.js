/**
 * GLTF Viewer - Controls Module
 * Handles pan, zoom, area zoom, and click detection
 */

// Add control methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    
    // ============================================================================
    // CAD-STYLE ROTATION HANDLER
    // ============================================================================
    GLTFViewer.prototype.setupCADRotation = function() {
        const canvas = this.renderer.domElement;
        
        // Default rotation configuration
        if (typeof this.enableRotationSnap === 'undefined') {
            this.enableRotationSnap = false; // opt-in so casual drags don't auto-snap
        }

        // Rotation state
        let isRotating = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        let lockedPivot = null;
        let lockedDistance = null;
        let hasRotated = false;
        
        // Disable OrbitControls rotation
        if (this.controls) {
            this.controls.enableRotate = false;
        }
        
        // Get pivot point based on current rotation mode
        const getRotationPivot = () => {
            const mode = this.rotationPivotMode || 'screen';
            
            switch (mode) {
                case 'screen':
                    // Screen center (viewport center in 3D)
                    return this._getScreenCenter3D();
                
                case 'world':
                    // World origin
                    return new THREE.Vector3(0, 0, 0);
                
                case 'cursor':
                    // 3D cursor position
                    if (this.cursor3DPosition) {
                        return this.cursor3DPosition.clone();
                    }
                    // Fallback to screen center
                    return this._getScreenCenter3D();
                
                case 'selection':
                    // Selected parts bounding box center
                    return this._getSelectionCenter();
                
                default:
                    return this._getScreenCenter3D();
            }
        };
        
        // Mouse down - start rotation
        const onMouseDown = (e) => {
            // Only left mouse button
            if (e.button !== 0) return;
            
            // Skip if outside canvas area
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                return;
            }
            
            // Check if clicking on UI elements
            if (e.target !== canvas) return;
            
            // Skip if dragging transform gizmo (don't rotate camera during drag)
            if (this.transformDragging) return;
            
            isRotating = true;
            hasRotated = false;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            
            // Lock pivot point for entire rotation session
            lockedPivot = getRotationPivot();
            if (!lockedPivot) {
                lockedPivot = this.controls.target.clone();
            }
            
            // Lock distance from camera to pivot
            lockedDistance = this.camera.position.distanceTo(lockedPivot);
            
            // Set controls.target to pivot
            this.controls.target.copy(lockedPivot);
            this.controls.update();
            
            // Update interaction state
            this._isRotating = true;
            this._lockedRotationPivot = lockedPivot;
            this._lastInteractionTime = Date.now();
            
            // Update indicator
            if (typeof this.updateRotationPivotIndicator === 'function') {
                this.updateRotationPivotIndicator();
            }
            
            updateCursorStyle();
            e.preventDefault();
        };
        
        // Mouse move - perform rotation
        const onMouseMove = (e) => {
            if (!isRotating || !lockedPivot) return;
            
            // Calculate mouse delta
            let deltaX = e.clientX - lastMouseX;
            let deltaY = e.clientY - lastMouseY;
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            // Optionally lock to the dominant drag axis to avoid unintended dual-axis motion
            const axisLockEnabled = this.enableRotationAxisLock !== false;
            if (axisLockEnabled) {
                const lockRatio = this.rotationAxisLockRatio ?? 1.4; // larger means stronger locking
                const minDelta = this.rotationAxisLockMinDelta ?? 4; // px movement before locking kicks in
                const absX = Math.abs(deltaX);
                const absY = Math.abs(deltaY);
                if (absX + absY >= minDelta) {
                    if (absX > absY * lockRatio) {
                        deltaY = 0;
                    } else if (absY > absX * lockRatio) {
                        deltaX = 0;
                    }
                }
            }
            
            // Rotation sensitivity
            const rotationSpeed = 0.005;
            
            // Calculate yaw and pitch
            const yawDelta = -deltaX * rotationSpeed; // Horizontal rotation (around pivot)
            const pitchDelta = -deltaY * rotationSpeed; // Vertical rotation (around pivot)

            if (yawDelta !== 0 || pitchDelta !== 0) {
                hasRotated = true;
            }
            
            // Get current camera position relative to pivot
            const offset = new THREE.Vector3();
            offset.subVectors(this.camera.position, lockedPivot);
            
            // Convert to spherical coordinates
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(offset);
            
            // Apply yaw (theta - horizontal rotation)
            spherical.theta += yawDelta;
            
            // Apply pitch (phi - vertical rotation) with clamping
            spherical.phi += pitchDelta;
            
            // Clamp phi to prevent gimbal lock and flipping
            // Keep phi between epsilon and PI-epsilon
            const epsilon = 0.001;
            spherical.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, spherical.phi));
            
            // Keep distance constant
            spherical.radius = lockedDistance;
            
            // Convert back to Cartesian coordinates
            offset.setFromSpherical(spherical);
            
            // Update camera position (pivot + offset)
            this.camera.position.copy(lockedPivot).add(offset);
            
            // Camera looks at pivot
            this.camera.lookAt(lockedPivot);
            
            // Update projection matrix for orthographic cameras
            if (this.camera.isOrthographicCamera) {
                this.camera.updateProjectionMatrix();
            }
            
            // Keep controls.target at pivot
            this.controls.target.copy(lockedPivot);
            
            // Update interaction state
            this._lastInteractionTime = Date.now();
            
            // Skip expensive indicator update during rotation for better performance
            // The pivot is locked, so indicator position doesn't need frequent updates
            // Only update indicator position (skip expensive matrix calculations)
            if (typeof this.updateRotationPivotIndicator === 'function' && this.rotationPivotIndicatorGroup) {
                // During rotation, only update position if pivot changed, skip matrix calculations
                if (this._lockedRotationPivot && this.rotationPivotIndicatorGroup.visible) {
                    this.rotationPivotIndicatorGroup.position.copy(this._lockedRotationPivot);
                }
            }
            
            e.preventDefault();
        };
        
        // Snap camera orientation to discrete angles for predictable CAD views.
        // Configure via:
        //  - enableRotationSnap (default true)
        //  - rotationSnapSteps (horizontal divisions, default 8 -> every 45°)
        //  - rotationSnapPitchSteps (vertical divisions, default matches horizontal)
        const snapCameraToAllowedAngles = (pivotOverride) => {
            if (this.enableRotationSnap === false) {
                return;
            }
            if (!this.camera || !this.controls) {
                return;
            }
            
            // Determine pivot (default to current target)
            const pivot = pivotOverride || this.controls.target.clone();
            if (!pivot) {
                return;
            }
            
            // Compute spherical coordinates from camera to pivot
            const offset = new THREE.Vector3().subVectors(this.camera.position, pivot);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            
            // Horizontal snapping (theta)
            const yawSteps = this.rotationSnapSteps || 8; // default 8 directions (45°)
            if (yawSteps > 0) {
                const yawStep = (Math.PI * 2) / yawSteps;
                spherical.theta = Math.round(spherical.theta / yawStep) * yawStep;
            }
            
            // Vertical snapping (phi)
            const pitchSteps = this.rotationSnapPitchSteps || yawSteps;
            if (pitchSteps > 0) {
                const pitchStep = Math.PI / pitchSteps;
                spherical.phi = Math.round(spherical.phi / pitchStep) * pitchStep;
            }
            
            // Respect existing radius
            spherical.radius = offset.length();
            
            // Reposition camera with snapped angles
            offset.setFromSpherical(spherical);
            this.camera.position.copy(pivot).add(offset);
            this.camera.lookAt(pivot);
            
            // Update projection matrix for orthographic cameras
            if (this.camera.isOrthographicCamera) {
                this.camera.updateProjectionMatrix();
            }
            
            this.controls.target.copy(pivot);
            this.controls.update();
        };
        
        // Mouse up - stop rotation
        const onMouseUp = (e) => {
            if (!isRotating) return;
            
            // Snap to nearest allowed angles only if the camera actually rotated
            if (hasRotated) {
                const snapPivot = lockedPivot ? lockedPivot.clone() : null;
                snapCameraToAllowedAngles(snapPivot);
            }
            
            isRotating = false;
            hasRotated = false;
            
            // Unlock pivot
            lockedPivot = null;
            lockedDistance = null;
            
            // Update interaction state
            this._isRotating = false;
            this._lockedRotationPivot = null;
            
            // Update indicator to new pivot position after rotation stops
            setTimeout(() => {
                if (typeof this.updateRotationPivotIndicator === 'function') {
                    this.updateRotationPivotIndicator();
                }
                
                // Update controls.target to new pivot
                const newPivot = getRotationPivot();
                if (newPivot && this.controls && this.controls.target) {
                    this.controls.target.copy(newPivot);
                    this.controls.update();
                }
            }, 150);
            
            updateCursorStyle();
            e.preventDefault();
        };
        
        // Attach event listeners
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp); // Treat as mouse up
        
        // Update cursor style based on active tool
        const updateCursorStyle = () => {
            // Check measurement tool first (highest priority)
            if (this.measurementEnabled) {
                canvas.style.cursor = 'default';
            } else if (this.cursor3DEnabled) {
                canvas.style.cursor = 'crosshair';
            } else if (isRotating) {
                canvas.style.cursor = 'grabbing';
            } else {
                canvas.style.cursor = 'grab';
            }
        };
        
        // Initial cursor style
        updateCursorStyle();
        
        // Store reference for other functions to update cursor
        this._updateCanvasCursor = updateCursorStyle;
        
        console.log('CAD-style rotation initialized');
    };
    
    // Get selection center (for selection-based rotation mode)
    GLTFViewer.prototype._getSelectionCenter = function() {
        // Get center of selected parts using selectedPartUUIDs array
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
    
    // ============================================================================
    // ZOOM HANDLER - Simple and Clean
    // ============================================================================
    GLTFViewer.prototype.setupZoomToPoint = function() {
        const canvas = this.renderer.domElement;
        let zoomTimeout = null;
        
        canvas.addEventListener('wheel', (e) => {
            // Skip if outside canvas area
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            // Mark zoom as active
            this._isZooming = true;
            this._lastInteractionTime = Date.now();
            
            // Clear any pending timeout
            if (zoomTimeout) {
                clearTimeout(zoomTimeout);
            }
            
            if (!this.controls || !this.camera) {
                return;
            }
            
            // Get mouse position in NDC
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
            
            const zoomSpeed = 0.1;
            const zoomFactor = e.deltaY > 0 ? (1 + zoomSpeed) : (1 - zoomSpeed);
            
            if (this.camera.isOrthographicCamera) {
                const prevZoom = this.camera.zoom;
                const newZoom = THREE.MathUtils.clamp(prevZoom / zoomFactor, 0.05, 50);
                const zoomRatio = newZoom / prevZoom;
                this.camera.zoom = newZoom;
                this.camera.updateProjectionMatrix();
                
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, this.camera);
                const plane = new THREE.Plane();
                const cameraDir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
                plane.setFromNormalAndCoplanarPoint(cameraDir, this.controls.target);
                const zoomPoint = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, zoomPoint)) {
                    const targetDelta = new THREE.Vector3().subVectors(zoomPoint, this.controls.target);
                    targetDelta.multiplyScalar(1 - zoomRatio);
                    this.controls.target.add(targetDelta);
                    this.camera.position.add(targetDelta);
                }
                this.controls.update();
                return;
            }
            
            // Perspective zoom
            const currentDistance = this.camera.position.distanceTo(this.controls.target);
            const newDistance = currentDistance * zoomFactor;
            const clampedDistance = Math.max(
                this.controls.minDistance,
                Math.min(this.controls.maxDistance, newDistance)
            );
            
            if (Math.abs(clampedDistance - currentDistance) < 0.001) {
                return;
            }
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            
            const cameraDir = new THREE.Vector3();
            cameraDir.subVectors(this.camera.position, this.controls.target).normalize();
            
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(
                cameraDir,
                this.controls.target
            );
            
            const zoomPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(plane, zoomPoint);
            
            if (!zoomPoint) {
                const viewDir = new THREE.Vector3();
                viewDir.subVectors(this.controls.target, this.camera.position).normalize();
                
                const deltaDistance = clampedDistance - currentDistance;
                this.camera.position.addScaledVector(viewDir, deltaDistance);
                this.controls.update();
                return;
            }
            
            const direction = new THREE.Vector3();
            direction.subVectors(this.camera.position, zoomPoint).normalize();
            
            const newCameraPos = zoomPoint.clone().addScaledVector(direction, clampedDistance);
            
            const offset = new THREE.Vector3().subVectors(newCameraPos, this.camera.position);
            
            this.camera.position.copy(newCameraPos);
            this.controls.target.add(offset);
            this.camera.lookAt(this.controls.target);
            this.controls.update();
            
            // Update rotation pivot indicator during zoom (smooth following)
            // The controls change event will also trigger update
            this._lastInteractionTime = Date.now();
            
        }, { passive: false });
        
        // Mark zoom as stopped when wheel stops (debounced)
        canvas.addEventListener('wheel', () => {
            if (zoomTimeout) {
                clearTimeout(zoomTimeout);
            }
            zoomTimeout = setTimeout(() => {
                this._isZooming = false;
                // Update indicator to current screen center when zoom stops
                if (typeof this.updateRotationPivotIndicator === 'function') {
                    this.updateRotationPivotIndicator();
                }
            }, 150);
        }, { passive: true });
    };
    
    // ============================================================================
    // PAN HANDLER - Screen Space
    // ============================================================================
    GLTFViewer.prototype.setupPanControls = function() {
        const canvas = this.renderer.domElement;
        let isPanning = false;
        let panStart = new THREE.Vector2();
        let isCtrlPressed = false;
        
        // Track Ctrl key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Control' || e.ctrlKey) {
                isCtrlPressed = true;
                if (this.controls) {
                    this.controls.enablePan = false;
                }
            }
        });
        
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Control' || !e.ctrlKey) {
                isCtrlPressed = false;
                if (this.controls) {
                    this.controls.enablePan = true;
                }
            }
        });
        
        canvas.addEventListener('mousedown', (e) => {
            // Middle mouse button
            if (e.button === 1) {
                if (this.areaZoomActive) return;
                if (!this.isPointInCanvasArea(e.clientX, e.clientY)) return;
                
                e.preventDefault();
                isPanning = true;
                this._isPanning = true;
                this._lastInteractionTime = Date.now();
                panStart.set(e.clientX, e.clientY);
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!isPanning) return;
            
            if (this.areaZoomActive) {
                isPanning = false;
                return;
            }
            
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                isPanning = false;
                return;
            }
            
            if (isPanning && (e.buttons === 4 || (isCtrlPressed && e.buttons === 1))) {
                e.preventDefault();
                
                const panDelta = new THREE.Vector2(
                    e.clientX - panStart.x,
                    e.clientY - panStart.y
                );
                
                if (this.controls && this.camera) {
                    // Calculate pan in screen space
                    const panSpeed = 0.01;
                    
                    // Get camera right and up vectors
                    const right = new THREE.Vector3();
                    const up = new THREE.Vector3();
                    right.setFromMatrixColumn(this.camera.matrixWorld, 0);
                    up.setFromMatrixColumn(this.camera.matrixWorld, 1);
                    
                    // Calculate pan vector
                    const panVector = new THREE.Vector3();
                    panVector.addScaledVector(right, -panDelta.x * panSpeed);
                    panVector.addScaledVector(up, panDelta.y * panSpeed);
                    
                    // Move camera and target together
                    this.camera.position.add(panVector);
                    this.controls.target.add(panVector);
                    this.controls.update();
                    
                    // Update rotation pivot indicator during pan (smooth following)
                    // The controls change event will also trigger update
                    this._lastInteractionTime = Date.now();
                }
                
                panStart.set(e.clientX, e.clientY);
            }
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 1) {
                isPanning = false;
                this._isPanning = false;
                // Update indicator to current screen center when pan stops
                if (typeof this.updateRotationPivotIndicator === 'function') {
                    // Use timeout to ensure it updates after pan completes
                    setTimeout(() => {
                        this.updateRotationPivotIndicator();
                    }, 50);
                }
            }
        });
        
        canvas.addEventListener('contextmenu', (e) => {
            // Prevent default context menu
            e.preventDefault();
            
            // Skip if outside canvas area
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                return;
            }
            
            // Check if cursor tool is active
            if (this.cursor3DEnabled) {
                return;
            }
            
            // Raycast to find clicked part
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
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            
            if (this.partsList && this.partsList.length > 0) {
                // Optimized: Only raycast against visible parts
                const visibleParts = [];
                const meshToPartMap = new Map();
                
                this.partsList.forEach(part => {
                    if (part.visible && part.object && part.object.isMesh) {
                        visibleParts.push(part.object);
                        meshToPartMap.set(part.object.uuid, part);
                    }
                });
                
                // Raycast to find clicked part
                const intersects = raycaster.intersectObjects(visibleParts, false);
                
                if (intersects.length > 0) {
                    const clickedMesh = intersects[0].object;
                    const part = meshToPartMap.get(clickedMesh.uuid);
                    
                    if (part && part.visible) {
                        // Show context menu for this part
                        if (typeof this.showTreeContextMenu === 'function') {
                            this.showTreeContextMenu(e, part.uuid);
                        }
                    }
                }
            }
        });
    };
    
    // ============================================================================
    // MODEL CLICK DETECTION
    // ============================================================================
    GLTFViewer.prototype.setupModelClickDetection = function() {
        const canvas = this.renderer.domElement;
        let isDragging = false;
        let mouseDownPos = new THREE.Vector2();
        let mouseDownTime = 0;
        const CLICK_MAX_DISTANCE = 5;
        const CLICK_MAX_TIME = 200;
        
        canvas.addEventListener('mousedown', (e) => {
            if (this.areaZoomActive) return;
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) return;
            
            // Skip part selection if cursor tool is active
            if (this.cursor3DEnabled) {
                return;
            }
            
            // Skip part selection if measurement tool is active
            if (this.measurementEnabled) {
                return;
            }
            
            // Disable pan on Ctrl
            if (e.ctrlKey || e.metaKey) {
                if (this.controls) {
                    this.controls.enablePan = false;
                }
            }
            
            // Track click position for all clicks (including Ctrl+click for multiple selection)
            if (e.button === 0) {
                mouseDownPos.set(e.clientX, e.clientY);
                mouseDownTime = Date.now();
                isDragging = false;
                
                // Box selection with Ctrl+drag (will be determined in mousemove if dragging)
                // Don't start box selection immediately - wait to see if it's a drag
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            // Skip if cursor tool is active
            if (this.cursor3DEnabled) {
                return;
            }
            
            // Box selection drag
            if (this.isBoxSelecting) {
                this.boxSelectionEnd.set(e.clientX, e.clientY);
                this._updateSelectionBox();
                e.preventDefault();
                return;
            }
            
            // Check if dragging - if Ctrl+drag, start box selection
            if (mouseDownPos.x !== 0 || mouseDownPos.y !== 0) {
                const deltaX = Math.abs(e.clientX - mouseDownPos.x);
                const deltaY = Math.abs(e.clientY - mouseDownPos.y);
                if (deltaX > CLICK_MAX_DISTANCE || deltaY > CLICK_MAX_DISTANCE) {
                    isDragging = true;
                    
                    // If Ctrl+drag, start box selection
                    if ((e.ctrlKey || e.metaKey) && !this.isBoxSelecting) {
                        this.isBoxSelecting = true;
                        this.boxSelectionStart = new THREE.Vector2(mouseDownPos.x, mouseDownPos.y);
                        this.boxSelectionEnd = new THREE.Vector2(e.clientX, e.clientY);
                        this._createSelectionBox();
                        e.preventDefault();
                    }
                }
            }
        });
        
        canvas.addEventListener('mouseup', (e) => {
            // Re-enable pan
            if (!e.ctrlKey && !e.metaKey) {
                if (this.controls) {
                    this.controls.enablePan = true;
                }
            }
            
            // Box selection end
            if (this.isBoxSelecting && e.button === 0) {
                this._finishBoxSelection();
                this.isBoxSelecting = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            if (this.areaZoomActive) {
                isDragging = false;
                mouseDownPos.set(0, 0);
                mouseDownTime = 0;
                return;
            }
            
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                isDragging = false;
                mouseDownPos.set(0, 0);
                mouseDownTime = 0;
                return;
            }
            
            // Skip part selection if cursor tool is active
            if (this.cursor3DEnabled) {
                isDragging = false;
                mouseDownPos.set(0, 0);
                mouseDownTime = 0;
                return;
            }
            
            // Skip part selection if measurement tool is active
            if (this.measurementEnabled) {
                isDragging = false;
                mouseDownPos.set(0, 0);
                mouseDownTime = 0;
                return;
            }
            
            // Handle click selection (including Ctrl+Click for multiple selection)
            // Skip if we were rotating (don't select after rotation)
            if (e.button === 0 && !this._isRotating) {
                const mouseUpTime = Date.now();
                const timeDiff = mouseUpTime - mouseDownTime;
                const deltaX = Math.abs(e.clientX - mouseDownPos.x);
                const deltaY = Math.abs(e.clientY - mouseDownPos.y);
                
                const isClick = !isDragging && 
                               deltaX <= CLICK_MAX_DISTANCE && 
                               deltaY <= CLICK_MAX_DISTANCE &&
                               timeDiff <= CLICK_MAX_TIME;
                
                if (isClick) {
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
                    
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera(mouse, this.camera);
                    
                    // First check if clicking on gizmo handles or elements - if so, don't deselect
                    if (this.transformGizmoGroup && this.gizmoHandles) {
                        const handles = Array.from(this.gizmoHandles.values());
                        const elements = this.gizmoElements ? Array.from(this.gizmoElements.values()) : [];
                        const allGizmoObjects = [...handles, ...elements];
                        
                        // Also check for arrow lines and circle meshes
                        this.transformGizmoGroup.traverse((child) => {
                            if (child.isLine || (child.isMesh && (child.name.includes('Arrow') || child.name.includes('Circle')))) {
                                allGizmoObjects.push(child);
                            }
                        });
                        
                        const gizmoIntersects = raycaster.intersectObjects(allGizmoObjects, false);
                        if (gizmoIntersects.length > 0) {
                            // Clicked on gizmo handle/element - don't process part selection/deselection
                            return;
                        }
                    }
                    
                    if (this.partsList && this.partsList.length > 0) {
                        // Optimized: Only raycast against visible parts with UUID map for instant lookup
                        const visibleParts = [];
                        const meshToPartMap = new Map(); // Fast UUID lookup
                        
                        this.partsList.forEach(part => {
                            if (part.visible && part.object && part.object.isMesh) {
                                visibleParts.push(part.object);
                                meshToPartMap.set(part.object.uuid, part);
                            }
                        });
                        
                        // Raycast only against visible meshes (much faster)
                        const intersects = raycaster.intersectObjects(visibleParts, false);
                        
                        if (intersects.length > 0) {
                            const clickedMesh = intersects[0].object;
                            
                            if (clickedMesh && clickedMesh.isMesh && clickedMesh.visible) {
                                // Instant lookup using Map
                                const part = meshToPartMap.get(clickedMesh.uuid);
                                if (part && part.visible && typeof this.selectPart === 'function') {
                                    // Ctrl+Click or Cmd+Click: add to selection (multiple selection)
                                    // Normal Click: single selection (replace)
                                    const addToSelection = (e.ctrlKey || e.metaKey) && !e.shiftKey;
                                    this.selectPart(part.uuid, addToSelection);
                                } else if (!part || !part.visible) {
                                    // Only clear if not Ctrl+clicking (Ctrl+click on empty space should not clear)
                                    if (!e.ctrlKey && !e.metaKey) {
                                    if (typeof this.clearSelection === 'function') {
                                        this.clearSelection();
                                        }
                                    }
                                }
                            } else {
                                // Only clear if not Ctrl+clicking
                                if (!e.ctrlKey && !e.metaKey) {
                                if (typeof this.clearSelection === 'function') {
                                    this.clearSelection();
                                    }
                                }
                            }
                        } else {
                            // Only clear if not Ctrl+clicking (Ctrl+click on empty space should not clear selection)
                            if (!e.ctrlKey && !e.metaKey) {
                            if (typeof this.clearSelection === 'function') {
                                this.clearSelection();
                                }
                            }
                        }
                    }
                }
            }
            
            isDragging = false;
            mouseDownPos.set(0, 0);
            mouseDownTime = 0;
        });
    };
    
    // ============================================================================
    // AREA ZOOM
    // ============================================================================
    GLTFViewer.prototype.setupAreaZoom = function() {
        const canvas = this.renderer.domElement;
        let isDrawing = false;
        let startPos = new THREE.Vector2();
        let endPos = new THREE.Vector2();
        let zoomBox = null;
        
        const createZoomBox = () => {
            if (zoomBox) {
                zoomBox.remove();
            }
            zoomBox = document.createElement('div');
            zoomBox.style.position = 'absolute';
            zoomBox.style.border = '2px dashed #FFA500';
            zoomBox.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
            zoomBox.style.pointerEvents = 'none';
            zoomBox.style.zIndex = '10000';
            zoomBox.style.display = 'none';
            document.getElementById('container').appendChild(zoomBox);
            return zoomBox;
        };
        
        this.toggleAreaZoom = () => {
            this.areaZoomActive = !this.areaZoomActive;
            const btn = document.getElementById('area-zoom-btn');
            if (btn) {
                if (this.areaZoomActive) {
                    btn.classList.add('active');
                    canvas.style.cursor = 'crosshair';
                    if (this.controls) {
                        this.controls.enabled = false;
                    }
                } else {
                    btn.classList.remove('active');
                    canvas.style.cursor = 'default';
                    if (zoomBox) {
                        zoomBox.style.display = 'none';
                    }
                    if (this.controls) {
                        this.controls.enabled = true;
                    }
                }
            }
        };
        
        canvas.addEventListener('mousedown', (e) => {
            if (!this.areaZoomActive) return;
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) return;
            
            if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                isDrawing = true;
                const rect = canvas.getBoundingClientRect();
                startPos.set(e.clientX - rect.left, e.clientY - rect.top);
                
                if (!zoomBox) {
                    zoomBox = createZoomBox();
                }
                zoomBox.style.display = 'block';
            }
        }, true);
        
        canvas.addEventListener('mousemove', (e) => {
            if (!this.areaZoomActive || !isDrawing) return;
            
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            const rect = canvas.getBoundingClientRect();
            endPos.set(e.clientX - rect.left, e.clientY - rect.top);
            
            if (zoomBox) {
                const left = Math.min(startPos.x, endPos.x);
                const top = Math.min(startPos.y, endPos.y);
                const width = Math.abs(endPos.x - startPos.x);
                const height = Math.abs(endPos.y - startPos.y);
                
                zoomBox.style.left = left + 'px';
                zoomBox.style.top = top + 'px';
                zoomBox.style.width = width + 'px';
                zoomBox.style.height = height + 'px';
            }
        }, true);
        
        canvas.addEventListener('mouseup', (e) => {
            if (!this.areaZoomActive || !isDrawing) return;
            
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                isDrawing = false;
                const rect = canvas.getBoundingClientRect();
                endPos.set(e.clientX - rect.left, e.clientY - rect.top);
                
                const boxLeft = Math.min(startPos.x, endPos.x);
                const boxTop = Math.min(startPos.y, endPos.y);
                const boxWidth = Math.abs(endPos.x - startPos.x);
                const boxHeight = Math.abs(endPos.y - startPos.y);
                
                if (boxWidth > 10 && boxHeight > 10) {
                    const container = document.getElementById('container');
                    const canvasWidth = container.clientWidth - this.sidebarWidth;
                    const canvasHeight = container.clientHeight;
                    
                    const centerX = boxLeft + boxWidth / 2;
                    const centerY = boxTop + boxHeight / 2;
                    
                    const mouse = new THREE.Vector2(
                        (centerX / canvasWidth) * 2 - 1,
                        -((centerY / canvasHeight) * 2 - 1)
                    );
                    
                    const zoomFactor = Math.min(canvasWidth / boxWidth, canvasHeight / boxHeight);
                    
                    const currentDistance = this.camera.position.distanceTo(this.controls.target);
                    const newDistance = currentDistance / zoomFactor;
                    const clampedDistance = Math.max(
                        this.controls.minDistance,
                        Math.min(this.controls.maxDistance, newDistance)
                    );
                    
                    const raycaster = new THREE.Raycaster();
                    raycaster.setFromCamera(mouse, this.camera);
                    
                    const cameraDirection = new THREE.Vector3();
                    cameraDirection.subVectors(this.camera.position, this.controls.target).normalize();
                    
                    const plane = new THREE.Plane();
                    plane.setFromNormalAndCoplanarPoint(cameraDirection, this.controls.target);
                    
                    const zoomPoint = new THREE.Vector3();
                    if (raycaster.ray.intersectPlane(plane, zoomPoint)) {
                        const direction = new THREE.Vector3();
                        direction.subVectors(this.camera.position, zoomPoint).normalize();
                        
                        const newCameraPosition = zoomPoint.clone().addScaledVector(direction, clampedDistance);
                        const cameraOffset = new THREE.Vector3().subVectors(newCameraPosition, this.camera.position);
                        
                        this.controls.target.add(cameraOffset);
                        this.camera.position.copy(newCameraPosition);
                        this.camera.lookAt(this.controls.target);
                        this.controls.update();
                    }
                }
                
                if (zoomBox) {
                    zoomBox.style.display = 'none';
                }
            }
        });
        
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.areaZoomActive) {
                this.toggleAreaZoom();
            }
        });
    };
    
    // ============================================================================
    // BOX SELECTION HELPERS
    // ============================================================================
    GLTFViewer.prototype._createSelectionBox = function() {
        if (!this.selectionBox) {
            this.selectionBox = document.createElement('div');
            this.selectionBox.id = 'selection-box';
            this.selectionBox.style.position = 'absolute';
            this.selectionBox.style.border = '2px dashed #FFA500';
            this.selectionBox.style.backgroundColor = 'rgba(255, 165, 0, 0.1)';
            this.selectionBox.style.pointerEvents = 'none';
            this.selectionBox.style.zIndex = '10001';
            this.selectionBox.style.display = 'none';
            document.getElementById('container').appendChild(this.selectionBox);
        }
        this.selectionBox.style.display = 'block';
    };
    
    GLTFViewer.prototype._updateSelectionBox = function() {
        if (!this.selectionBox || !this.boxSelectionStart || !this.boxSelectionEnd) return;
        
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        
        const left = Math.min(this.boxSelectionStart.x, this.boxSelectionEnd.x) - rect.left;
        const top = Math.min(this.boxSelectionStart.y, this.boxSelectionEnd.y) - rect.top;
        const width = Math.abs(this.boxSelectionEnd.x - this.boxSelectionStart.x);
        const height = Math.abs(this.boxSelectionEnd.y - this.boxSelectionStart.y);
        
        this.selectionBox.style.left = left + 'px';
        this.selectionBox.style.top = top + 'px';
        this.selectionBox.style.width = width + 'px';
        this.selectionBox.style.height = height + 'px';
    };
    
    GLTFViewer.prototype._finishBoxSelection = function() {
        if (!this.boxSelectionStart || !this.boxSelectionEnd) return;
        
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const container = document.getElementById('container');
        const canvasWidth = container.clientWidth - this.sidebarWidth;
        const canvasHeight = container.clientHeight;
        
        const boxLeft = Math.min(this.boxSelectionStart.x, this.boxSelectionEnd.x) - rect.left;
        const boxRight = Math.max(this.boxSelectionStart.x, this.boxSelectionEnd.x) - rect.left;
        const boxTop = Math.min(this.boxSelectionStart.y, this.boxSelectionEnd.y) - rect.top;
        const boxBottom = Math.max(this.boxSelectionStart.y, this.boxSelectionEnd.y) - rect.top;
        
        const ndcLeft = (boxLeft / canvasWidth) * 2 - 1;
        const ndcRight = (boxRight / canvasWidth) * 2 - 1;
        const ndcTop = 1 - (boxTop / canvasHeight) * 2;
        const ndcBottom = 1 - (boxBottom / canvasHeight) * 2;
        
        const selectedParts = [];
        
        if (this.loadedModels && this.loadedModels.length > 0) {
            this.loadedModels.forEach(modelData => {
                modelData.model.traverse((object) => {
                    if (object.isMesh && object.visible) {
                        const box = new THREE.Box3().setFromObject(object);
                        const corners = [
                            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
                            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
                            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
                            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
                            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
                            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
                            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
                            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
                        ];
                        
                        let isInside = false;
                        for (let corner of corners) {
                            const projected = corner.clone().project(this.camera);
                            if (projected.x >= ndcLeft && projected.x <= ndcRight &&
                                projected.y >= ndcBottom && projected.y <= ndcTop) {
                                isInside = true;
                                break;
                            }
                        }
                        
                        if (!isInside) {
                            const center = box.getCenter(new THREE.Vector3());
                            const projected = center.clone().project(this.camera);
                            if (projected.x >= ndcLeft && projected.x <= ndcRight &&
                                projected.y >= ndcBottom && projected.y <= ndcTop) {
                                isInside = true;
                            }
                        }
                        
                        if (isInside) {
                            const part = this.partsList.find(p => p.object.uuid === object.uuid);
                            if (part && part.visible) {
                                selectedParts.push(part.uuid);
                            }
                        }
                    }
                });
            });
        }
        
        if (selectedParts.length > 0) {
            this.clearSelection();
            selectedParts.forEach(uuid => {
                this.selectPart(uuid, true);
            });
        }
        
        if (this.selectionBox) {
            this.selectionBox.style.display = 'none';
        }
        
        this.boxSelectionStart = null;
        this.boxSelectionEnd = null;
    };
}

// If viewer is already initialized, trigger re-setup of controls
if (typeof window !== 'undefined' && window.viewer && typeof window.viewer.reSetupControls === 'function') {
    // Wait a bit for all methods to be added to prototype
    setTimeout(() => {
        if (window.viewer && !window.viewer._controlsSetupComplete) {
            console.log('Viewer already initialized, re-setting up controls...');
            window.viewer.reSetupControls();
        }
    }, 50);
}
