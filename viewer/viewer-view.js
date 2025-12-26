/**
 * GLTF Viewer - View Operations Module
 * Handles view operations (reset, fit screen, boundary box, wireframe) and global functions
 */

// Add view methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    GLTFViewer.prototype.resetView = function() {
        if (this.loadedModels && this.loadedModels.length > 0) {
            // Calculate boundary box center (always, for rotation)
            if (typeof this.calculateBoundaryBoxCenter === 'function') {
                this.calculateBoundaryBoxCenter();
            }
            
            // Calculate canvas area excluding sidebar
            const container = document.getElementById('container');
            const canvasWidth = container.clientWidth - this.sidebarWidth;
            const canvasHeight = container.clientHeight;
            
            if (canvasWidth <= 0 || canvasHeight <= 0) {
                return;
            }

            // Update renderer viewport to exclude sidebar
            if (this.renderer) {
                this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
            }
            
            // Always reset to default isometric view and fit to preview box
            // Use only visible meshes for boundary box calculation
            const bounds = this._computeBoundingInfo
                ? this._computeBoundingInfo({ visibleOnly: true })
                : null;
            
            if (!bounds) {
                return;
            }
            
            // Default isometric view direction (same as import default)
            const viewDirection = new THREE.Vector3(1, -1, -1).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            
            // Check if preview box exists - if yes, fit to preview box
            if (this.previewBox) {
                // Get preview box dimensions
                const boxLeft = parseFloat(this.previewBox.style.left) || 0;
                const boxTop = parseFloat(this.previewBox.style.top) || 0;
                const boxWidth = parseFloat(this.previewBox.style.width) || canvasWidth;
                const boxHeight = parseFloat(this.previewBox.style.height) || canvasHeight;

                const ndcX = (boxLeft + boxWidth / 2) / canvasWidth * 2 - 1;
                const ndcY = 1 - (boxTop + boxHeight / 2) / canvasHeight * 2;
                const scaleX = boxWidth / canvasWidth;
                const scaleY = boxHeight / canvasHeight;
                
                this._applyCameraFit(bounds, {
                    canvasWidth,
                    canvasHeight,
                    ndcX,
                    ndcY,
                    scaleX,
                    scaleY,
                    viewDirection,
                    up,
                    enforceViewport: false
                });
            } else {
                // No preview box - fit to full screen with default isometric view
            this._applyCameraFit(bounds, {
                canvasWidth,
                canvasHeight,
                viewDirection,
                up,
                enforceViewport: false
            });
            }
        }
    };
    
    GLTFViewer.prototype.toggleWireframe = function() {
        this.wireframeEnabled = !this.wireframeEnabled;
        
        if (this.loadedModels && this.loadedModels.length > 0) {
            this.loadedModels.forEach(modelData => {
                modelData.model.traverse((child) => {
                    if (child.isMesh && child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                mat.wireframe = this.wireframeEnabled;
                            });
                        } else {
                            child.material.wireframe = this.wireframeEnabled;
                        }
                    }
                });
            });
        }
    };
    
    GLTFViewer.prototype.calculateBoundaryBoxCenter = function() {
        // Calculate boundary box center of visible parts (always, even if not visible)
        if (!this.loadedModels || this.loadedModels.length === 0) {
            this.boundaryBoxCenter = null;
            return null;
        }
        
        // Calculate bounding box of only visible objects from all models
        const box = new THREE.Box3();
        let hasVisibleObjects = false;
        
        this.loadedModels.forEach(modelData => {
            modelData.model.traverse((child) => {
                if (child.isMesh && child.visible) {
                    const childBox = new THREE.Box3().setFromObject(child);
                    if (childBox.isEmpty() === false) {
                        if (!hasVisibleObjects) {
                            box.copy(childBox);
                            hasVisibleObjects = true;
                        } else {
                            box.union(childBox);
                        }
                    }
                }
            });
        });
        
        if (!hasVisibleObjects || box.isEmpty()) {
            this.boundaryBoxCenter = null;
            return null;
        }
        
        // Calculate and store boundary box center
        const center = box.getCenter(new THREE.Vector3());
        this.boundaryBoxCenter = center.clone();
        return this.boundaryBoxCenter;
    };

    GLTFViewer.prototype._computeBoundingInfo = function(options = {}) {
        const { visibleOnly = false } = options;

        if (!this.loadedModels || this.loadedModels.length === 0) {
            return null;
        }

        const aggregateBox = new THREE.Box3();
        const tempBox = new THREE.Box3();
        let hasObjects = false;

        this.loadedModels.forEach(modelData => {
            if (!modelData || !modelData.model) {
                return;
            }

            if (!visibleOnly) {
                tempBox.setFromObject(modelData.model);
                if (!tempBox.isEmpty()) {
                    if (!hasObjects) {
                        aggregateBox.copy(tempBox);
                        hasObjects = true;
                    } else {
                        aggregateBox.union(tempBox);
                    }
                }
                return;
            }

            modelData.model.traverse(child => {
                if (!child || !child.isMesh) {
                    return;
                }

                if (visibleOnly && !child.visible) {
                    return;
                }

                tempBox.setFromObject(child);
                if (!tempBox.isEmpty()) {
                    if (!hasObjects) {
                        aggregateBox.copy(tempBox);
                        hasObjects = true;
                    } else {
                        aggregateBox.union(tempBox);
                    }
                }
            });
        });

        if (!hasObjects || aggregateBox.isEmpty()) {
            return null;
        }

        const center = aggregateBox.getCenter(new THREE.Vector3());
        const sphere = new THREE.Sphere();
        aggregateBox.getBoundingSphere(sphere);

        return {
            box: aggregateBox,
            center,
            sphere
        };
    };

    GLTFViewer.prototype._applyCameraFit = function(bounds, options = {}) {
        if (!bounds) {
            return false;
        }

        const {
            canvasWidth,
            canvasHeight,
            ndcX = 0,
            ndcY = 0,
            scaleX = 1,
            scaleY = 1,
            viewDirection = null,
            up = null,
            enforceViewport = false
        } = options;

        if (!canvasWidth || !canvasHeight) {
            return false;
        }

        const camera = this.camera;
        if (!camera) {
            return false;
        }

        const renderer = this.renderer;
        const controls = this.controls;

        const aspect = canvasWidth / canvasHeight;
        if (typeof this._updateActiveCameraProjection === 'function') {
            this._updateActiveCameraProjection(aspect);
        } else if (camera.isPerspectiveCamera) {
            camera.aspect = aspect;
            camera.updateProjectionMatrix();
        } else if (camera.isOrthographicCamera) {
            const frustumHeight = this._orthoFrustumHeight || 10;
            const halfH = frustumHeight / 2;
            const halfW = halfH * aspect;
            camera.left = -halfW;
            camera.right = halfW;
            camera.top = halfH;
            camera.bottom = -halfH;
            camera.updateProjectionMatrix();
        }

        if (renderer && enforceViewport) {
            renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        }

        const isOrtho = camera.isOrthographicCamera === true;
        const sourceCamera = camera.isPerspectiveCamera
            ? camera
            : (this.perspectiveCamera || new THREE.PerspectiveCamera(45, aspect, 0.1, 1000));
        const vFov = THREE.MathUtils.degToRad(sourceCamera.fov);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

        const clampedScaleX = THREE.MathUtils.clamp(scaleX, 0.05, 1);
        const clampedScaleY = THREE.MathUtils.clamp(scaleY, 0.05, 1);

        const radius = Math.max(bounds.sphere.radius, 0.001);
        
        let requiredDistance;
        let viewHeight;
        let viewWidth;
        
        if (isOrtho) {
            // For orthographic cameras, we need to calculate the bounding box size
            // in the camera's view space. First, we'll set up a temporary camera
            // to calculate the projected dimensions.
            
            // Get bounding box corners
            const box = bounds.box;
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
            
            // Calculate camera basis vectors (will be set later, but we need them for projection)
            // For now, use a simple approximation based on bounding box size
            const boxSize = box.getSize(new THREE.Vector3());
            
            // Use the maximum dimension as a base, accounting for the view direction
            // This is an approximation - the actual size depends on the view angle
            const maxDim = Math.max(boxSize.x, boxSize.y, boxSize.z);
            
            // Calculate base dimensions needed to fit the bounding box
            // Add padding (5% margin)
            const baseSize = maxDim * 1.05;
            
            // Apply preview box scaling - smaller scale means we need larger frustum
            // to show the same content in a smaller area
            viewHeight = baseSize / Math.max(clampedScaleY, 0.05);
            viewWidth = baseSize / Math.max(clampedScaleX, 0.05);
            
            // Ensure aspect ratio is maintained
            if (viewWidth / viewHeight > aspect) {
                viewHeight = viewWidth / aspect;
            } else {
                viewWidth = viewHeight * aspect;
            }
            
            // Distance doesn't matter for orthographic, but keep it for consistency
            requiredDistance = this._orthoFrustumDistance || 5;
        } else {
            // For perspective cameras, use FOV-based calculation
        const effectiveVFov = 2 * Math.atan(Math.tan(vFov / 2) * clampedScaleY);
        const effectiveHFov = 2 * Math.atan(Math.tan(hFov / 2) * clampedScaleX);

        const minSin = 1e-4;
        const distanceForHeight = radius / Math.max(Math.sin(effectiveVFov / 2), minSin);
        const distanceForWidth = radius / Math.max(Math.sin(effectiveHFov / 2), minSin);

            requiredDistance = Math.max(distanceForHeight, distanceForWidth);
        requiredDistance = Math.max(requiredDistance, radius);
        requiredDistance *= 1.05;

        const minDistance = controls && typeof controls.minDistance === 'number' ? controls.minDistance : 0.01;
        const maxDistance = controls && typeof controls.maxDistance === 'number' ? controls.maxDistance : Infinity;
            requiredDistance = THREE.MathUtils.clamp(requiredDistance, minDistance, maxDistance);
            
            viewHeight = 2 * Math.tan(vFov / 2) * requiredDistance;
            viewWidth = viewHeight * aspect;
        }

        const minDistance = controls && typeof controls.minDistance === 'number' ? controls.minDistance : 0.01;
        const maxDistance = controls && typeof controls.maxDistance === 'number' ? controls.maxDistance : Infinity;
        const clampedDistance = isOrtho ? (this._orthoFrustumDistance || 5) : THREE.MathUtils.clamp(requiredDistance, minDistance, maxDistance);

        const desiredUp = (up ? up.clone() : camera.up.clone()).normalize();
        let cameraDir;
        if (viewDirection) {
            cameraDir = viewDirection.clone().normalize();
        } else {
            cameraDir = camera.getWorldDirection(new THREE.Vector3()).normalize();
        }
        if (cameraDir.lengthSq() < 1e-8) {
            cameraDir.set(0, 0, -1);
        }

        let cameraRight = new THREE.Vector3().crossVectors(cameraDir, desiredUp).normalize();
        if (cameraRight.lengthSq() < 1e-8) {
            const fallbackUp = Math.abs(cameraDir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            cameraRight = new THREE.Vector3().crossVectors(cameraDir, fallbackUp).normalize();
        }
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();

        const offsetX = ndcX * (viewWidth / 2);
        const offsetY = ndcY * (viewHeight / 2);

        const offsetWorld = new THREE.Vector3()
            .addScaledVector(cameraRight, offsetX)
            .addScaledVector(cameraUp, offsetY);

        const targetPoint = bounds.center.clone().sub(offsetWorld);
        const cameraPosition = targetPoint.clone().sub(cameraDir.clone().multiplyScalar(clampedDistance));

        camera.position.copy(cameraPosition);
        camera.up.copy(cameraUp);
        camera.lookAt(targetPoint);

        if (isOrtho) {
            // For orthographic cameras, recalculate frustum size based on actual bounding box
            // dimensions in camera space after camera is positioned
            // Optimized: reuse single Vector3 object and use direct calculations
            const box = bounds.box;
            
            // Calculate camera space basis vectors (reuse existing cameraRight if available)
            const cameraRightVec = new THREE.Vector3().crossVectors(cameraDir, cameraUp).normalize();
            
            // Reuse a single Vector3 for calculations to avoid allocations
            const tempVec = new THREE.Vector3();
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            
            // Project all 8 corners efficiently - use array of coordinates to avoid Vector3 creation
            const min = box.min;
            const max = box.max;
            const corners = [
                [min.x, min.y, min.z], [max.x, min.y, min.z],
                [min.x, max.y, min.z], [max.x, max.y, min.z],
                [min.x, min.y, max.z], [max.x, min.y, max.z],
                [min.x, max.y, max.z], [max.x, max.y, max.z]
            ];
            
            // Fast projection loop - reuse tempVec
            for (let i = 0; i < 8; i++) {
                const c = corners[i];
                tempVec.set(c[0], c[1], c[2]);
                tempVec.sub(targetPoint);
                const x = tempVec.dot(cameraRightVec);
                const y = tempVec.dot(cameraUp);
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            
            // Calculate dimensions in camera space (add padding)
            const width = (maxX - minX) * 1.05;
            const height = (maxY - minY) * 1.05;
            
            // Account for preview box scaling
            const scaledWidth = width / Math.max(clampedScaleX, 0.05);
            const scaledHeight = height / Math.max(clampedScaleY, 0.05);
            
            // Ensure aspect ratio is maintained
            if (scaledWidth / scaledHeight > aspect) {
                viewHeight = scaledWidth / aspect;
                viewWidth = scaledWidth;
            } else {
                viewHeight = scaledHeight;
                viewWidth = scaledHeight * aspect;
            }
            
            this._orthoFrustumHeight = viewHeight;
            this._orthoFrustumDistance = clampedDistance;
            const halfH = viewHeight / 2;
            const halfW = halfH * aspect;
            camera.left = -halfW;
            camera.right = halfW;
            camera.top = halfH;
            camera.bottom = -halfH;
            // Reset zoom to 1 when fitting (zoom will be recalculated if needed)
            camera.zoom = 1;
            camera.updateProjectionMatrix();
        }

        if (controls) {
            controls.target.copy(targetPoint);
            controls.update();
        }

        this.rotationPivot = bounds.center.clone();
        this.rotationPivotOffset = offsetWorld.clone();
        this.rotationPivotDistance = clampedDistance;
        this.rotationViewDirection = cameraDir.clone();
        this.rotationUp = cameraUp.clone();

        this.boundaryBoxCenter = bounds.center.clone();

        return true;
    };
    
    GLTFViewer.prototype.updateBoundaryBox = function() {
        // Update boundary box to reflect only visible parts
        if (!this.boundaryBoxVisible || !this.loadedModels || this.loadedModels.length === 0) {
            // Still calculate center even if not visible (for rotation)
            this.calculateBoundaryBoxCenter();
            return;
        }
        
        // Remove old boundary box
        if (this.boundaryBoxHelper) {
            this.scene.remove(this.boundaryBoxHelper);
            this.boundaryBoxHelper.geometry.dispose();
            this.boundaryBoxHelper.material.dispose();
        }
        
        // Calculate boundary box center (reuse the helper method)
        const center = this.calculateBoundaryBoxCenter();
        
        if (!center) {
            // No visible objects, remove boundary box
            if (this.boundaryBoxHelper) {
                this.scene.remove(this.boundaryBoxHelper);
                this.boundaryBoxHelper.geometry.dispose();
                this.boundaryBoxHelper.material.dispose();
                this.boundaryBoxHelper = null;
            }
            this.boundaryBoxCenter = null;
            return;
        }
        
        // Calculate bounding box for visual helper (already calculated in calculateBoundaryBoxCenter)
        // Recalculate for visual helper
        const box = new THREE.Box3();
        let hasVisibleObjects = false;
        
        this.loadedModels.forEach(modelData => {
            modelData.model.traverse((child) => {
                if (child.isMesh && child.visible) {
                    const childBox = new THREE.Box3().setFromObject(child);
                    if (childBox.isEmpty() === false) {
                        if (!hasVisibleObjects) {
                            box.copy(childBox);
                            hasVisibleObjects = true;
                        } else {
                            box.union(childBox);
                        }
                    }
                }
            });
        });
        
        // Create boundary box helper
        const size = box.getSize(new THREE.Vector3());
        
        const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        const material = new THREE.LineBasicMaterial({ 
            color: 0xffff00, // Yellow color
            linewidth: 2
        });
        
        const edges = new THREE.EdgesGeometry(geometry);
        this.boundaryBoxHelper = new THREE.LineSegments(edges, material);
        this.boundaryBoxHelper.position.copy(center);
        this.scene.add(this.boundaryBoxHelper);
        
        // Update controls target to boundary box center only when boundary box is first enabled
        // Don't change camera position to avoid unwanted zoom changes
        if (this.controls && this.boundaryBoxVisible) {
            // Only update target if it's not already set to boundary box center
            // This prevents camera movement when boundary box updates (e.g., after hiding parts)
            const targetDistance = this.controls.target.distanceTo(this.boundaryBoxCenter);
            if (targetDistance > 0.001) { // Only update if target is significantly different
                // Calculate offset from current target to new center
                const offset = new THREE.Vector3();
                offset.subVectors(this.boundaryBoxCenter, this.controls.target);
                
                // Move both target and camera by the same offset to maintain view
                this.controls.target.copy(this.boundaryBoxCenter);
                this.camera.position.add(offset);
                this.camera.lookAt(this.boundaryBoxCenter);
                this.controls.update();
            }
        }
    };
    
    GLTFViewer.prototype.toggleBoundaryBox = function() {
        this.boundaryBoxVisible = !this.boundaryBoxVisible;
        
        if (!this.loadedModels || this.loadedModels.length === 0) {
            return;
        }
        
        if (this.boundaryBoxVisible) {
            this.updateBoundaryBox();
        } else {
            // Remove boundary box helper
            if (this.boundaryBoxHelper) {
                this.scene.remove(this.boundaryBoxHelper);
                this.boundaryBoxHelper.geometry.dispose();
                this.boundaryBoxHelper.material.dispose();
                this.boundaryBoxHelper = null;
            }
            // Still calculate center even when boundary box is hidden (for rotation)
            this.calculateBoundaryBoxCenter();
        }
    };

    
    GLTFViewer.prototype.clear = function() {
        // Clear selection
        if (typeof this.clearSelection === 'function') {
            this.clearSelection();
        }
        
        // Remove boundary box if visible
        if (this.boundaryBoxHelper) {
            this.scene.remove(this.boundaryBoxHelper);
            this.boundaryBoxHelper.geometry.dispose();
            this.boundaryBoxHelper.material.dispose();
            this.boundaryBoxHelper = null;
        }
        this.boundaryBoxVisible = false;
        this.boundaryBoxCenter = null;
        
        // Remove all models from scene
        if (this.loadedModels && this.loadedModels.length > 0) {
            this.loadedModels.forEach(modelData => {
                this.scene.remove(modelData.model);
            });
        }
        this.loadedModels = [];
        
        // Stop all mixers
        if (this.mixers && this.mixers.length > 0) {
            this.mixers.forEach(mixer => {
                if (mixer) {
                    mixer.stopAllAction();
                }
            });
        }
        this.mixers = [];
        this.animations = [];
        this.partsList = [];
        this.originalMaterials.clear();
        this.selectedPartUUIDs = [];
        
        // Clear tree
        const treeContainer = document.getElementById('tree-container');
        if (treeContainer) {
            treeContainer.innerHTML = '<div id="tree-placeholder" style="padding: 20px; color: #999; text-align: center;">No model loaded. Open a GLTF/GLB file to see parts.</div>';
        }
        
        // Hide search box
        const searchContainer = document.getElementById('tree-search');
        if (searchContainer) {
            searchContainer.style.display = 'none';
        }
        const searchInput = document.getElementById('tree-search-input');
        if (searchInput) {
            searchInput.value = '';
        }

        if (this.sectionManager && typeof this.sectionManager.onSceneBoundsChanged === 'function') {
            this.sectionManager.onSceneBoundsChanged();
        }
        
        // Clear material manager data
        if (this.materialManager && typeof this.materialManager.clear === 'function') {
            this.materialManager.clear();
        }
    };
}

function updateCameraProjectionForViewer(viewer, aspect) {
    if (!viewer || !viewer.camera || !isFinite(aspect)) {
        return;
    }
    
    if (typeof viewer._updateActiveCameraProjection === 'function') {
        viewer._updateActiveCameraProjection(aspect);
        return;
    }
    
    if (viewer.camera.isPerspectiveCamera) {
        viewer.camera.aspect = aspect;
    } else if (viewer.camera.isOrthographicCamera) {
        const frustumHeight = viewer._orthoFrustumHeight || 10;
        const halfH = frustumHeight / 2;
        const halfW = halfH * aspect;
        viewer.camera.left = -halfW;
        viewer.camera.right = halfW;
        viewer.camera.top = halfH;
        viewer.camera.bottom = -halfH;
    }
    viewer.camera.updateProjectionMatrix();
}

// Global functions for browser controls
function resetView() {
    if (viewer) {
        viewer.resetView();
        console.log('View reset');
    }
}

function toggleWireframe() {
    if (viewer) {
        viewer.toggleWireframe();
        const btn = document.getElementById('wireframe-btn');
        if (btn) {
            if (viewer.wireframeEnabled) {
                btn.classList.add('active');
                btn.textContent = 'Wireframe ON';
            } else {
                btn.classList.remove('active');
                btn.textContent = 'Toggle Wireframe';
            }
        }
    }
}

function fitToView() {
    if (viewer && viewer.loadedModels && viewer.loadedModels.length > 0) {
        // Calculate canvas area excluding sidebar
        const container = document.getElementById('container');
        const canvasWidth = container.clientWidth - viewer.sidebarWidth;
        const canvasHeight = container.clientHeight;
        const aspect = canvasWidth / canvasHeight;
        
        // Update camera projection for visible area
        updateCameraProjectionForViewer(viewer, aspect);
        
        // Update renderer viewport to exclude sidebar
        viewer.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        
        // Calculate combined bounding box for all models
        const box = new THREE.Box3();
        let hasModels = false;
        viewer.loadedModels.forEach(modelData => {
            const modelBox = new THREE.Box3().setFromObject(modelData.model);
            if (!modelBox.isEmpty()) {
                if (!hasModels) {
                    box.copy(modelBox);
                    hasModels = true;
                } else {
                    box.union(modelBox);
                }
            }
        });
        
        if (hasModels) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim * 2;
            
            viewer.camera.position.set(center.x + distance, center.y + distance, center.z + distance);
            viewer.camera.lookAt(center);
            
            if (viewer.controls) {
                viewer.controls.target.copy(center);
                viewer.controls.update();
            }
            console.log('Fitted to view');
        }
    }
}

