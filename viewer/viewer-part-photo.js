/**
 * GLTF Viewer - Part Photo Module
 * Handles capturing photos of individual parts with part name identification
 */

// Define function on window immediately so it's always available
window.capturePartPhoto = async function() {
    // This will be replaced by the real implementation below
    alert('Part Photo feature is loading. Please wait a moment and try again.');
    return false;
};

(function() {
    'use strict';

    // Part Photo Manager class
    class PartPhotoManager {
        constructor(viewer) {
            this.viewer = viewer;
            this.isActive = false;
        }

        /**
         * Get the name of the currently visible part (only one visible part)
         * @returns {string|null} Part name or null if multiple/no parts visible
         */
        getVisiblePartName() {
            if (!this.viewer || !this.viewer.scene || !this.viewer.partsList) {
                return null;
            }

            const visibleParts = [];
            
            // Traverse parts list to find visible meshes
            this.viewer.partsList.forEach(part => {
                if (part.visible && part.object && part.object.isMesh) {
                    // Get part name
                    const partName = this._getPartName(part);
                    if (partName) {
                        visibleParts.push({
                            name: partName,
                            object: part.object
                        });
                    }
                }
            });

            // If exactly one part is visible, return its name
            if (visibleParts.length === 1) {
                return visibleParts[0].name;
            }

            return null;
        }

        /**
         * Get part name from part node
         * @param {Object} part - Part node from partsList
         * @returns {string} Part name
         */
        _getPartName(part) {
            if (!part) return null;

            // Try to get name from part node
            if (part.name && part.name.trim()) {
                return part.name.trim();
            }

            // Try to get name from object
            if (part.object) {
                const objectName = this._getOriginalObjectName(part.object);
                if (objectName && objectName.trim()) {
                    return objectName.trim();
                }
            }

            return null;
        }

        /**
         * Get original object name (same logic as viewer)
         * @param {Object} object - Three.js object
         * @returns {string} Object name
         */
        _getOriginalObjectName(object, fallback = '') {
            if (!object) return fallback;
            
            const userDataName = object.userData && typeof object.userData.name === 'string'
                ? object.userData.name
                : '';
            if (userDataName && userDataName.trim().length > 0) {
                return userDataName;
            }
            
            const objectName = (typeof object.name === 'string') ? object.name : '';
            if (objectName && objectName.trim().length > 0) {
                return objectName;
            }
            
            return fallback;
        }

        /**
         * Sanitize filename - remove invalid characters
         * @param {string} name - Part name
         * @returns {string} Sanitized filename
         */
        _sanitizeFileName(name) {
            if (!name) return 'unnamed';
            // Replace invalid filename characters with underscore
            return name.replace(/[<>:"/\\|?*]/g, '_').trim();
        }

        /**
         * Extract short name from part name (e.g., "Front" from "Half Shaft Assy, Front RH...")
         * Looks for common keywords like Front, Rear, Left, Right, Top, Bottom, etc.
         * @param {string} partName - Full part name
         * @returns {string} Short name for image filename
         */
        _extractShortName(partName) {
            if (!partName) return 'unnamed';
            
            // Common keywords to look for (case insensitive)
            const keywords = [
                'Front', 'Rear', 'Back',
                'Left', 'Right', 
                'Top', 'Bottom',
                'Upper', 'Lower',
                'Inner', 'Outer',
                'Side', 'Center', 'Middle'
            ];
            
            // Convert to lowercase for comparison
            const partNameLower = partName.toLowerCase();
            
            // Look for keywords in the part name
            for (const keyword of keywords) {
                const keywordLower = keyword.toLowerCase();
                // Check if keyword exists as a whole word (not part of another word)
                const regex = new RegExp(`\\b${keywordLower}\\b`, 'i');
                if (regex.test(partName)) {
                    // Found a keyword, return it with proper case
                    return keyword;
                }
            }
            
            // If no keyword found, try to extract first meaningful word
            // Split by common separators: comma, space, dash, underscore
            const parts = partName.split(/[,\s\-_]+/);
            for (const part of parts) {
                const trimmed = part.trim();
                // Skip if it's too short, is a number, or contains special chars
                if (trimmed.length >= 2 && 
                    !/^\d+$/.test(trimmed) && 
                    !trimmed.includes('(') && 
                    !trimmed.includes(')')) {
                    // Capitalize first letter
                    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
                }
            }
            
            // Fallback: use first 10 characters, sanitized
            return this._sanitizeFileName(partName.substring(0, 10)) || 'unnamed';
        }

        /**
         * Set camera to a specific view direction and fit to preview box
         * @param {THREE.Vector3} viewDirection - Direction to look from
         * @param {THREE.Vector3} up - Up vector
         */
        _setCameraView(viewDirection, up = new THREE.Vector3(0, 1, 0)) {
            if (!this.viewer || !this.viewer.camera || !this.viewer.scene || !this.viewer.previewBox) {
                return false;
            }

            // Calculate bounding box for visible parts
            const bounds = this.viewer._computeBoundingInfo 
                ? this.viewer._computeBoundingInfo({ visibleOnly: true })
                : null;

            if (!bounds) {
                return false;
            }

            // Get canvas dimensions
            const container = document.getElementById('container');
            const canvasWidth = container ? container.clientWidth - (this.viewer.sidebarWidth || 0) : 800;
            const canvasHeight = container ? container.clientHeight : 600;

            // Get preview box dimensions to calculate proper scale
            const boxLeft = parseFloat(this.viewer.previewBox.style.left) || 0;
            const boxTop = parseFloat(this.viewer.previewBox.style.top) || 0;
            const boxWidth = parseFloat(this.viewer.previewBox.style.width) || canvasWidth;
            const boxHeight = parseFloat(this.viewer.previewBox.style.height) || canvasHeight;

            // Calculate NDC (Normalized Device Coordinates) for preview box center
            const ndcCenterX = (boxLeft + boxWidth / 2) / canvasWidth * 2 - 1;
            const ndcCenterY = 1 - (boxTop + boxHeight / 2) / canvasHeight * 2;
            
            // Calculate scale factors based on preview box size relative to canvas
            const scaleX = boxWidth / canvasWidth;
            const scaleY = boxHeight / canvasHeight;

            // Use the viewer's camera fit method with preview box scaling
            if (typeof this.viewer._applyCameraFit === 'function') {
                const result = this.viewer._applyCameraFit(bounds, {
                    canvasWidth,
                    canvasHeight,
                    viewDirection: viewDirection.clone(),
                    up: up.clone(),
                    enforceViewport: false,
                    ndcX: ndcCenterX,
                    ndcY: ndcCenterY,
                    scaleX: scaleX,
                    scaleY: scaleY
                });

                // Render a frame to update the view
                if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                    this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
                }

                return result;
            }

            // Fallback: manual camera positioning (shouldn't be needed)
            const center = bounds.center;
            const size = bounds.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim * 1.2; // Reduced from 2 to fit better

            const cameraDir = viewDirection.clone().normalize();
            const cameraPosition = center.clone().sub(cameraDir.clone().multiplyScalar(distance));

            this.viewer.camera.position.copy(cameraPosition);
            this.viewer.camera.up.copy(up);
            this.viewer.camera.lookAt(center);

            if (this.viewer.camera.isOrthographicCamera) {
                const aspect = boxWidth / boxHeight; // Use preview box aspect
                const viewHeight = maxDim * 1.1; // Tighter fit
                const viewWidth = viewHeight * aspect;
                const halfH = viewHeight / 2;
                const halfW = halfH * aspect;
                this.viewer.camera.left = -halfW;
                this.viewer.camera.right = halfW;
                this.viewer.camera.top = halfH;
                this.viewer.camera.bottom = -halfH;
                this.viewer.camera.updateProjectionMatrix();
            }

            if (this.viewer.controls) {
                this.viewer.controls.target.copy(center);
                this.viewer.controls.update();
            }

            // Render a frame to update the view
            if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
            }

            return true;
        }

        /**
         * Capture part photo based on panel options
         * @returns {Promise<boolean>} Success status
         */
        async capturePartPhoto() {
            // Check if panel exists and get options from it
            const panel = document.getElementById('part-photo-panel');
            const usePanel = panel && panel.classList.contains('visible');
            
            if (usePanel) {
                return await this.capturePartPhotoFromPanel();
            } else {
                // Legacy behavior: capture current visible single part
                return await this.capturePartPhotoLegacy();
            }
        }

        /**
         * Capture part photo from panel options
         * @returns {Promise<boolean>} Success status
         */
        async capturePartPhotoFromPanel() {
            if (!this.viewer || !this.viewer.loadedModels || this.viewer.loadedModels.length === 0) {
                alert('Please load a model first.');
                return false;
            }

            // Check if preview box is active
            if (!this.viewer.previewActive || !this.viewer.previewBox) {
                alert('Please enable Preview Box first to capture part photo.');
                return false;
            }

            // Get mode and selected views
            const mode = document.querySelector('input[name="part-photo-mode"]:checked')?.value || 'visible';
            const selectedViews = this._getSelectedViews();
            
            if (selectedViews.length === 0) {
                alert('Please select at least one view to capture.');
                return false;
            }

            // Get parts to capture
            let partsToCapture = [];
            
            if (mode === 'visible') {
                // Current visible single part
                const partName = this.getVisiblePartName();
                if (!partName) {
                    const visibleCount = this._countVisibleParts();
                    if (visibleCount === 0) {
                        alert('No parts are visible. Please make at least one part visible.');
                    } else {
                        alert(`Multiple parts are visible (${visibleCount} parts). Please hide other parts so only one part is visible.`);
                    }
                    return false;
                }
                
                // Find the part object
                const part = this.viewer.partsList.find(p => {
                    const name = this._getPartName(p);
                    return name === partName && p.visible && p.object && p.object.isMesh;
                });
                
                if (part) {
                    partsToCapture.push({ part: part, name: partName });
                }
            } else {
                // Selected assembly mode
                if (!this.viewer.selectedPartUUIDs || this.viewer.selectedPartUUIDs.length === 0) {
                    alert('Please select an assembly first.');
                    return false;
                }
                
                const selectedUuid = this.viewer.selectedPartUUIDs[0];
                const selectedPart = this.viewer.partsList.find(p => p.uuid === selectedUuid);
                
                if (!selectedPart || (!selectedPart.isAssembly && !selectedPart.isModelRoot)) {
                    alert('Selected item is not an assembly. Please select an assembly.');
                    return false;
                }
                
                // Get all parts in assembly
                const allParts = this.getAllPartsInAssembly(selectedUuid);
                
                if (allParts.length === 0) {
                    alert('Selected assembly has no parts.');
                    return false;
                }
                
                // Convert to capture format
                partsToCapture = allParts.map(p => ({
                    part: p,
                    name: this._getPartName(p) || 'Unnamed Part'
                }));
            }

            if (partsToCapture.length === 0) {
                alert('No parts found to capture.');
                return false;
            }

            // Save current visibility state - save both part.visible and object.visible
            const originalVisibility = new Map();
            const originalObjectVisibility = new Map();
            
            this.viewer.partsList.forEach(p => {
                originalVisibility.set(p.uuid, p.visible);
                
                // Save object visibility state recursively
                if (p.object) {
                    const objectStates = new Map();
                    p.object.traverse(child => {
                        if (child.isMesh || child.isGroup || child.isObject3D) {
                            objectStates.set(child.uuid, child.visible);
                        }
                    });
                    originalObjectVisibility.set(p.uuid, objectStates);
                }
            });

            // Save current camera state
            const originalCameraPosition = this.viewer.camera.position.clone();
            const originalCameraTarget = this.viewer.controls ? this.viewer.controls.target.clone() : new THREE.Vector3();
            const originalCameraUp = this.viewer.camera.up.clone();

            const serverPort = window.location.port || '8765';
            const apiUrl = `http://localhost:${serverPort}/api/capture-image`;

            let totalSuccess = 0;
            let totalErrors = 0;
            const totalPhotos = partsToCapture.length * selectedViews.length;

            // Capture photos for each part
            for (const { part, name } of partsToCapture) {
                // Hide all parts first
                this.viewer.partsList.forEach(p => {
                    p.visible = false;
                    if (p.object) {
                        p.object.visible = false;
                        p.object.traverse(child => {
                            if (child.isMesh) {
                                child.visible = false;
                            }
                        });
                    }
                });
                
                // Show only this part and ensure parent objects are visible
                part.visible = true;
                if (part.object) {
                    part.object.visible = true;
                    
                    // Make sure all parent objects are visible
                    let current = part.object;
                    while (current && current.parent) {
                        current.parent.visible = true;
                        current = current.parent;
                    }
                    
                    // Make sure all child meshes are visible
                    part.object.traverse(child => {
                        if (child.isMesh) {
                            child.visible = true;
                        } else if (child.isGroup || child.isObject3D) {
                            child.visible = true;
                        }
                    });
                }

                // Force render to update visibility
                if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                    this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
                }

                // Wait for visibility to update
                await new Promise(resolve => setTimeout(resolve, 300));

                // Capture each selected view for this part
                for (const view of selectedViews) {
                    try {
                        // Ensure part is still visible before capturing
                        if (part.object) {
                            part.object.visible = true;
                            part.object.traverse(child => {
                                if (child.isMesh) {
                                    child.visible = true;
                                }
                            });
                        }
                        
                        // Set camera to this view
                        this._setCameraView(view.direction, view.up);
                        
                        // Force render after camera change
                        if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                            this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
                        }
                        
                        // Wait for camera to settle and render
                        await new Promise(resolve => setTimeout(resolve, 400));

                        // Capture preview box image
                        let imageData;
                        if (this.viewer.previewActive && typeof this.viewer.capturePreviewImage === 'function') {
                            imageData = this.viewer.capturePreviewImage();
                            if (!imageData) {
                                console.warn(`Failed to capture ${view.name} view for ${name}`);
                                totalErrors++;
                                continue;
                            }
                        } else {
                            console.warn(`Preview box capture not available for ${view.name} view`);
                            totalErrors++;
                            continue;
                        }

                        // Generate filename
                        const filename = `${view.name}.png`;

                        // Send to server API
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                imageData: imageData,
                                partName: name,
                                filename: filename
                            })
                        });

                        if (response.ok) {
                            totalSuccess++;
                        } else {
                            console.error(`Failed to save ${view.name} for ${name}`);
                            totalErrors++;
                        }
                    } catch (error) {
                        console.error(`Error capturing ${view.name} for ${name}:`, error);
                        totalErrors++;
                    }
                }
            }

            // Restore original visibility - restore exact original state
            originalVisibility.forEach((visible, uuid) => {
                const part = this.viewer.partsList.find(p => p.uuid === uuid);
                if (part) {
                    part.visible = visible;
                    
                    // Restore object visibility from saved state
                    if (part.object) {
                        const objectStates = originalObjectVisibility.get(uuid);
                        if (objectStates) {
                            // Restore each child object's original visibility
                            part.object.traverse(child => {
                                if (child.isMesh || child.isGroup || child.isObject3D) {
                                    const originalChildVisible = objectStates.get(child.uuid);
                                    if (originalChildVisible !== undefined) {
                                        child.visible = originalChildVisible;
                                    }
                                }
                            });
                        } else {
                            // Fallback: restore based on part.visible
                            part.object.visible = visible;
                            part.object.traverse(child => {
                                if (child.isMesh) {
                                    child.visible = visible;
                                }
                            });
                        }
                    }
                }
            });

            // Force render to update visibility
            if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
            }

            // Restore original camera state
            this.viewer.camera.position.copy(originalCameraPosition);
            this.viewer.camera.up.copy(originalCameraUp);
            if (this.viewer.controls) {
                this.viewer.controls.target.copy(originalCameraTarget);
                this.viewer.controls.update();
            }
            
            // Force render after camera restore
            if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
            }

            // Show results
            if (totalSuccess > 0) {
                if (totalErrors > 0) {
                    alert(`Part photos captured with some errors.\n\nSuccessfully captured: ${totalSuccess}/${totalPhotos} photos\nFailed: ${totalErrors}/${totalPhotos} photos`);
                } else {
                    alert(`Successfully captured ${totalSuccess} part photos!`);
                }
                return true;
            } else {
                alert(`Failed to capture part photos. Please check export folder is set and try again.`);
                return false;
            }
        }

        /**
         * Get selected views from checkboxes
         * @returns {Array} Array of view objects
         */
        _getSelectedViews() {
            const allViews = [
                { name: 'Front', direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Back', direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Left', direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Right', direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Top', direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
                { name: 'Bottom', direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
                { name: 'Iso', direction: new THREE.Vector3(1, -1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso2', direction: new THREE.Vector3(-1, -1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso3', direction: new THREE.Vector3(-1, -1, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso4', direction: new THREE.Vector3(1, -1, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso5', direction: new THREE.Vector3(1, 1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso6', direction: new THREE.Vector3(-1, 1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso7', direction: new THREE.Vector3(-1, 1, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso8', direction: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }
            ];

            return allViews.filter(view => {
                const checkbox = document.getElementById(`part-photo-view-${view.name.toLowerCase()}`);
                return checkbox && checkbox.checked;
            });
        }

        /**
         * Legacy capture part photo - captures all views for current visible single part
         * @returns {Promise<boolean>} Success status
         */
        async capturePartPhotoLegacy() {
            if (!this.viewer || !this.viewer.loadedModels || this.viewer.loadedModels.length === 0) {
                alert('Please load a model first.');
                return false;
            }

            // Check if preview box is active
            if (!this.viewer.previewActive || !this.viewer.previewBox) {
                alert('Please enable Preview Box first to capture part photo.');
                return false;
            }

            // Get visible part name
            const partName = this.getVisiblePartName();
            if (!partName) {
                const visibleCount = this._countVisibleParts();
                if (visibleCount === 0) {
                    alert('No parts are visible. Please make at least one part visible.');
                } else {
                    alert(`Multiple parts are visible (${visibleCount} parts). Please hide other parts so only one part is visible for part photo.`);
                }
                return false;
            }

            // Save current camera state
            const originalCameraPosition = this.viewer.camera.position.clone();
            const originalCameraTarget = this.viewer.controls ? this.viewer.controls.target.clone() : new THREE.Vector3();
            const originalCameraUp = this.viewer.camera.up.clone();

            // Define 14 views: Front, Back, Left, Right, Top, Bottom, and 8 Isometric views (4 top + 4 bottom)
            const views = [
                { name: 'Front', direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Back', direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Left', direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Right', direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Top', direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
                { name: 'Bottom', direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
                // Top isometric views (looking from above)
                { name: 'Iso', direction: new THREE.Vector3(1, -1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso2', direction: new THREE.Vector3(-1, -1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso3', direction: new THREE.Vector3(-1, -1, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso4', direction: new THREE.Vector3(1, -1, 1), up: new THREE.Vector3(0, 1, 0) },
                // Bottom isometric views (looking from below)
                { name: 'Iso5', direction: new THREE.Vector3(1, 1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso6', direction: new THREE.Vector3(-1, 1, -1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso7', direction: new THREE.Vector3(-1, 1, 1), up: new THREE.Vector3(0, 1, 0) },
                { name: 'Iso8', direction: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) }
            ];

            const serverPort = window.location.port || '8765';
            const apiUrl = `http://localhost:${serverPort}/api/capture-image`;

            let successCount = 0;
            let errorCount = 0;

            // Capture each view
            for (const view of views) {
                try {
                    // Set camera to this view
                    this._setCameraView(view.direction, view.up);
                    
                    // Wait a bit for camera to settle and render
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Capture preview box image
                    let imageData;
                    if (this.viewer.previewActive && typeof this.viewer.capturePreviewImage === 'function') {
                        imageData = this.viewer.capturePreviewImage();
                        if (!imageData) {
                            console.warn(`Failed to capture ${view.name} view`);
                            errorCount++;
                            continue;
                        }
                    } else {
                        console.warn(`Preview box capture not available for ${view.name} view`);
                        errorCount++;
                        continue;
                    }

                    // Generate filename
                    const filename = `${view.name}.png`;

                    // Send to server API
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            imageData: imageData,
                            partName: partName,
                            filename: filename
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        successCount++;
                        console.log(`${view.name} view captured: ${result.fileName}`);
                    } else {
                        errorCount++;
                        console.error(`Failed to save ${view.name} view:`, result.error);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`Error capturing ${view.name} view:`, error);
                }
            }

            // Restore original camera position
            this.viewer.camera.position.copy(originalCameraPosition);
            this.viewer.camera.up.copy(originalCameraUp);
            if (this.viewer.controls) {
                this.viewer.controls.target.copy(originalCameraTarget);
                this.viewer.controls.update();
            }
            if (this.viewer.renderer && this.viewer.scene && this.viewer.camera) {
                this.viewer.renderer.render(this.viewer.scene, this.viewer.camera);
            }

            // Show result message
            const totalViews = 14; // 6 orthographic + 8 isometric (4 top + 4 bottom)
            if (successCount === totalViews) {
                if (typeof this.viewer.showMessage === 'function') {
                    this.viewer.showMessage(`All ${totalViews} views captured successfully!`, 3000);
                } else {
                    alert(`Part photos captured successfully!\n\nCaptured ${successCount} views:\n- Front.png\n- Back.png\n- Left.png\n- Right.png\n- Top.png\n- Bottom.png\n- Iso.png\n- Iso2.png\n- Iso3.png\n- Iso4.png\n- Iso5.png\n- Iso6.png\n- Iso7.png\n- Iso8.png`);
                }
                return true;
            } else if (successCount > 0) {
                alert(`Part photos captured with some errors.\n\nSuccessfully captured: ${successCount}/${totalViews} views\nFailed: ${errorCount}/${totalViews} views`);
                return successCount > 0;
            } else {
                alert(`Failed to capture part photos. Please check export folder is set and try again.`);
                return false;
            }
        }

        /**
         * Count visible parts
         * @returns {number} Number of visible parts
         */
        _countVisibleParts() {
            if (!this.viewer || !this.viewer.partsList) {
                return 0;
            }

            let count = 0;
            this.viewer.partsList.forEach(part => {
                if (part.visible && part.object && part.object.isMesh) {
                    count++;
                }
            });

            return count;
        }
    }

    /**
     * Get all parts in an assembly recursively (including sub-assemblies)
     * @param {string} assemblyUuid - UUID of the assembly
     * @returns {Array} Array of part objects
     */
    PartPhotoManager.prototype.getAllPartsInAssembly = function(assemblyUuid) {
        if (!this.viewer || !this.viewer.partsList) {
            return [];
        }

        const assemblyPart = this.viewer.partsList.find(p => p.uuid === assemblyUuid);
        if (!assemblyPart) {
            return [];
        }

        const allParts = [];
        
        // Recursive function to collect all parts
        const collectParts = (part) => {
            // If it's a mesh (actual part), add it
            if (part.object && part.object.isMesh) {
                allParts.push(part);
            }
            
            // If it has children, recursively process them
            if (part.children && part.children.length > 0) {
                part.children.forEach(childUuid => {
                    const childPart = this.viewer.partsList.find(p => p.uuid === childUuid);
                    if (childPart) {
                        collectParts(childPart);
                    }
                });
            }
        };

        collectParts(assemblyPart);
        return allParts;
    };

    /**
     * Start panel drag
     */
    PartPhotoManager.prototype._startPanelDrag = function(event) {
        if (event.button !== 0 || !this.panelEl) return;
        if (event.target.closest('.section-panel-actions')) return;

        const rect = this.panelEl.getBoundingClientRect();
        this._dragState = {
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };

        const moveHandler = (e) => this._onPanelDrag(e);
        const upHandler = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            this._dragState = null;
        };

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    };

    /**
     * Handle panel drag
     */
    PartPhotoManager.prototype._onPanelDrag = function(event) {
        if (!this._dragState || !this.panelEl) return;

        const container = document.getElementById('container');
        const bounds = container ? container.getBoundingClientRect() : document.body.getBoundingClientRect();

        let left = event.clientX - this._dragState.offsetX;
        let top = event.clientY - this._dragState.offsetY;

        left = Math.max(bounds.left + 10, Math.min(left, bounds.right - this.panelEl.offsetWidth - 10));
        top = Math.max(bounds.top + 10, Math.min(top, bounds.bottom - this.panelEl.offsetHeight - 10));

        this.panelEl.style.left = `${left}px`;
        this.panelEl.style.top = `${top}px`;
    };

    /**
     * Toggle Part Photo panel
     */
    PartPhotoManager.prototype.togglePanel = function(forceState) {
        const panel = this.panelEl || document.getElementById('part-photo-panel');
        if (!panel) return;

        const shouldShow = typeof forceState === 'boolean'
            ? forceState
            : !panel.classList.contains('visible');

        if (shouldShow) {
            panel.classList.add('visible');
            panel.setAttribute('aria-hidden', 'false');
            this.updatePanelInfo();
        } else {
            panel.classList.remove('visible');
            panel.setAttribute('aria-hidden', 'true');
        }
    };

    /**
     * Hide Part Photo panel
     */
    PartPhotoManager.prototype.hidePanel = function() {
        this.togglePanel(false);
    };

    /**
     * Update panel info based on current selection
     */
    PartPhotoManager.prototype.updatePanelInfo = function() {
        const infoLabel = document.getElementById('part-photo-selection-info');
        if (!infoLabel) return;

        const mode = document.querySelector('input[name="part-photo-mode"]:checked')?.value || 'visible';
        
        if (mode === 'visible') {
            const partName = this.getVisiblePartName();
            if (partName) {
                infoLabel.textContent = `Current part: ${partName}`;
                infoLabel.style.color = '#6666FF';
            } else {
                const visibleCount = this._countVisibleParts();
                if (visibleCount === 0) {
                    infoLabel.textContent = 'No parts visible';
                    infoLabel.style.color = '#ff6b6b';
                } else {
                    infoLabel.textContent = `Multiple parts visible (${visibleCount})`;
                    infoLabel.style.color = '#ffa500';
                }
            }
        } else {
            // Assembly mode
            if (!this.viewer.selectedPartUUIDs || this.viewer.selectedPartUUIDs.length === 0) {
                infoLabel.textContent = 'No assembly selected';
                infoLabel.style.color = '#ff6b6b';
            } else {
                const selectedUuid = this.viewer.selectedPartUUIDs[0];
                const selectedPart = this.viewer.partsList.find(p => p.uuid === selectedUuid);
                if (selectedPart && (selectedPart.isAssembly || selectedPart.isModelRoot)) {
                    const allParts = this.getAllPartsInAssembly(selectedUuid);
                    infoLabel.textContent = `Selected assembly: ${selectedPart.name || 'Assembly'} (${allParts.length} parts)`;
                    infoLabel.style.color = '#6666FF';
                } else {
                    infoLabel.textContent = 'Selected item is not an assembly';
                    infoLabel.style.color = '#ff6b6b';
                }
            }
        }
    };

    // Add part photo manager to viewer prototype (if GLTFViewer exists)
    if (typeof GLTFViewer !== 'undefined') {
        GLTFViewer.prototype.initPartPhoto = function() {
            if (!this.partPhotoManager) {
                this.partPhotoManager = new PartPhotoManager(this);
            }
            // Initialize panel when viewer is ready
            if (document.readyState === 'complete') {
                this.partPhotoManager.initPanel();
            } else {
                window.addEventListener('load', () => {
                    if (this.partPhotoManager) {
                        this.partPhotoManager.initPanel();
                    }
                });
            }
        };
    }

    /**
     * Initialize Part Photo panel event handlers
     */
    PartPhotoManager.prototype.initPanel = function() {
        const panel = document.getElementById('part-photo-panel');
        if (!panel) return;

        // Store panel reference
        this.panelEl = panel;
        this._dragState = null;

        // Close button - attach first before drag handler
        const closeBtn = document.getElementById('part-photo-panel-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.hidePanel();
            });
            
            // Prevent drag when clicking close button
            closeBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
        }

        // Make panel draggable (like Material panel)
        const header = document.getElementById('part-photo-panel-header');
        if (header) {
            header.addEventListener('mousedown', (e) => {
                this._startPanelDrag(e);
            });
        }

        // Mode radio buttons
        const modeRadios = document.querySelectorAll('input[name="part-photo-mode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updatePanelInfo();
            });
        });

        // Select All / Deselect All buttons
        const selectAllBtn = document.getElementById('part-photo-select-all-views');
        const deselectAllBtn = document.getElementById('part-photo-deselect-all-views');
        
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const checkboxes = panel.querySelectorAll('input[type="checkbox"][id^="part-photo-view-"]');
                checkboxes.forEach(cb => cb.checked = true);
            });
        }
        
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => {
                const checkboxes = panel.querySelectorAll('input[type="checkbox"][id^="part-photo-view-"]');
                checkboxes.forEach(cb => cb.checked = false);
            });
        }

        // Capture button
        const captureBtn = document.getElementById('part-photo-capture-btn');
        if (captureBtn) {
            captureBtn.addEventListener('click', async () => {
                if (this.viewer && this.viewer.partPhotoManager) {
                    await this.capturePartPhoto();
                }
            });
        }

        // Update info when selection changes
        if (this.viewer) {
            // Listen for selection changes
            const originalSelectPart = this.viewer.selectPart;
            if (originalSelectPart) {
                this.viewer.selectPart = (...args) => {
                    const result = originalSelectPart.apply(this.viewer, args);
                    if (panel.classList.contains('visible')) {
                        this.updatePanelInfo();
                    }
                    return result;
                };
            }
        }
    };

    // Global function to toggle Part Photo panel
    window.togglePartPhotoPanel = function() {
        // Ensure viewer exists
        if (!window.viewer) {
            console.warn('Viewer not initialized');
            return;
        }

        // Initialize part photo manager if needed
        if (!window.viewer.partPhotoManager) {
            if (typeof window.viewer.initPartPhoto === 'function') {
                window.viewer.initPartPhoto();
            } else {
                window.viewer.partPhotoManager = new PartPhotoManager(window.viewer);
            }
        }

        // Initialize panel if needed
        if (window.viewer.partPhotoManager && !window.viewer.partPhotoManager.panelEl) {
            window.viewer.partPhotoManager.initPanel();
        }

        // Toggle panel
        if (window.viewer.partPhotoManager) {
            window.viewer.partPhotoManager.togglePanel();
        }
    };

    // Global function to capture part photo - always define on window immediately
    // This ensures it's available even if viewer isn't initialized yet
    window.capturePartPhoto = async function() {
        // Get viewer from global scope (try multiple ways)
        let currentViewer = null;
        
        // Method 1: Direct global viewer variable
        if (typeof viewer !== 'undefined' && viewer) {
            currentViewer = viewer;
        }
        // Method 2: window.viewer
        else if (typeof window.viewer !== 'undefined' && window.viewer) {
            currentViewer = window.viewer;
        }
        // Method 3: Try to get from container element
        else {
            const container = document.getElementById('container');
            if (container && container.viewer) {
                currentViewer = container.viewer;
            }
        }
        
        // If still not found, wait a bit and try again
        if (!currentViewer) {
            await new Promise(resolve => setTimeout(resolve, 200));
            if (typeof viewer !== 'undefined' && viewer) {
                currentViewer = viewer;
            } else if (typeof window.viewer !== 'undefined' && window.viewer) {
                currentViewer = window.viewer;
            }
        }
        
        if (!currentViewer) {
            alert('Viewer not initialized. Please wait for the model to load and try again.');
            console.error('capturePartPhoto: viewer not found');
            return false;
        }

        // Initialize part photo manager if not already done
        if (!currentViewer.partPhotoManager) {
            if (typeof currentViewer.initPartPhoto === 'function') {
                currentViewer.initPartPhoto();
            } else {
                // Fallback: create manager directly
                currentViewer.partPhotoManager = new PartPhotoManager(currentViewer);
            }
        }

        // Capture part photo
        try {
            return await currentViewer.partPhotoManager.capturePartPhoto();
        } catch (error) {
            console.error('Error in capturePartPhoto:', error);
            alert('Error capturing part photo: ' + error.message);
            return false;
        }
    };

    // Auto-initialize part photo manager when viewer is available
    function initializePartPhoto() {
        if (typeof viewer !== 'undefined' && viewer) {
            if (typeof viewer.initPartPhoto === 'function') {
                viewer.initPartPhoto();
            } else {
                viewer.partPhotoManager = new PartPhotoManager(viewer);
            }
        }
    }

    // Try to initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initializePartPhoto();
            // Also try after a delay in case viewer loads later
            setTimeout(initializePartPhoto, 1000);
        });
    } else {
        initializePartPhoto();
        setTimeout(initializePartPhoto, 1000);
    }
    
    // Also listen for viewer initialization events
    window.addEventListener('viewerReady', initializePartPhoto);
    window.addEventListener('viewerInitialized', initializePartPhoto);

})();
