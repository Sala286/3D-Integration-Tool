/**
 * GLTF Viewer - Model Tree Selection Module
 * Handles part selection, visibility toggling, and reframe operations
 */

// Add tree selection methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    GLTFViewer.prototype.togglePartVisibility = function(uuid, shiftPressed = false) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (part) {
            // If Shift is pressed on an assembly, use Hide All / Unhide All behavior
            if (shiftPressed && (part.isModelRoot || part.isAssembly) && part.children) {
                // Check current visibility state before toggling
                const wasVisible = part.visible;
                
                if (wasVisible) {
                    // Assembly is visible, so hide all (assembly + children)
                    this.hideAllChildren(uuid);
                } else {
                    // Assembly is hidden, so unhide all (assembly + children)
                    this.unhideAllChildren(uuid);
                }
                return; // Exit early, hideAllChildren/unhideAllChildren handle everything
            }
            
            // Normal toggle behavior (no Shift, or not an assembly)
            part.visible = !part.visible;
            part.object.visible = part.visible;
            
            // Update UI
            const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
            if (item) {
                const toggleBtn = item.querySelector('.tree-item-toggle');
                // Update eye icon SVG - simple eye shape
                const eyeIconSVG = part.visible 
                    ? '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>'
                    : '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
                toggleBtn.innerHTML = eyeIconSVG;
                toggleBtn.title = part.visible ? 'Hide' : 'Show';
                if (part.visible) {
                    item.classList.remove('hidden');
                    toggleBtn.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                    toggleBtn.classList.add('hidden');
                }
            }
            
            // Always recalculate boundary box center (for rotation)
            if (typeof this.calculateBoundaryBoxCenter === 'function') {
                this.calculateBoundaryBoxCenter();
            }
            
            // Update boundary box if it's visible
            if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
                this.updateBoundaryBox();
            }
        }
    };
    
    GLTFViewer.prototype.hideAllChildren = function(uuid) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part) return;
        
        // Hide the assembly itself
        if (part.object) {
            part.object.visible = false;
            part.visible = false;
            
            // Update UI for the assembly itself
            const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
            if (item) {
                const toggleBtn = item.querySelector('.tree-item-toggle');
                if (toggleBtn) {
                    const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
                    toggleBtn.innerHTML = eyeIconSVG;
                    toggleBtn.title = 'Show';
                    item.classList.add('hidden');
                    toggleBtn.classList.add('hidden');
                }
            }
        }
        
        // Hide all children if they exist
        if (part.children && part.children.length > 0) {
            const hideChildren = (node) => {
                if (node.object) {
                    node.object.visible = false;
                    node.visible = false;
                    
                    // Update UI for children
                    const childItem = document.querySelector(`.tree-item[data-uuid="${node.uuid}"]`);
                    if (childItem) {
                        const childToggleBtn = childItem.querySelector('.tree-item-toggle');
                        if (childToggleBtn) {
                            const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
                            childToggleBtn.innerHTML = eyeIconSVG;
                            childToggleBtn.title = 'Show';
                            childItem.classList.add('hidden');
                            childToggleBtn.classList.add('hidden');
                        }
                    }
                }
                
                // Recursively hide all descendants
                if (node.children) {
                    node.children.forEach(child => hideChildren(child));
                }
            };
            
            part.children.forEach(child => hideChildren(child));
        }
        
        // Recalculate boundary box center
        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
        
        // Update boundary box if it's visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.unhideAllChildren = function(uuid) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part) return;
        
        // Unhide the assembly itself
        if (part.object) {
            part.object.visible = true;
            part.visible = true;
            
            // Update UI for the assembly itself
            const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
            if (item) {
                const toggleBtn = item.querySelector('.tree-item-toggle');
                if (toggleBtn) {
                    const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                    toggleBtn.innerHTML = eyeIconSVG;
                    toggleBtn.title = 'Hide';
                    item.classList.remove('hidden');
                    toggleBtn.classList.remove('hidden');
                }
            }
        }
        
        // Unhide all children if they exist
        if (part.children && part.children.length > 0) {
            const unhideChildren = (node) => {
                if (node.object) {
                    node.object.visible = true;
                    node.visible = true;
                    
                    // Update UI for children
                    const childItem = document.querySelector(`.tree-item[data-uuid="${node.uuid}"]`);
                    if (childItem) {
                        const childToggleBtn = childItem.querySelector('.tree-item-toggle');
                        if (childToggleBtn) {
                            const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                            childToggleBtn.innerHTML = eyeIconSVG;
                            childToggleBtn.title = 'Hide';
                            childItem.classList.remove('hidden');
                            childToggleBtn.classList.remove('hidden');
                        }
                    }
                }
                
                // Recursively unhide all descendants
                if (node.children) {
                    node.children.forEach(child => unhideChildren(child));
                }
            };
            
            part.children.forEach(child => unhideChildren(child));
        }
        
        // Recalculate boundary box center
        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
        
        // Update boundary box if it's visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.hideSelectedParts = function() {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        // Hide all selected parts
        this.selectedPartUUIDs.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part && part.object) {
                part.object.visible = false;
                part.visible = false;
                
                // Update UI
                const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
                if (item) {
                    const toggleBtn = item.querySelector('.tree-item-toggle');
                    if (toggleBtn) {
                        const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
                        toggleBtn.innerHTML = eyeIconSVG;
                        toggleBtn.title = 'Show';
                        item.classList.add('hidden');
                        toggleBtn.classList.add('hidden');
                    }
                }
            }
        });
        
        // Recalculate boundary box center
        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.unhideSelectedParts = function() {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        // Unhide all selected parts
        this.selectedPartUUIDs.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part && part.object) {
                part.object.visible = true;
                part.visible = true;
                
                // Update UI
                const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
                if (item) {
                    const toggleBtn = item.querySelector('.tree-item-toggle');
                    if (toggleBtn) {
                        const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                        toggleBtn.innerHTML = eyeIconSVG;
                        toggleBtn.title = 'Hide';
                        item.classList.remove('hidden');
                        toggleBtn.classList.remove('hidden');
                    }
                }
            }
        });
        
        // Recalculate boundary box center
        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.makeOnlySelectedVisible = function() {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        // Collect all parent assemblies of selected parts
        const parentAssemblies = new Set();
        const selectedParts = [];
        
        this.selectedPartUUIDs.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part) {
                selectedParts.push(part);
                
                // Find all parent assemblies
                let currentParent = part.parent;
                while (currentParent) {
                    if (currentParent.isAssembly || currentParent.isModelRoot) {
                        parentAssemblies.add(currentParent.uuid);
                    }
                    currentParent = currentParent.parent;
                }
            }
        });
        
        // First, hide all parts
        this.partsList.forEach(part => {
            if (part.object) {
                part.object.visible = false;
                part.visible = false;
                
                // Update UI
                const item = document.querySelector(`.tree-item[data-uuid="${part.uuid}"]`);
                if (item) {
                    const toggleBtn = item.querySelector('.tree-item-toggle');
                    if (toggleBtn) {
                        const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
                        toggleBtn.innerHTML = eyeIconSVG;
                        toggleBtn.title = 'Show';
                        item.classList.add('hidden');
                        toggleBtn.classList.add('hidden');
                    }
                }
            }
        });
        
        // Unhide all parent assemblies
        parentAssemblies.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part && part.object) {
                part.object.visible = true;
                part.visible = true;
                
                // Update UI
                const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
                if (item) {
                    const toggleBtn = item.querySelector('.tree-item-toggle');
                    if (toggleBtn) {
                        const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                        toggleBtn.innerHTML = eyeIconSVG;
                        toggleBtn.title = 'Hide';
                        item.classList.remove('hidden');
                        toggleBtn.classList.remove('hidden');
                    }
                }
            }
        });
        
        // Helper function to recursively make part and all its children visible
        const makePartAndChildrenVisible = (part) => {
            if (!part || !part.object) return;
            
            // Make this part visible
            part.object.visible = true;
            part.visible = true;
            
            // Update UI
            const item = document.querySelector(`.tree-item[data-uuid="${part.uuid}"]`);
            if (item) {
                const toggleBtn = item.querySelector('.tree-item-toggle');
                if (toggleBtn) {
                    const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                    toggleBtn.innerHTML = eyeIconSVG;
                    toggleBtn.title = 'Hide';
                    item.classList.remove('hidden');
                    toggleBtn.classList.remove('hidden');
                }
            }
            
            // If it's an assembly, recursively make all children visible
            if ((part.isAssembly || part.isModelRoot) && part.children && part.children.length > 0) {
                part.children.forEach(child => {
                    makePartAndChildrenVisible(child);
                });
            }
        };
        
        // Make selected parts visible (and all their children if they're assemblies)
        selectedParts.forEach(part => {
            makePartAndChildrenVisible(part);
        });
        
        // Recalculate boundary box center
        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.makeSelectedHiddenAndOthersVisible = function() {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        // Collect selected part UUIDs for quick lookup
        const selectedUUIDs = new Set(this.selectedPartUUIDs);
        
        // Collect all parent assemblies of non-selected parts that need to be visible
        const parentAssembliesToShow = new Set();
        
        // First, make all parts visible (including previously hidden ones)
        this.partsList.forEach(part => {
            if (part.object) {
                // Check if this part is selected - if yes, hide it; if no, show it
                if (selectedUUIDs.has(part.uuid)) {
                    // Hide selected parts
                    part.object.visible = false;
                    part.visible = false;
                    
                    // Update UI
                    const item = document.querySelector(`.tree-item[data-uuid="${part.uuid}"]`);
                    if (item) {
                        const toggleBtn = item.querySelector('.tree-item-toggle');
                        if (toggleBtn) {
                            const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
                            toggleBtn.innerHTML = eyeIconSVG;
                            toggleBtn.title = 'Show';
                            item.classList.add('hidden');
                            toggleBtn.classList.add('hidden');
                        }
                    }
                } else {
                    // Show non-selected parts
                    part.object.visible = true;
                    part.visible = true;
                    
                    // Collect parent assemblies of visible parts
                    let currentParent = part.parent;
                    while (currentParent) {
                        if (currentParent.isAssembly || currentParent.isModelRoot) {
                            parentAssembliesToShow.add(currentParent.uuid);
                        }
                        currentParent = currentParent.parent;
                    }
                    
                    // Update UI
                    const item = document.querySelector(`.tree-item[data-uuid="${part.uuid}"]`);
                    if (item) {
                        const toggleBtn = item.querySelector('.tree-item-toggle');
                        if (toggleBtn) {
                            const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                            toggleBtn.innerHTML = eyeIconSVG;
                            toggleBtn.title = 'Hide';
                            item.classList.remove('hidden');
                            toggleBtn.classList.remove('hidden');
                        }
                    }
                }
            }
        });
        
        // Ensure all parent assemblies of visible parts are also visible
        parentAssembliesToShow.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part && part.object) {
                part.object.visible = true;
                part.visible = true;
                
                // Update UI
                const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
                if (item) {
                    const toggleBtn = item.querySelector('.tree-item-toggle');
                    if (toggleBtn) {
                        const eyeIconSVG = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>';
                        toggleBtn.innerHTML = eyeIconSVG;
                        toggleBtn.title = 'Hide';
                        item.classList.remove('hidden');
                        toggleBtn.classList.remove('hidden');
                    }
                }
            }
        });
        
        // Recalculate boundary box center
        if (typeof this.calculateBoundaryBoxCenter === 'function') {
            this.calculateBoundaryBoxCenter();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.selectPart = function(uuid, addToSelection = false, navigateTree = false) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part || !part.object) return;
        
        // If not adding to selection, clear previous selection
        if (!addToSelection) {
            this.clearSelection();
        }
        
        // Toggle selection if already selected
        const isAlreadySelected = this.selectedPartUUIDs.includes(uuid);
        if (isAlreadySelected && addToSelection) {
            // Deselect this part
            this.deselectPart(uuid);
            return;
        }
        
        // Add to selection
        if (!isAlreadySelected) {
            this.selectedPartUUIDs.push(uuid);
        
        // Add selection to clicked item in tree
        const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
        if (item) {
            item.classList.add('selected');
            // Scroll to selected item only when navigateTree is true (e.g., from Center Gizmo button)
            if (navigateTree && !addToSelection) {
                // Expand all parent assemblies to make the part visible
                this._expandAllParents(uuid);
                // Rebuild tree to show expanded parents
                if (typeof this.buildPartsTree === 'function') {
                    this.buildPartsTree();
                }
                // Scroll to the item after tree is rebuilt
                setTimeout(() => {
                    const updatedItem = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
                    if (updatedItem) {
                        updatedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 50);
            }
        }
            
            // Temporarily change part color to show selection (no outline - faster)
            // CRITICAL: Clone material to avoid affecting other parts that share the same material
            if (!this.originalSelectionColors.has(uuid)) {
                // Store original colors BEFORE cloning (from shared material)
                const originalMaterials = Array.isArray(part.object.material) ? part.object.material : [part.object.material];
                const originalColors = originalMaterials.map(mat => {
                    if (mat && mat.color) {
                        return mat.color.clone();
                    }
                    return null;
                });
                this.originalSelectionColors.set(uuid, originalColors);
                
                // Clone materials so this part has its own material instance
                // This ensures highlighting only affects this specific part, not others sharing the material
                if (Array.isArray(part.object.material)) {
                    part.object.material = part.object.material.map(mat => {
                        const cloned = mat.clone();
                        // Preserve material properties
                        cloned.name = mat.name || '';
                        if (mat.userData) {
                            cloned.userData = JSON.parse(JSON.stringify(mat.userData));
                        }
                        return cloned;
                    });
                } else {
                    const cloned = part.object.material.clone();
                    cloned.name = part.object.material.name || '';
                    if (part.object.material.userData) {
                        cloned.userData = JSON.parse(JSON.stringify(part.object.material.userData));
                    }
                    part.object.material = cloned;
                }
            }
            
            // Apply temporary highlight color (orange/yellow tint) to cloned material
            const highlightColor = new THREE.Color(0xFFA500); // Orange
            const materials = Array.isArray(part.object.material) ? part.object.material : [part.object.material];
            materials.forEach((mat, index) => {
                if (mat && mat.color) {
                    // Blend original color with orange for highlight (70% original + 30% orange)
                    const originalColors = this.originalSelectionColors.get(uuid);
                    if (originalColors && originalColors[index]) {
                        mat.color.lerpColors(originalColors[index], highlightColor, 0.3);
                    } else {
                        mat.color.copy(highlightColor);
                    }
                    // Make selected part always visible (like origin point and cursor)
                    // Disable depth test so it renders on top even when behind other parts
                    mat.depthTest = false;
                    mat.depthWrite = false;
                    mat.needsUpdate = true;
                }
            });
            
            // Set render order to ensure selected part renders on top (similar to cursor/origin)
            part.object.renderOrder = 998; // High render order (cursor/origin use 999, so this is just below them)
        }
        
        // Update part origin indicator
        if (typeof this.updatePartOriginIndicator === 'function') {
            this.updatePartOriginIndicator();
        }
        
        // If a transform tool is active, show gizmo for newly selected part
        if (!addToSelection && typeof this.showGizmoForActiveTool === 'function') {
            this.showGizmoForActiveTool(uuid);
        }
    };
    
    GLTFViewer.prototype.deselectPart = function(uuid) {
        // Remove from selection array
        const index = this.selectedPartUUIDs.indexOf(uuid);
        if (index > -1) {
            this.selectedPartUUIDs.splice(index, 1);
        }
        
        // Restore color and depth settings
        const part = this.partsList.find(p => p.uuid === uuid);
        if (part && part.object) {
            const originalColors = this.originalSelectionColors.get(uuid);
            if (originalColors) {
                const materials = Array.isArray(part.object.material) ? part.object.material : [part.object.material];
                
                // Check if part has an applied color from material manager
                let appliedColor = null;
                if (this.materialManager && this.materialManager.partColors) {
                    const appliedColorName = this.materialManager.partColors.get(uuid);
                    if (appliedColorName) {
                        appliedColor = this.materialManager.colors.find(c => c.name === appliedColorName);
                    }
                }
                
                materials.forEach((mat, matIndex) => {
                    if (mat && mat.color) {
                        // If part has an applied color, restore that instead of original GLTF color
                        if (appliedColor && originalColors[matIndex]) {
                            // Restore the applied color (not the original GLTF color)
                            const appliedThreeColor = new THREE.Color(appliedColor.r / 255, appliedColor.g / 255, appliedColor.b / 255);
                            mat.color.copy(appliedThreeColor);
                            mat.opacity = appliedColor.alpha / 100;
                            mat.transparent = appliedColor.alpha < 100;
                        } else if (originalColors[matIndex]) {
                            // No applied color, restore original GLTF color
                            mat.color.copy(originalColors[matIndex]);
                        }
                        // Restore depth settings to normal
                        mat.depthTest = true;
                        mat.depthWrite = true;
                        mat.needsUpdate = true;
                    }
                });
                // Restore render order to default
                part.object.renderOrder = 0;
                this.originalSelectionColors.delete(uuid);
            }
        }
        
        // Remove selection from tree UI
        const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
        if (item) {
            item.classList.remove('selected');
        }
        
        // Update part origin indicator
        if (typeof this.updatePartOriginIndicator === 'function') {
            this.updatePartOriginIndicator();
        }
        
        // Hide transform gizmo if this was the selected part
        if (this.transformTarget === uuid && typeof this.hideTransformGizmo === 'function') {
            this.hideTransformGizmo();
        }
    };
    
    GLTFViewer.prototype.clearSelection = function() {
        // Restore colors and depth settings for all selected parts
        this.selectedPartUUIDs.forEach(uuid => {
            const part = this.partsList.find(p => p.uuid === uuid);
            if (part && part.object) {
                const originalColors = this.originalSelectionColors.get(uuid);
                if (originalColors) {
                    const materials = Array.isArray(part.object.material) ? part.object.material : [part.object.material];
                    
                    // Check if part has an applied color from material manager
                    let appliedColor = null;
                    if (this.materialManager && this.materialManager.partColors) {
                        const appliedColorName = this.materialManager.partColors.get(uuid);
                        if (appliedColorName) {
                            appliedColor = this.materialManager.colors.find(c => c.name === appliedColorName);
                        }
                    }
                    
                    materials.forEach((mat, matIndex) => {
                        if (mat && mat.color) {
                            // If part has an applied color, restore that instead of original GLTF color
                            if (appliedColor && originalColors[matIndex]) {
                                // Restore the applied color (not the original GLTF color)
                                const appliedThreeColor = new THREE.Color(appliedColor.r / 255, appliedColor.g / 255, appliedColor.b / 255);
                                mat.color.copy(appliedThreeColor);
                                mat.opacity = appliedColor.alpha / 100;
                                mat.transparent = appliedColor.alpha < 100;
                            } else if (originalColors[matIndex]) {
                                // No applied color, restore original GLTF color
                                mat.color.copy(originalColors[matIndex]);
                            }
                            // Restore depth settings to normal
                            mat.depthTest = true;
                            mat.depthWrite = true;
                            mat.needsUpdate = true;
                        }
                    });
                    // Restore render order to default
                    part.object.renderOrder = 0;
                    this.originalSelectionColors.delete(uuid);
                }
            }
        });
        
        // Clear selection array
        this.selectedPartUUIDs = [];
        
        // Remove selection from tree UI
        document.querySelectorAll('.tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Hide part origin indicator
        if (typeof this.updatePartOriginIndicator === 'function') {
            this.updatePartOriginIndicator();
        }
        
        // Hide transform gizmo when all parts are deselected
        if (typeof this.hideTransformGizmo === 'function') {
            this.hideTransformGizmo();
        }
    };
    
    GLTFViewer.prototype.selectRange = function(endUuid) {
        // Select range from last selected item to endUuid
        if (this.selectedPartUUIDs.length === 0) {
            // No previous selection, just select this one
            this.selectPart(endUuid, false);
            return;
        }
        
        // Find indices of last selected and target
        const lastSelectedIndex = this.partsList.findIndex(p => p.uuid === this.selectedPartUUIDs[this.selectedPartUUIDs.length - 1]);
        const endIndex = this.partsList.findIndex(p => p.uuid === endUuid);
        
        if (lastSelectedIndex === -1 || endIndex === -1) {
            // Fallback to single selection
            this.selectPart(endUuid, false);
            return;
        }
        
        // Select all items in range
        const startIndex = Math.min(lastSelectedIndex, endIndex);
        const stopIndex = Math.max(lastSelectedIndex, endIndex);
        
        for (let i = startIndex; i <= stopIndex; i++) {
            const part = this.partsList[i];
            if (part && part.visible) {
                this.selectPart(part.uuid, true); // Add to selection
            }
        }
    };
    
    GLTFViewer.prototype.reframePart = function(uuid) {
        // Zoom to fit selected part with preview box
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part || !part.object) return;
        
        // Calculate bounding box of part
        const box = new THREE.Box3().setFromObject(part.object);
        if (box.isEmpty()) return;
        
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Get camera and controls
        if (!this.camera || !this.controls) return;
        
        // Calculate camera distance to fit object
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const cameraDistance = maxDim / (2 * Math.tan(fov / 2)) * 1.5; // 1.5 for padding
        
        // Get current camera direction
        const direction = new THREE.Vector3();
        direction.subVectors(this.camera.position, center).normalize();
        
        // If direction is zero, use default
        if (direction.length() < 0.001) {
            direction.set(0, 0, 1);
        }
        
        // Set new camera position
        const newCameraPos = center.clone().add(direction.multiplyScalar(cameraDistance));
        
        // Animate camera to new position
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const duration = 500; // ms
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
            
            // Interpolate camera position
            this.camera.position.lerpVectors(startPos, newCameraPos, eased);
            this.controls.target.lerpVectors(startTarget, center, eased);
            this.controls.update();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
        
        console.log('Reframed to part:', part.name || uuid);
    };
}