/**
 * Reset camera to isometric angle and fit to preview box
 * Uses only visible meshes and preserves current rotation
 */
function resetToPreviewBox(canvasWidth, canvasHeight) {
    if (!viewer || !viewer.previewBox) return;
    
    // Update preview box dimensions first
    if (viewer.updatePreviewBox) {
        viewer.updatePreviewBox();
    }
    
    // Get preview box dimensions
    const boxLeft = parseFloat(viewer.previewBox.style.left) || 0;
    const boxTop = parseFloat(viewer.previewBox.style.top) || 0;
    const boxWidth = parseFloat(viewer.previewBox.style.width) || canvasWidth;
    const boxHeight = parseFloat(viewer.previewBox.style.height) || canvasHeight;

    // Use only visible meshes for boundary box calculation
    const bounds = viewer._computeBoundingInfo
        ? viewer._computeBoundingInfo({ visibleOnly: true })
        : null;

    if (!bounds) {
        return;
    }

    const ndcX = (boxLeft + boxWidth / 2) / canvasWidth * 2 - 1;
    const ndcY = 1 - (boxTop + boxHeight / 2) / canvasHeight * 2;
    const scaleX = boxWidth / canvasWidth;
    const scaleY = boxHeight / canvasHeight;

    // Preserve current rotation instead of forcing isometric
    // Get current camera direction to maintain rotation
    const currentDirection = viewer.camera.getWorldDirection(new THREE.Vector3());
    const currentUp = viewer.camera.up.clone();
    
    // Use current rotation if available, otherwise use isometric
    const viewDirection = currentDirection.lengthSq() > 0.1 ? currentDirection : new THREE.Vector3(1, -1, -1);
    const up = currentUp.lengthSq() > 0.1 ? currentUp : new THREE.Vector3(0, 1, 0);

    viewer._applyCameraFit(bounds, {
        canvasWidth,
        canvasHeight,
        ndcX,
        ndcY,
        scaleX,
        scaleY,
        viewDirection,
        up
    });
}

