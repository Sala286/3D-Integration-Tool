/**
 * GLTF Viewer - Model Tree Assembly Module
 * Handles assembly creation, moving parts, and deletion operations
 */

// Add tree assembly methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    GLTFViewer.prototype.createAssemblyFromSelection = function(assemblyName) {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        if (!assemblyName || assemblyName.trim() === '') {
            return;
        }
        
        // Create new THREE.Group for assembly
        const newAssembly = new THREE.Group();
        newAssembly.name = assemblyName.trim();
        newAssembly.userData = newAssembly.userData || {};
        newAssembly.userData.viewerAssembly = true;
        newAssembly.userData.name = newAssembly.name;
        
        // Find all selected parts and their objects
        const selectedParts = this.selectedPartUUIDs.map(uuid => 
            this.partsList.find(p => p.uuid === uuid)
        ).filter(p => p && p.object);
        
        if (selectedParts.length === 0) {
            alert('No valid parts selected');
            return;
        }
        
        // Find common parent (or use scene root)
        let commonParent = null;
        if (selectedParts.length > 0) {
            const firstPart = selectedParts[0];
            let currentParent = firstPart.object.parent;
            while (currentParent && currentParent !== this.scene) {
                // Check if this parent contains all selected parts
                const allInParent = selectedParts.every(part => {
                    let obj = part.object;
                    while (obj && obj !== currentParent) {
                        obj = obj.parent;
                    }
                    return obj === currentParent;
                });
                
                if (allInParent) {
                    commonParent = currentParent;
                    break;
                }
                currentParent = currentParent.parent;
            }
            
            if (!commonParent) {
                // Use the first selected part's model root
                const firstModel = this.loadedModels.find(m => {
                    let obj = firstPart.object;
                    while (obj && obj.parent) {
                        if (obj.parent === m.model) {
                            return true;
                        }
                        obj = obj.parent;
                    }
                    return false;
                });
                commonParent = firstModel ? firstModel.model : this.scene;
            }
        }
        
        // Move selected parts to new assembly
        selectedParts.forEach(part => {
            if (part.object && part.object.parent) {
                part.object.parent.remove(part.object);
                newAssembly.add(part.object);
            }
        });
        
        // Add assembly to common parent
        if (commonParent) {
            commonParent.add(newAssembly);
        } else {
            this.scene.add(newAssembly);
        }
        
        // Clear selection
        this.clearSelection();
        
        // Rebuild tree
        if (typeof this.buildPartsTree === 'function') {
            this.buildPartsTree();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype.movePartsToAssembly = function(partUUIDs, targetAssemblyUUID) {
        let targetNode = this.partsList.find(p => p.uuid === targetAssemblyUUID);
        if (!targetNode || !targetNode.object) {
            alert('Target assembly not found');
            return;
        }
        
        let targetObject = targetNode.object;
        
        // Allow dropping onto meshes by using their parent assembly
        if (targetObject.isMesh) {
            const parentAssembly = targetObject.parent;
            if (parentAssembly && !parentAssembly.isMesh) {
                targetObject = parentAssembly;
                const parentNode = this.partsList.find(p => p.object === parentAssembly);
                if (parentNode) {
                    targetNode = parentNode;
                } else {
                    targetNode = {
                        object: parentAssembly,
                        isMesh: false,
                        isAssembly: true,
                        isModelRoot: parentAssembly === this.scene,
                        uuid: parentAssembly.uuid || parentAssembly.id || parentAssembly.name || Math.random().toString(36),
                        modelUuid: null
                    };
                }
            } else {
                alert('Cannot move parts into another part. Please select an assembly or GLTF root level.');
                return;
            }
        }
        
        const targetIsGlobalRoot = targetNode.isModelRoot && targetObject === this.scene;
        const targetModelData = this._findModelDataForPart(targetNode);
        const targetModelUuid = targetModelData ? targetModelData.uuid : targetNode.modelUuid;
        
        // Get selected parts
        const selectedParts = partUUIDs.map(uuid => 
            this.partsList.find(p => p.uuid === uuid)
        ).filter(p => p && p.object);
        
        if (selectedParts.length === 0) {
            alert('No valid parts selected');
            return;
        }
        
        if (targetIsGlobalRoot) {
            selectedParts.forEach(part => {
                const modelDataForPart = this._findModelDataForPart(part);
                const modelRoot = modelDataForPart ? modelDataForPart.model : null;
                if (modelRoot && part.object) {
                    if (part.object.parent) {
                        part.object.parent.remove(part.object);
                    }
                    modelRoot.add(part.object);
                    part.parent = null;
                }
            });
            
            this.clearSelection();
            if (typeof this.buildPartsTree === 'function') {
                this.buildPartsTree();
            }
            if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
                this.updateBoundaryBox();
            }
            return;
        }
        
        // If not model root, check if it's a valid assembly (group with children)
        const modelData = this.loadedModels.find(m => m.model === targetObject);
        const isModelRoot = modelData !== undefined;
        
        if (!isModelRoot) {
            if (!targetObject.isGroup && !targetObject.isObject3D) {
                alert('Target is not a valid assembly');
                return;
            }
            
            // Prevent moving into a part (mesh) - only allow moving into assemblies
            if (targetObject.isMesh) {
                alert('Cannot move parts into another part. Please select an assembly or GLTF root level.');
                return;
            }
            
            // Check if target is actually an assembly (has children or is a group)
            if (targetNode && targetNode.isMesh) {
                alert('Cannot move parts into another part. Please select an assembly or GLTF root level.');
                return;
            }
        }
        
        // Allow moving parts between different GLTF models
        // No need to check if source and target are in the same GLTF model
        
        // Check for invalid moves (moving parent into child)
        // But allow moving child to parent (moving up the hierarchy to top level)
        const invalidMoves = selectedParts.filter(part => {
            // Check if target is a descendant of the part being moved (cannot move parent into child)
            let checkObj = targetObject;
            while (checkObj && checkObj.parent) {
                if (checkObj === part.object) {
                    return true; // Cannot move parent into child
                }
                checkObj = checkObj.parent;
            }
            
            // Allow moving child to parent (including top level) - this is valid
            // So if part is a child of target, that's fine
            return false;
        });
        
        if (invalidMoves.length > 0) {
            alert('Cannot move assembly into its own child');
            return;
        }
        
        // Move parts
        selectedParts.forEach(part => {
            if (part.object && part.object.parent) {
                part.object.parent.remove(part.object);
                targetObject.add(part.object);
            }
        });
        
        // Clear selection
        this.clearSelection();
        
        // Rebuild tree
        if (typeof this.buildPartsTree === 'function') {
            this.buildPartsTree();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
    
    GLTFViewer.prototype._findModelDataForPart = function(part) {
        if (!part || !part.object) return null;
        
        if (part.modelUuid) {
            const direct = this.loadedModels.find(m => m.uuid === part.modelUuid);
            if (direct) {
                return direct;
            }
        }
        
        let current = part.object;
        while (current) {
            const match = this.loadedModels.find(m => m.model === current);
            if (match) {
                return match;
            }
            current = current.parent;
        }
        return null;
    };
    
    GLTFViewer.prototype.isAssemblyNameUnique = function(assemblyName, partUuid) {
        // Find which GLTF model this part belongs to
        const part = this.partsList.find(p => p.uuid === partUuid);
        if (!part || !part.object) return true;
        
        // Find the model root for this part
        let modelRoot = null;
        let modelData = null;
        let currentObj = part.object;
        while (currentObj && currentObj.parent) {
            // Check if parent is a model root
            const foundModelData = this.loadedModels.find(m => m.model === currentObj.parent);
            if (foundModelData) {
                modelRoot = currentObj.parent;
                modelData = foundModelData;
                break;
            }
            currentObj = currentObj.parent;
        }
        
        if (!modelRoot || !modelData) return true; // If we can't find the model root, allow it
        
        // Prevent using GLTF file name as assembly name
        // Get the file name without extension
        const fileName = modelData.fileName || modelData.name || '';
        const fileNameWithoutExt = fileName.replace(/\.(gltf|glb)$/i, '').trim();
        const assemblyNameTrimmed = assemblyName.trim();
        
        // Check if assembly name matches GLTF file name (case-insensitive)
        if (fileNameWithoutExt.toLowerCase() === assemblyNameTrimmed.toLowerCase()) {
            return false; // Name matches GLTF file name, not allowed
        }
        
        // Check all assemblies in the same model for duplicate names
        let hasDuplicate = false;
        modelRoot.traverse((obj) => {
            if (obj !== modelRoot && obj.isGroup) {
                const objName = this._getOriginalObjectName(obj, '').trim();
                if (objName.toLowerCase() === assemblyNameTrimmed.toLowerCase()) {
                hasDuplicate = true;
                }
            }
        });
        
        return !hasDuplicate;
    };
    
    GLTFViewer.prototype.deleteSelectedParts = function() {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        const selectedParts = this.selectedPartUUIDs.map(uuid => 
            this.partsList.find(p => p.uuid === uuid)
        ).filter(p => p && p.object);
        
        // Remove from scene
        selectedParts.forEach(part => {
            if (part.object && part.object.parent) {
                part.object.parent.remove(part.object);
                // Dispose geometry and materials
                if (part.object.isMesh) {
                    if (part.object.geometry) {
                        part.object.geometry.dispose();
                    }
                    if (part.object.material) {
                        if (Array.isArray(part.object.material)) {
                            part.object.material.forEach(mat => mat.dispose());
                        } else {
                            part.object.material.dispose();
                        }
                    }
                }
            }
        });
        
        // Clear selection
        this.clearSelection();
        
        // Rebuild tree
        if (typeof this.buildPartsTree === 'function') {
            this.buildPartsTree();
        }
        
        // Update boundary box if visible
        if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
            this.updateBoundaryBox();
        }
    };
}