/**
 * Fit camera to show preview box area (whether active or not)
 */
function fitToPreviewBox(canvasWidth, canvasHeight) {
    if (!viewer || !viewer.previewBox) return;
    
    // Get preview box dimensions
    const boxLeft = parseFloat(viewer.previewBox.style.left) || 0;
    const boxTop = parseFloat(viewer.previewBox.style.top) || 0;
    const boxWidth = parseFloat(viewer.previewBox.style.width) || canvasWidth;
    const boxHeight = parseFloat(viewer.previewBox.style.height) || canvasHeight;

    const ndcCenterX = (boxLeft + boxWidth / 2) / canvasWidth * 2 - 1;
    const ndcCenterY = 1 - (boxTop + boxHeight / 2) / canvasHeight * 2;
    const scaleX = boxWidth / canvasWidth;
    const scaleY = boxHeight / canvasHeight;

    const bounds = viewer._computeBoundingInfo
        ? viewer._computeBoundingInfo({ visibleOnly: true })
        : null;

    if (!bounds) {
        return;
    }

    // Preserve current rotation
    const currentDirection = viewer.camera.getWorldDirection(new THREE.Vector3());
    const currentUp = viewer.camera.up.clone();

    viewer._applyCameraFit(bounds, {
        canvasWidth,
        canvasHeight,
        ndcX: ndcCenterX,
        ndcY: ndcCenterY,
        scaleX,
        scaleY,
        viewDirection: currentDirection.lengthSq() > 0.1 ? currentDirection : null,
        up: currentUp.lengthSq() > 0.1 ? currentUp : null
    });
}

function fitScreen() {
    // Fit model to screen without resetting rotation/view
    if (viewer && viewer.loadedModels && viewer.loadedModels.length > 0) {
        // Calculate canvas area excluding sidebar
        const container = document.getElementById('container');
        const canvasWidth = container.clientWidth - viewer.sidebarWidth;
        const canvasHeight = container.clientHeight;
        const aspect = canvasWidth / canvasHeight;
        
        // Update camera projection for visible area
        updateCameraProjectionForViewer(viewer, aspect);
        // Update camera projection for visible area
        updateCameraProjectionForViewer(viewer, aspect);
        
        // Update renderer viewport to exclude sidebar
        viewer.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        
        // If preview box exists and is active, fit to it
        if (viewer.previewActive && viewer.previewBox && 
            viewer.previewBox.style.left !== '' && 
            viewer.previewBox.style.width !== '') {
            // Fit to current preview box area
            fitToPreviewBox(canvasWidth, canvasHeight);
            return;
        }
        
        // If preview box is OFF but exists, treat the entire viewport as preview area
        if (!viewer.previewActive && viewer.previewBox) {
            const bounds = viewer._computeBoundingInfo
                ? viewer._computeBoundingInfo({ visibleOnly: true })
                : null;
            if (!bounds) {
                return;
            }
            viewer._applyCameraFit(bounds, {
                canvasWidth,
                canvasHeight
            });
            return;
        }
        
        // Calculate combined bounding box for all models
        const bounds = viewer._computeBoundingInfo
            ? viewer._computeBoundingInfo({ visibleOnly: false })
            : null;
        
        if (!bounds) {
            return;
        }
        
        viewer._applyCameraFit(bounds, {
            canvasWidth,
            canvasHeight
        });
    }
}

function toggleAreaZoom() {
    if (viewer && typeof viewer.toggleAreaZoom === 'function') {
        viewer.toggleAreaZoom();
    }
}

function togglePreview() {
    if (viewer && typeof viewer.togglePreview === 'function') {
        viewer.togglePreview();
    }
}

function toggleBoundaryBox() {
    if (viewer) {
        viewer.toggleBoundaryBox();
        const btn = document.getElementById('boundary-box-btn');
        if (btn) {
            if (viewer.boundaryBoxVisible) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }
}

function toggleRandomColors() {
    if (viewer && typeof viewer.toggleRandomColors === 'function') {
        viewer.toggleRandomColors();
    }
}

function togglePerspectiveMode() {
    if (viewer && typeof viewer.togglePerspectiveMode === 'function') {
        viewer.togglePerspectiveMode();
    }
}

function toggleMoveTool() {
    const btn = document.getElementById('move-tool');
    const isActive = btn && btn.classList.contains('active');
    
    // Deactivate other transform tools
    ['rotate-tool', 'transform-tool', 'scale-tool'].forEach(id => {
        const otherBtn = document.getElementById(id);
        if (otherBtn) {
            otherBtn.classList.remove('active');
            otherBtn.setAttribute('aria-pressed', 'false');
        }
    });
    
    if (isActive) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        if (viewer && typeof viewer.hideTransformGizmo === 'function') {
            viewer.hideTransformGizmo();
        }
    } else {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        if (viewer && viewer.selectedPartUUIDs && viewer.selectedPartUUIDs.length > 0) {
            if (typeof viewer.showMoveGizmo === 'function') {
                viewer.showMoveGizmo(viewer.selectedPartUUIDs[0]);
            }
        }
    }
}

function toggleRotateTool() {
    const btn = document.getElementById('rotate-tool');
    const isActive = btn && btn.classList.contains('active');
    
    ['move-tool', 'transform-tool', 'scale-tool'].forEach(id => {
        const otherBtn = document.getElementById(id);
        if (otherBtn) {
            otherBtn.classList.remove('active');
            otherBtn.setAttribute('aria-pressed', 'false');
        }
    });
    
    if (isActive) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        if (viewer && typeof viewer.hideTransformGizmo === 'function') {
            viewer.hideTransformGizmo();
        }
        // Re-enable camera rotation
        if (viewer && viewer.controls) {
            viewer.controls.enableRotate = true;
        }
    } else {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        // Disable camera rotation while tool is active
        if (viewer && viewer.controls) {
            viewer.controls.enableRotate = false;
        }
        if (viewer && viewer.selectedPartUUIDs && viewer.selectedPartUUIDs.length > 0) {
            if (typeof viewer.showRotateGizmo === 'function') {
                viewer.showRotateGizmo(viewer.selectedPartUUIDs[0]);
            }
        }
    }
}

function toggleTransformTool() {
    const btn = document.getElementById('transform-tool');
    const isActive = btn && btn.classList.contains('active');
    
    ['move-tool', 'rotate-tool', 'scale-tool'].forEach(id => {
        const otherBtn = document.getElementById(id);
        if (otherBtn) {
            otherBtn.classList.remove('active');
            otherBtn.setAttribute('aria-pressed', 'false');
        }
    });
    
    if (isActive) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        if (viewer && typeof viewer.hideTransformGizmo === 'function') {
            viewer.hideTransformGizmo();
        }
        // Re-enable camera rotation
        if (viewer && viewer.controls) {
            viewer.controls.enableRotate = true;
        }
    } else {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        // Disable camera rotation while tool is active
        if (viewer && viewer.controls) {
            viewer.controls.enableRotate = false;
        }
        if (viewer && viewer.selectedPartUUIDs && viewer.selectedPartUUIDs.length > 0) {
            if (typeof viewer.showTransformGizmo === 'function') {
                viewer.showTransformGizmo(viewer.selectedPartUUIDs[0]);
            }
        }
    }
}

function toggleScaleTool() {
    const btn = document.getElementById('scale-tool');
    const isActive = btn && btn.classList.contains('active');
    
    ['move-tool', 'rotate-tool', 'transform-tool'].forEach(id => {
        const otherBtn = document.getElementById(id);
        if (otherBtn) {
            otherBtn.classList.remove('active');
            otherBtn.setAttribute('aria-pressed', 'false');
        }
    });
    
    if (isActive) {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
        if (viewer && typeof viewer.hideTransformGizmo === 'function') {
            viewer.hideTransformGizmo();
        }
        // Re-enable camera rotation
        if (viewer && viewer.controls) {
            viewer.controls.enableRotate = true;
        }
    } else {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        // Disable camera rotation while tool is active
        if (viewer && viewer.controls) {
            viewer.controls.enableRotate = false;
        }
        if (viewer && viewer.selectedPartUUIDs && viewer.selectedPartUUIDs.length > 0) {
            if (typeof viewer.showScaleGizmo === 'function') {
                viewer.showScaleGizmo(viewer.selectedPartUUIDs[0]);
            }
        }
    }
}

async function captureImage() {
    if (!viewer || !viewer.loadedModels || viewer.loadedModels.length === 0) {
        alert('Please load a model first.');
        return;
    }
    
    let imageData;
    
    if (viewer.previewActive && typeof viewer.capturePreviewImage === 'function') {
        // Capture preview box area at high quality
        imageData = viewer.capturePreviewImage();
        if (!imageData) {
            alert('Failed to capture preview image.');
            return;
        }
    } else {
        // Render a frame to ensure canvas has latest content
        if (viewer.scene && viewer.camera && typeof viewer.renderer.render === 'function') {
            viewer.renderer.render(viewer.scene, viewer.camera);
        }
        // Capture entire canvas
        const canvas = viewer.renderer.domElement;
        imageData = canvas.toDataURL('image/png', 1.0);
    }
    
    // Try to save to server export folder first
    const serverPort = window.location.port || '8765';
    const apiUrl = `http://localhost:${serverPort}/api/capture-image`;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageData: imageData
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Successfully saved to server folder
            if (typeof viewer.showMessage === 'function') {
                viewer.showMessage(`Image saved: ${result.fileName}`, 3000);
            } else {
                alert(`Image saved successfully: ${result.fileName}`);
            }
            return;
        } else {
            // Export folder not set or error - fall back to download
            console.log('Server save failed, falling back to download:', result.error);
            // Continue to download fallback below
        }
    } catch (error) {
        // Network error or server not available - fall back to download
        console.log('Server save unavailable, falling back to download:', error);
        // Continue to download fallback below
    }
    
    // Fallback: Download the image if server save failed or not available
    const link = document.createElement('a');
    // Detect format from data URL and set appropriate extension
    const isJPEG = imageData.startsWith('data:image/jpeg');
    link.download = isJPEG ? 'model-capture.jpg' : 'model-capture.png';
    link.href = imageData;
    link.click();
}

function clearModel() {
    if (viewer && typeof viewer.clear === 'function') {
        viewer.clear();
        console.log('Model cleared');
    }
}

function togglePartVisibility(uuid, shiftPressed = false) {
    if (viewer && typeof viewer.togglePartVisibility === 'function') {
        viewer.togglePartVisibility(uuid, shiftPressed);
    }
}

function selectPart(uuid, addToSelection = false, navigateTree = false) {
    if (viewer && typeof viewer.selectPart === 'function') {
        viewer.selectPart(uuid, addToSelection, navigateTree);
    }
}

function selectRange(uuid) {
    if (viewer && typeof viewer.selectRange === 'function') {
        viewer.selectRange(uuid);
    }
}

function showTreeContextMenu(event, uuid) {
    if (viewer && typeof viewer.showTreeContextMenu === 'function') {
        viewer.showTreeContextMenu(event, uuid);
    }
}

function renamePart(uuid) {
    if (viewer && typeof viewer.showRenameDialog === 'function') {
        const treeItem = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
        const event = { pageX: 0, pageY: 0 };
        viewer.showRenameDialog(event, treeItem, uuid);
    }
}

function toggleTreeExpand(uuid) {
    if (viewer && typeof viewer.toggleTreeExpand === 'function') {
        viewer.toggleTreeExpand(uuid);
    }
}

