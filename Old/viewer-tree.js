/**
 * GLTF Viewer - Model Tree Module
 * Handles parts tree building, visibility toggling, and part selection
 */

// Add tree methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    GLTFViewer.prototype._getOriginalObjectName = function(object, fallback = '') {
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
    };
    
    GLTFViewer.prototype.buildPartsTree = function() {
        const treeContainer = document.getElementById('tree-container');
        if (!treeContainer) return;
        
        // Clear existing tree
        treeContainer.innerHTML = '';
        
        // Store references to all objects (meshes and groups) for selection/hide
        // Preserve expanded state before clearing
        const previousExpandedStates = new Map();
        if (this.partsList) {
            this.partsList.forEach(p => {
                previousExpandedStates.set(p.uuid, p.expanded);
            });
        }
        
        this.partsList = [];
        this.nodeMap = new Map(); // Map to store node hierarchy
        this.expandedNodes = new Set(); // Track expanded nodes
        
        // If no models loaded, show placeholder
        if (!this.loadedModels || this.loadedModels.length === 0) {
            treeContainer.innerHTML = '<div style="padding: 20px; color: #999; text-align: center;">No model loaded. Open a GLTF/GLB file to see parts.</div>';
            return;
        }
        
        // Build hierarchical structure
        const buildHierarchy = (object, parent = null, level = 0, modelData = null) => {
            const hasChildren = object.children && object.children.length > 0;
            const isViewerAssembly = !!(object.userData && (object.userData.viewerAssembly || object.userData.isViewerAssembly));
            
            // Check if object has meshes (directly or as descendants)
            const hasMeshes = object.isMesh || (hasChildren && object.children.some(child => {
                let hasMesh = false;
                child.traverse((descendant) => {
                    if (descendant.isMesh) {
                        hasMesh = true;
                    }
                });
                return hasMesh;
            }));
            
            // Check if object is a Group/Assembly (not a mesh, but has children)
            const isGroup = !object.isMesh && hasChildren;
            
            // Include all objects that are:
            // 1. Meshes
            // 2. Groups/Assemblies (even if they don't have direct mesh children - they might contain other groups)
            // 3. Objects with meshes as descendants
            // 4. Viewer-created assemblies (even if empty)
            const isViewerAssemblyEmpty = isViewerAssembly && !hasChildren && !object.isMesh && !hasMeshes;
            if (object.isMesh || isGroup || hasMeshes || isViewerAssembly) {
                // Store original material for meshes
                if (object.isMesh && !this.originalMaterials.has(object.uuid)) {
                    if (Array.isArray(object.material)) {
                        this.originalMaterials.set(object.uuid, object.material.map(mat => mat.clone()));
                    } else {
                        this.originalMaterials.set(object.uuid, object.material.clone());
                    }
                }
                
                // Preserve original name exactly as-is (don't convert spaces to underscores)
                // Especially important for "assy" names which should keep spaces
                const originalName = this._getOriginalObjectName(object, 'Unnamed Part');
                
                const node = {
                    object: object,
                    name: originalName, // Keep original name with spaces intact
                    visible: object.visible,
                    uuid: object.uuid,
                    level: level,
                    parent: parent,
                    isMesh: object.isMesh,
                    isAssembly: !object.isMesh && (hasChildren || (isViewerAssembly && !isViewerAssemblyEmpty)),
                    children: [],
                    expanded: false, // Default to collapsed
                    modelUuid: modelData ? modelData.uuid : (parent ? parent.modelUuid : null)
                };
                
                this.nodeMap.set(object.uuid, node);
                this.partsList.push(node);
                
                // Add children
                if (hasChildren) {
                    object.children.forEach(child => {
                        const childNode = buildHierarchy(child, node, level + 1, modelData);
                        if (childNode) {
                            node.children.push(childNode);
                        }
                    });
                }
                
                return node;
            }
            
            // If this object doesn't qualify, but has children, process children
            if (hasChildren) {
                object.children.forEach(child => {
                    buildHierarchy(child, parent, level, modelData);
                });
            }
            
            return null;
        };
        
        // Build hierarchy for all loaded models under a single GLTF model node
        const rootNodes = [];
        let globalModelRootNode = null;
        
        if (this.loadedModels.length > 0) {
            if (!this.globalModelRootUuid) {
                this.globalModelRootUuid = `gltf-model-root-${Date.now()}`;
            }
            
            globalModelRootNode = {
                object: this.scene,
                name: 'GLTF Model',
                visible: true,
                uuid: this.globalModelRootUuid,
                level: 0,
                parent: null,
                isMesh: false,
                isAssembly: true,
                children: [],
                expanded: previousExpandedStates.has(this.globalModelRootUuid) ? previousExpandedStates.get(this.globalModelRootUuid) : false, // Preserve previous state or default to collapsed
                isModelRoot: true,
                modelUuid: null
            };
            
            this.nodeMap.set(globalModelRootNode.uuid, globalModelRootNode);
            this.partsList.push(globalModelRootNode);
            rootNodes.push(globalModelRootNode);
        }
        
        this.loadedModels.forEach((modelData) => {
            const model = modelData.model;
            const parentNode = globalModelRootNode;
            const childLevel = parentNode ? parentNode.level + 1 : 0;
            
            const attachChildNode = (childObject) => {
                const node = buildHierarchy(childObject, parentNode, childLevel, modelData);
                if (node && parentNode) {
                    parentNode.children.push(node);
                } else if (node) {
                    rootNodes.push(node);
                }
            };
            
            if (model.children && model.children.length > 0) {
                model.children.forEach(child => attachChildNode(child));
            } else {
                attachChildNode(model);
            }
        });
        
        // Helper to resolve drop targets (convert mesh target to its parent assembly)
        const resolveDropTargetPart = (partItem) => {
            if (!partItem) return null;
            if (!partItem.isMesh) return partItem;
            if (partItem.object && partItem.object.parent && !partItem.object.parent.isMesh) {
                const parentNode = this.partsList.find(p => p.object === partItem.object.parent);
                return parentNode || null;
            }
            return null;
        };
        
        // Build tree HTML with hierarchy
        if (this.partsList.length === 0) {
            treeContainer.innerHTML = '<div style="padding: 20px; color: #999; text-align: center;">No parts found in model.</div>';
            return;
        }
        
        // Build flat list maintaining hierarchy order (parent before children)
        const orderedParts = [];
        const addNodeToOrder = (node) => {
            orderedParts.push(node);
            if (node.children && node.children.length > 0) {
                node.children.forEach(child => addNodeToOrder(child));
            }
        };
        
        rootNodes.forEach(root => addNodeToOrder(root));
        
        // Use ordered list instead of sorted partsList
        orderedParts.forEach((part, index) => {
            const item = document.createElement('div');
            item.className = 'tree-item';
            item.dataset.uuid = part.uuid;
            item.dataset.index = index;
            
            // Add indentation based on level
            const indent = part.level * 20;
            item.style.setProperty('--indent', indent + 'px');
            
            // Add classes for items with children
            if ((part.isAssembly || part.isModelRoot) && part.children.length > 0) {
                item.classList.add('has-children');
                if (part.expanded) {
                    item.classList.add('expanded');
                }
            }
            
            // Add data-level for child items (level > 0)
            if (part.level > 0) {
                item.dataset.level = part.level;
                // Calculate expand arrow position (parent's indent)
                const parentIndent = (part.level - 1) * 20;
                item.style.setProperty('--expand-pos', parentIndent + 'px');
            }
            
            // Eye icon SVG - simple eye shape (oval with circle and dot)
            const eyeIconSVG = part.visible 
                ? '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>'
                : '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="3" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.4"/></svg>';
            
            // Use SVG icons for model roots (GLTF files), assemblies, and parts
            let iconSVG = '';
            if (part.isModelRoot) {
                // File/document icon - blue
                iconSVG = '<svg viewBox="0 0 24 24" class="tree-item-icon-svg" data-type="file"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
            } else if (part.isAssembly) {
                // Folder icon - yellow/orange
                iconSVG = '<svg viewBox="0 0 24 24" class="tree-item-icon-svg" data-type="folder"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5"/></svg>';
            } else {
                // Box/package icon - brown
                iconSVG = '<svg viewBox="0 0 24 24" class="tree-item-icon-svg" data-type="box"><rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="7" y="7" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
            }
            
            // Expand/collapse icon for assemblies and model roots
            let expandIcon = '';
            if ((part.isAssembly || part.isModelRoot) && part.children.length > 0) {
                const expandSVG = part.expanded 
                    ? '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>'  // Down arrow (▼)
                    : '<svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5z" fill="currentColor"/></svg>'; // Right arrow (→)
                expandIcon = `<span class="tree-item-expand ${part.expanded ? '' : 'collapsed'}" onclick="event.stopPropagation(); toggleTreeExpand('${part.uuid}')" title="${part.expanded ? 'Collapse' : 'Expand'}">${expandSVG}</span>`;
            } else {
                expandIcon = '<span style="width: 18px; display: inline-block; flex-shrink: 0;"></span>';
            }
            
            const toggleButtonHTML = `<button class="tree-item-toggle ${part.visible ? '' : 'hidden'}" onclick="event.stopPropagation(); togglePartVisibility('${part.uuid}', event.shiftKey)" title="${part.visible ? 'Hide' : 'Show'}">
                    ${eyeIconSVG}
                </button>`;
            
            item.innerHTML = `
                <span style="width: ${indent}px; display: inline-block; flex-shrink: 0;"></span>
                ${expandIcon}
                <span class="tree-item-icon">${iconSVG}</span>
                <span class="tree-item-name">${part.name}</span>
                ${toggleButtonHTML}
            `;
            
            // Make item draggable (except model roots and collection root)
            if (!part.isModelRoot) {
                item.draggable = true;
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', part.uuid);
                    item.classList.add('dragging');
                    // Store drag UUID globally for dragover access
                    this._currentDragUUID = part.uuid;
                });
                
                item.addEventListener('dragend', (e) => {
                    item.classList.remove('dragging');
                    // Remove drop target highlighting
                    document.querySelectorAll('.tree-item.drop-target').forEach(el => {
                        el.classList.remove('drop-target');
                    });
                    // Clear drag UUID if drop didn't happen
                    if (this._currentDragUUID === part.uuid) {
                        this._currentDragUUID = null;
                    }
                });
            }
            
            // Add drop handlers to ALL items (including model roots) so they can accept drops
            // This allows dropping on model roots (top level) even though they're not draggable
            item.addEventListener('dragover', (e) => {
                // Get drag UUID from global variable (set in dragstart)
                const dragUuid = this._currentDragUUID;
                if (!dragUuid || dragUuid === part.uuid) return;
                
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const targetPart = resolveDropTargetPart(this.partsList.find(p => p.uuid === part.uuid));
                if (targetPart) {
                    const dragPart = this.partsList.find(p => p.uuid === dragUuid);
                    if (dragPart) {
                        let isValid = true;
                        let checkObj = targetPart.object;
                        while (checkObj && checkObj.parent) {
                            if (checkObj === dragPart.object) {
                                isValid = false;
                                break;
                            }
                            checkObj = checkObj.parent;
                        }
                        
                        if (isValid && dragUuid !== part.uuid) {
                            e.currentTarget.classList.add('drop-target');
                        }
                    }
                }
            });
            
            item.addEventListener('dragleave', (e) => {
                e.currentTarget.classList.remove('drop-target');
            });
            
            item.addEventListener('drop', (e) => {
                const dragUuid = this._currentDragUUID;
                if (!dragUuid || dragUuid === part.uuid) {
                    this._currentDragUUID = null;
                    return;
                }
                
                e.preventDefault();
                e.currentTarget.classList.remove('drop-target');
                
                const targetPart = resolveDropTargetPart(this.partsList.find(p => p.uuid === part.uuid));
                if (!targetPart) {
                    this._currentDragUUID = null;
                    return;
                }
                const targetUuid = targetPart.uuid;
                
                if (dragUuid !== targetUuid) {
                    // Move part to target assembly or top level
                    this.movePartsToAssembly([dragUuid], targetUuid);
                }
                this._currentDragUUID = null;
            });
            
            // Store expanded state in set
            if (part.expanded) {
                this.expandedNodes.add(part.uuid);
            }
            
            // Click to select (for all parts, meshes and assemblies)
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('tree-item-toggle')) return;
                if (e.target.classList.contains('tree-item-expand')) return;
                
                // Handle Ctrl+click for multiple selection
                if (e.ctrlKey || e.metaKey) {
                    if (typeof selectPart === 'function') {
                        selectPart(part.uuid, true, false); // Add to selection, don't auto-expand tree
                    }
                }
                // Handle Shift+click for range selection
                else if (e.shiftKey) {
                    if (typeof selectRange === 'function') {
                        selectRange(part.uuid);
                    }
                }
                // Normal click - single selection
                else {
                    if (typeof selectPart === 'function') {
                        selectPart(part.uuid, false, false); // Replace selection, don't auto-expand tree
                    }
                }
            });
            
            // Right-click for context menu
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (typeof showTreeContextMenu === 'function') {
                    showTreeContextMenu(e, part.uuid);
                }
            });
            
            // Double-click to rename
            item.addEventListener('dblclick', (e) => {
                if (e.target.classList.contains('tree-item-toggle')) return;
                if (e.target.classList.contains('tree-item-expand')) return;
                if (typeof renamePart === 'function') {
                    renamePart(part.uuid);
                }
            });
            
            if (!part.visible) {
                item.classList.add('hidden');
            }
            
            // Hide children if parent is collapsed
            if (part.parent && part.parent.uuid) {
                const parentPart = this.partsList.find(p => p.uuid === part.parent.uuid);
                if (parentPart && !parentPart.expanded) {
                    item.classList.add('hidden-tree-item');
                }
            }
            
            treeContainer.appendChild(item);
        });
        
        // Setup search functionality
        this.setupTreeSearch();
    };
    
    GLTFViewer.prototype.setupTreeSearch = function() {
        const searchInput = document.getElementById('tree-search-input');
        const searchContainer = document.getElementById('tree-search');
        
        if (!searchInput || !searchContainer) return;
        
        // Show search box when model is loaded
        searchContainer.style.display = 'block';
        
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const items = document.querySelectorAll('.tree-item');
            
            if (searchTerm === '') {
                // Show all items based on expand state
                items.forEach(item => {
                    const uuid = item.dataset.uuid;
                    const part = this.partsList.find(p => p.uuid === uuid);
                    if (part) {
                        // Check if parent is collapsed
                        if (part.parent && part.parent.uuid) {
                            const parentPart = this.partsList.find(p => p.uuid === part.parent.uuid);
                            if (parentPart && !parentPart.expanded) {
                                item.classList.add('hidden-tree-item');
                            } else {
                                item.classList.remove('hidden-tree-item');
                            }
                        } else {
                            item.classList.remove('hidden-tree-item');
                        }
                    }
                });
            } else {
                // Search mode: show matching items and their parents
                items.forEach(item => {
                    const uuid = item.dataset.uuid;
                    const part = this.partsList.find(p => p.uuid === uuid);
                    
                    if (part) {
                        const nameMatch = part.name.toLowerCase().includes(searchTerm);
                        
                        // Check if any child matches
                        let childMatches = false;
                        if (part.children && part.children.length > 0) {
                            const checkChildren = (node) => {
                                if (node.name.toLowerCase().includes(searchTerm)) {
                                    childMatches = true;
                                    return;
                                }
                                if (node.children) {
                                    node.children.forEach(child => checkChildren(child));
                                }
                            };
                            part.children.forEach(child => checkChildren(child));
                        }
                        
                        if (nameMatch || childMatches) {
                            item.classList.remove('hidden-tree-item');
                            // Expand parent if it matches or has matching children
                            if (childMatches && part.isAssembly) {
                                part.expanded = true;
                                this.expandedNodes.add(part.uuid);
                                const expandBtn = item.querySelector('.tree-item-expand');
                                if (expandBtn) {
                                    expandBtn.classList.remove('collapsed');
                                    expandBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>';
                                    // Show all children
                                    part.children.forEach(child => {
                                        const childItem = document.querySelector(`.tree-item[data-uuid="${child.uuid}"]`);
                                        if (childItem) {
                                            childItem.classList.remove('hidden-tree-item');
                                        }
                                    });
                                }
                            }
                            // Show parent chain
                            let parent = part.parent;
                            while (parent) {
                                const parentItem = document.querySelector(`.tree-item[data-uuid="${parent.uuid}"]`);
                                if (parentItem) {
                                    parentItem.classList.remove('hidden-tree-item');
                                    // Expand parent
                                    const parentPart = this.partsList.find(p => p.uuid === parent.uuid);
                                    if (parentPart && parentPart.isAssembly) {
                                        parentPart.expanded = true;
                                        this.expandedNodes.add(parentPart.uuid);
                                        const expandBtn = parentItem.querySelector('.tree-item-expand');
                                        if (expandBtn) {
                                            expandBtn.classList.remove('collapsed');
                                            expandBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>';
                                        }
                                    }
                                }
                                parent = parent.parent;
                            }
                        } else {
                            item.classList.add('hidden-tree-item');
                        }
                    }
                });
            }
        });
    };
    
    /**
     * Expand all parent assemblies to make a part visible in the tree
     * @param {string} uuid - UUID of the part
     */
    GLTFViewer.prototype._expandAllParents = function(uuid) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part) return;
        
        // Traverse up the parent chain and expand all parent assemblies
        let currentPart = part;
        while (currentPart && currentPart.parent) {
            const parentUuid = currentPart.parent.uuid;
            const parentPart = this.partsList.find(p => p.uuid === parentUuid);
            
            if (parentPart) {
                // Expand parent if it's an assembly
                if (parentPart.isAssembly && !parentPart.expanded) {
                    parentPart.expanded = true;
                    this.expandedNodes.add(parentPart.uuid);
                }
                // Move up to next parent
                currentPart = parentPart;
            } else {
                break;
            }
        }
    };
    
    /**
     * Recursively expand all sub-levels of an assembly (only this assembly and its children)
     * @param {string} uuid - UUID of the assembly
     */
    GLTFViewer.prototype._expandAllSubLevels = function(uuid) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part) {
            console.warn('_expandAllSubLevels: Part not found for UUID:', uuid);
            return;
        }
        
        // Only expand assemblies or model roots (same check as toggleTreeExpand)
        if (!part.isAssembly && !part.isModelRoot) {
            return;
        }
        
        // Expand this assembly
        if (part.children && part.children.length > 0) {
            part.expanded = true;
            this.expandedNodes.add(uuid);
            
            // Recursively expand all children that are assemblies
            part.children.forEach(child => {
                // Only expand children that are assemblies or model roots
                if (child.isAssembly || child.isModelRoot) {
                    this._expandAllSubLevels(child.uuid);
                }
            });
        }
    };
    
    /**
     * Recursively collapse all sub-levels of an assembly (only this assembly and its children)
     * @param {string} uuid - UUID of the assembly
     */
    GLTFViewer.prototype._collapseAllSubLevels = function(uuid) {
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part) {
            console.warn('_collapseAllSubLevels: Part not found for UUID:', uuid);
            return;
        }
        
        // Only collapse assemblies (same check as toggleTreeExpand)
        if (!part.isAssembly && !part.isModelRoot) {
            return;
        }
        
        // Don't collapse model root itself, but collapse all its children
        if (part.isModelRoot) {
            // Recursively collapse all children assemblies
            if (part.children && part.children.length > 0) {
                part.children.forEach(child => {
                    if (child.isAssembly || child.isModelRoot) {
                        this._collapseAllSubLevels(child.uuid);
                    }
                });
            }
            return;
        }
        
        // Recursively collapse all children assemblies first (depth-first)
        if (part.children && part.children.length > 0) {
            part.children.forEach(child => {
                // Collapse any child that is an assembly
                if (child.isAssembly || child.isModelRoot) {
                    this._collapseAllSubLevels(child.uuid);
                }
            });
        }
        
        // Then collapse this assembly (must have children to be collapsible, same as toggleTreeExpand)
        if (part.isAssembly && part.children && part.children.length > 0) {
            part.expanded = false;
            this.expandedNodes.delete(uuid);
        }
    };
    
    GLTFViewer.prototype.toggleTreeExpand = function(uuid) {
        const part = this.partsList.find(p => p.uuid === uuid);
        // Allow expanding model root and assemblies (anything with children)
        if (!part || (!part.isAssembly && !part.isModelRoot)) return;
        
        part.expanded = !part.expanded;
        
        if (part.expanded) {
            this.expandedNodes.add(uuid);
        } else {
            this.expandedNodes.delete(uuid);
        }
        
        // Update expand icon and classes
        const item = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
        if (item) {
            const expandBtn = item.querySelector('.tree-item-expand');
            if (expandBtn) {
                if (part.expanded) {
                    expandBtn.classList.remove('collapsed');
                    expandBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>';
                    expandBtn.title = 'Collapse';
                    item.classList.add('expanded');
                } else {
                    expandBtn.classList.add('collapsed');
                    expandBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5z" fill="currentColor"/></svg>';
                    expandBtn.title = 'Expand';
                    item.classList.remove('expanded');
                }
            }
        }
        
        // Show/hide only direct children (not grandchildren)
        part.children.forEach(child => {
            const childItem = document.querySelector(`.tree-item[data-uuid="${child.uuid}"]`);
            if (childItem) {
                if (part.expanded) {
                    childItem.classList.remove('hidden-tree-item');
                } else {
                    childItem.classList.add('hidden-tree-item');
                }
            }
        });
    };
    
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
        
        // Make selected parts visible
        selectedParts.forEach(part => {
            if (part.object) {
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
    
    GLTFViewer.prototype.showTreeContextMenu = function(event, uuid) {
        const contextMenu = document.getElementById('context-menu');
        if (!contextMenu) return;
        
        // Hide menu if clicking outside
        const hideMenu = (e) => {
            if (contextMenu && !contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', hideMenu);
            }
        };
        
        // Get selected parts
        const hasSelection = this.selectedPartUUIDs && this.selectedPartUUIDs.length > 0;
        const part = this.partsList.find(p => p.uuid === uuid);
        const isModelRoot = part && part.isModelRoot;
        
        // Store the tree item element for positioning input box
        const treeItem = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
        
        // Build context menu
        contextMenu.innerHTML = '';
        
        // Rename option (for all items)
        const renameItem = document.createElement('div');
        renameItem.className = 'context-menu-item';
        renameItem.textContent = 'Rename';
        renameItem.onclick = () => {
            contextMenu.style.display = 'none';
            this.showRenameDialog(event, treeItem, uuid);
        };
        contextMenu.appendChild(renameItem);
        
        // Expand/Collapse and Hide All / Unhide All options for assemblies
        const isAssembly = part && (part.isAssembly || part.isModelRoot) && part.children && part.children.length > 0;
        if (isAssembly) {
            // Separator
            const separatorVisibility = document.createElement('div');
            separatorVisibility.className = 'context-menu-separator';
            contextMenu.appendChild(separatorVisibility);
            
            // Expand All Sub-Levels option
            const expandAllItem = document.createElement('div');
            expandAllItem.className = 'context-menu-item';
            expandAllItem.textContent = 'Expand All';
            expandAllItem.onclick = (e) => {
                e.stopPropagation();
                contextMenu.style.display = 'none';
                document.removeEventListener('click', hideMenu);
                this._expandAllSubLevels(uuid);
                // Rebuild tree to show expanded assemblies
                if (typeof this.buildPartsTree === 'function') {
                    this.buildPartsTree();
                    // After rebuild, ensure expandedNodes matches part.expanded states
                    this.expandedNodes.clear();
                    this.partsList.forEach(p => {
                        if (p.expanded) {
                            this.expandedNodes.add(p.uuid);
                        }
                    });
                }
            };
            contextMenu.appendChild(expandAllItem);
            
            // Collapse All Sub-Levels option
            const collapseAllItem = document.createElement('div');
            collapseAllItem.className = 'context-menu-item';
            collapseAllItem.textContent = 'Collapse All';
            collapseAllItem.onclick = (e) => {
                e.stopPropagation();
                contextMenu.style.display = 'none';
                document.removeEventListener('click', hideMenu);
                this._collapseAllSubLevels(uuid);
                // Rebuild tree to show collapsed assemblies
                if (typeof this.buildPartsTree === 'function') {
                    this.buildPartsTree();
                    // After rebuild, ensure expandedNodes matches part.expanded states
                    this.expandedNodes.clear();
                    this.partsList.forEach(p => {
                        if (p.expanded) {
                            this.expandedNodes.add(p.uuid);
                        }
                    });
                }
            };
            contextMenu.appendChild(collapseAllItem);
            
            // Separator
            const separatorVisibility2 = document.createElement('div');
            separatorVisibility2.className = 'context-menu-separator';
            contextMenu.appendChild(separatorVisibility2);
            
            // Hide All option
            const hideAllItem = document.createElement('div');
            hideAllItem.className = 'context-menu-item';
            hideAllItem.textContent = 'Hide All';
            hideAllItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.hideAllChildren(uuid);
            };
            contextMenu.appendChild(hideAllItem);
            
            // Unhide All option
            const unhideAllItem = document.createElement('div');
            unhideAllItem.className = 'context-menu-item';
            unhideAllItem.textContent = 'Unhide All';
            unhideAllItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.unhideAllChildren(uuid);
            };
            contextMenu.appendChild(unhideAllItem);
        }
        
        // Center Graph - navigate to part in tree
        const centerGraphItem = document.createElement('div');
        centerGraphItem.className = 'context-menu-item';
        centerGraphItem.textContent = 'Center graph';
        centerGraphItem.onclick = () => {
            contextMenu.style.display = 'none';
            // Navigate to part in tree (scroll and highlight)
            const treeItem = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
            if (treeItem) {
                treeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash highlight effect
                treeItem.style.transition = 'background-color 0.3s';
                treeItem.style.backgroundColor = 'rgba(102, 102, 255, 0.3)';
                setTimeout(() => {
                    treeItem.style.backgroundColor = '';
                }, 1000);
            }
        };
        contextMenu.appendChild(centerGraphItem);
        
        // Reframe On - zoom to fit selected part with preview box
        const reframeItem = document.createElement('div');
        reframeItem.className = 'context-menu-item';
        reframeItem.textContent = 'Reframe On';
        reframeItem.onclick = () => {
            contextMenu.style.display = 'none';
            if (typeof this.reframePart === 'function') {
                this.reframePart(uuid);
            }
        };
        contextMenu.appendChild(reframeItem);
        
        // Separator
        const separator0 = document.createElement('div');
        separator0.className = 'context-menu-separator';
        contextMenu.appendChild(separator0);
        
        if (hasSelection) {
            // Create New Assembly option
            const createAssemblyItem = document.createElement('div');
            createAssemblyItem.className = 'context-menu-item';
            createAssemblyItem.textContent = 'Create New Assembly';
            createAssemblyItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.showAssemblyNameInput(event, treeItem, uuid, true);
            };
            contextMenu.appendChild(createAssemblyItem);
            
            // Separator
            const separator1 = document.createElement('div');
            separator1.className = 'context-menu-separator';
            contextMenu.appendChild(separator1);
            
            // Hide Selected option
            const hideSelectedItem = document.createElement('div');
            hideSelectedItem.className = 'context-menu-item';
            hideSelectedItem.textContent = 'Hide Selected';
            hideSelectedItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.hideSelectedParts();
            };
            contextMenu.appendChild(hideSelectedItem);
            
            // Unhide Selected option
            const unhideSelectedItem = document.createElement('div');
            unhideSelectedItem.className = 'context-menu-item';
            unhideSelectedItem.textContent = 'Unhide Selected';
            unhideSelectedItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.unhideSelectedParts();
            };
            contextMenu.appendChild(unhideSelectedItem);
            
            // Visible option - make only selected parts visible
            const visibleSelectedItem = document.createElement('div');
            visibleSelectedItem.className = 'context-menu-item';
            visibleSelectedItem.textContent = 'Visible';
            visibleSelectedItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.makeOnlySelectedVisible();
            };
            contextMenu.appendChild(visibleSelectedItem);
            
            // Reverse Visible option - hide selected parts, show all others
            const reverseVisibleItem = document.createElement('div');
            reverseVisibleItem.className = 'context-menu-item';
            reverseVisibleItem.textContent = 'Reverse Visible';
            reverseVisibleItem.onclick = () => {
                contextMenu.style.display = 'none';
                this.makeSelectedHiddenAndOthersVisible();
            };
            contextMenu.appendChild(reverseVisibleItem);
            
            // Another separator
            const separator1a = document.createElement('div');
            separator1a.className = 'context-menu-separator';
            contextMenu.appendChild(separator1a);
            
            // Move to Assembly option (only if not model root)
            if (!isModelRoot) {
                const moveItem = document.createElement('div');
                moveItem.className = 'context-menu-item';
                moveItem.textContent = 'Move to Assembly...';
                moveItem.onclick = () => {
                    contextMenu.style.display = 'none';
                    this.showMoveToAssemblyDialog(event, uuid);
                };
                contextMenu.appendChild(moveItem);
            }
            
            // Delete option (only if not model root)
            if (!isModelRoot) {
                const separator2 = document.createElement('div');
                separator2.className = 'context-menu-separator';
                contextMenu.appendChild(separator2);
                
                const deleteItem = document.createElement('div');
                deleteItem.className = 'context-menu-item';
                deleteItem.textContent = 'Delete';
                deleteItem.onclick = () => {
                    if (confirm('Delete selected parts?')) {
                        this.deleteSelectedParts();
                    }
                    contextMenu.style.display = 'none';
                };
                contextMenu.appendChild(deleteItem);
            }
        } else {
            // No selection - show create assembly option for this part
            if (!isModelRoot) {
                const createAssemblyItem = document.createElement('div');
                createAssemblyItem.className = 'context-menu-item';
                createAssemblyItem.textContent = 'Create New Assembly';
                createAssemblyItem.onclick = () => {
                    this.selectedPartUUIDs = [uuid];
                    contextMenu.style.display = 'none';
                    this.showAssemblyNameInput(event, treeItem, uuid, false);
                };
                contextMenu.appendChild(createAssemblyItem);
            }
        }
        
        // Position menu at cursor, but ensure it stays on screen
        // First show it to get actual dimensions
        contextMenu.style.display = 'block';
        const menuWidth = contextMenu.offsetWidth || 200; // Default width if not calculated
        const menuHeight = contextMenu.offsetHeight || 300; // Default height if not calculated
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        let left = event.pageX;
        let top = event.pageY;
        
        // Adjust if menu would go off right edge
        if (left + menuWidth > viewportWidth) {
            left = viewportWidth - menuWidth - 10;
        }
        
        // Adjust if menu would go off bottom edge
        if (top + menuHeight > viewportHeight) {
            top = viewportHeight - menuHeight - 10;
        }
        
        // Ensure menu doesn't go off left or top edge
        if (left < 10) left = 10;
        if (top < 10) top = 10;
        
        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
        
        // Hide menu on click outside
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
        }, 10);
    };
    
    GLTFViewer.prototype.showAssemblyNameInput = function(event, treeItem, uuid, hasSelection) {
        const inputContainer = document.getElementById('assembly-name-input-container');
        const inputField = document.getElementById('assembly-name-input');
        const okButton = document.getElementById('assembly-name-ok');
        const cancelButton = document.getElementById('assembly-name-cancel');
        
        if (!inputContainer || !inputField) return;
        
        // Position input box next to the tree item (floating next to the name)
        if (treeItem) {
            const rect = treeItem.getBoundingClientRect();
            const sidebar = document.getElementById('sidebar');
            const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
            
            // Position to the right of the tree item name
            inputContainer.style.left = (rect.right + 10) + 'px';
            inputContainer.style.top = rect.top + 'px';
            
            // Ensure it doesn't go outside the sidebar
            if (sidebarRect && (rect.right + 10 + 200) > sidebarRect.right) {
                // Position to the left of the tree item instead
                inputContainer.style.left = (rect.left - 210) + 'px';
            }
        } else {
            // Fallback to event position
            inputContainer.style.left = (event.pageX + 10) + 'px';
            inputContainer.style.top = event.pageY + 'px';
        }
        
        inputContainer.style.display = 'block';
        
        // Focus input
        inputField.value = 'New Assembly';
        inputField.focus();
        inputField.select();
        
        // Handle OK button
        const handleOk = () => {
            const assemblyName = inputField.value.trim();
            if (assemblyName === '') {
                alert('Assembly name cannot be empty');
                return;
            }
            
            // Check if assembly name already exists in the same GLTF model
            const isUnique = this.isAssemblyNameUnique(assemblyName, uuid);
            if (!isUnique) {
                // Check if it's because of GLTF file name match
                const part = this.partsList.find(p => p.uuid === uuid);
                if (part && part.object) {
                    let modelRoot = null;
                    let modelData = null;
                    let currentObj = part.object;
                    while (currentObj && currentObj.parent) {
                        const foundModelData = this.loadedModels.find(m => m.model === currentObj.parent);
                        if (foundModelData) {
                            modelRoot = currentObj.parent;
                            modelData = foundModelData;
                            break;
                        }
                        currentObj = currentObj.parent;
                    }
                    
                    if (modelData) {
                        const fileName = modelData.fileName || modelData.name || '';
                        const fileNameWithoutExt = fileName.replace(/\.(gltf|glb)$/i, '').trim();
                        if (fileNameWithoutExt.toLowerCase() === assemblyName.trim().toLowerCase()) {
                            alert('Cannot use GLTF file name as assembly name. Please use a different name.');
                            inputField.focus();
                            inputField.select();
                            return;
                        }
                    }
                }
                
                alert('Assembly name already exists in this GLTF model. Please use a different name.');
                inputField.focus();
                inputField.select();
                return;
            }
            
            inputContainer.style.display = 'none';
            this.createAssemblyFromSelection(assemblyName);
            
            // Remove event listeners
            okButton.onclick = null;
            cancelButton.onclick = null;
            inputField.onkeydown = null;
        };
        
        // Handle Cancel button
        const handleCancel = () => {
            inputContainer.style.display = 'none';
            
            // Remove event listeners
            okButton.onclick = null;
            cancelButton.onclick = null;
            inputField.onkeydown = null;
        };
        
        // Set up event listeners
        okButton.onclick = handleOk;
        cancelButton.onclick = handleCancel;
        inputField.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleOk();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        // Hide on click outside
        const hideOnClickOutside = (e) => {
            if (!inputContainer.contains(e.target)) {
                handleCancel();
                document.removeEventListener('click', hideOnClickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', hideOnClickOutside);
        }, 10);
    };
    
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
    
    GLTFViewer.prototype.showMoveToAssemblyDialog = function(event, uuid) {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            return;
        }
        
        const moveContainer = document.getElementById('move-assembly-container');
        const assemblyList = document.getElementById('assembly-list');
        const inputField = document.getElementById('move-assembly-input');
        const okButton = document.getElementById('move-assembly-ok');
        const cancelButton = document.getElementById('move-assembly-cancel');
        
        if (!moveContainer || !assemblyList || !inputField) return;
        
        // Get the tree item for positioning
        const treeItem = document.querySelector(`.tree-item[data-uuid="${uuid}"]`);
        
        // Position container next to tree item
        if (treeItem) {
            const rect = treeItem.getBoundingClientRect();
            const sidebar = document.getElementById('sidebar');
            const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
            
            moveContainer.style.left = (rect.right + 10) + 'px';
            moveContainer.style.top = rect.top + 'px';
            
            if (sidebarRect && (rect.right + 10 + 240) > sidebarRect.right) {
                moveContainer.style.left = (rect.left - 250) + 'px';
            }
        } else {
            moveContainer.style.left = (event.pageX + 10) + 'px';
            moveContainer.style.top = event.pageY + 'px';
        }
        
        // Get all assemblies from ALL loaded GLTF models (allow cross-GLTF moves)
        const assembliesInModel = [];
        
        // Add all model roots as options (for moving to top level of any GLTF)
        this.loadedModels.forEach((modelData) => {
            const modelRootPart = this.partsList.find(p => p.object === modelData.model);
            if (modelRootPart) {
                assembliesInModel.push(modelRootPart);
            }
        });
        
        // Get all assemblies from all GLTF models (not model roots, not meshes, have children)
        this.loadedModels.forEach((modelData) => {
            const modelRoot = modelData.model;
            modelRoot.traverse((obj) => {
                if (obj !== modelRoot && !obj.isMesh) {
                    // Check if it has children (is an assembly/group)
                    if (obj.children && obj.children.length > 0) {
                        // Find in partsList - check if it's marked as assembly
                        const part = this.partsList.find(p => p.object === obj);
                        if (part && part.isAssembly) {
                            assembliesInModel.push(part);
                        }
                    }
                }
            });
        });
        
        // Clear and populate assembly list
        assemblyList.innerHTML = '';
        
        if (assembliesInModel.length === 0) {
            const noAssemblies = document.createElement('div');
            noAssemblies.className = 'assembly-item';
            noAssemblies.style.cursor = 'default';
            noAssemblies.style.color = '#999';
            noAssemblies.textContent = 'No assemblies available';
            assemblyList.appendChild(noAssemblies);
        } else {
            assembliesInModel.forEach(assemblyPart => {
                const item = document.createElement('div');
                item.className = 'assembly-item';
                // Show "(Top Level)" for model root
                const displayName = assemblyPart.isModelRoot ? `${assemblyPart.name} (Top Level)` : assemblyPart.name;
                item.textContent = displayName;
                item.onclick = () => {
                    // Remove previous selection
                    assemblyList.querySelectorAll('.assembly-item').forEach(el => {
                        el.classList.remove('selected');
                    });
                    item.classList.add('selected');
                    // Clear input when selecting existing assembly
                    inputField.value = '';
                };
                assemblyList.appendChild(item);
            });
        }
        
        // Clear input
        inputField.value = '';
        
        // Handle OK button
        const handleOk = () => {
            const selectedItem = assemblyList.querySelector('.assembly-item.selected');
            let targetAssembly = null;
            
            if (selectedItem) {
                // Move to existing assembly
                // Remove "(Top Level)" suffix if present for matching
                let assemblyName = selectedItem.textContent;
                if (assemblyName.endsWith(' (Top Level)')) {
                    assemblyName = assemblyName.replace(' (Top Level)', '');
                }
                targetAssembly = assembliesInModel.find(a => a.name === assemblyName);
            } else {
                // Create new assembly
                const newAssemblyName = inputField.value.trim();
                if (newAssemblyName === '') {
                    alert('Please select an existing assembly or enter a new assembly name');
                    return;
                }
                
                // Check if name already exists
                const isUnique = this.isAssemblyNameUnique(newAssemblyName, this.selectedPartUUIDs[0]);
                if (!isUnique) {
                    // Check if it's because of GLTF file name match
                    const firstPart = this.partsList.find(p => p.uuid === this.selectedPartUUIDs[0]);
                    if (firstPart && firstPart.object) {
                        let modelRoot = null;
                        let modelData = null;
                        let currentObj = firstPart.object;
                        while (currentObj && currentObj.parent) {
                            const foundModelData = this.loadedModels.find(m => m.model === currentObj.parent);
                            if (foundModelData) {
                                modelRoot = currentObj.parent;
                                modelData = foundModelData;
                                break;
                            }
                            currentObj = currentObj.parent;
                        }
                        
                        if (modelData) {
                            const fileName = modelData.fileName || modelData.name || '';
                            const fileNameWithoutExt = fileName.replace(/\.(gltf|glb)$/i, '').trim();
                            if (fileNameWithoutExt.toLowerCase() === newAssemblyName.trim().toLowerCase()) {
                                alert('Cannot use GLTF file name as assembly name. Please use a different name.');
                                inputField.focus();
                                inputField.select();
                                return;
                            }
                        }
                    }
                    
                    alert('Assembly name already exists in this GLTF model. Please use a different name.');
                    inputField.focus();
                    inputField.select();
                    return;
                }
                
                // Create new assembly
                this.createAssemblyFromSelection(newAssemblyName);
                moveContainer.style.display = 'none';
                
                // Remove event listeners
                okButton.onclick = null;
                cancelButton.onclick = null;
                inputField.onkeydown = null;
                return;
            }
            
            if (!targetAssembly) {
                alert('Please select an assembly or create a new one');
                return;
            }
            
            // Move to existing assembly
            moveContainer.style.display = 'none';
            this.movePartsToAssembly(this.selectedPartUUIDs, targetAssembly.uuid);
            
            // Remove event listeners
            okButton.onclick = null;
            cancelButton.onclick = null;
            inputField.onkeydown = null;
        };
        
        // Handle Cancel button
        const handleCancel = () => {
            moveContainer.style.display = 'none';
            
            // Remove event listeners
            okButton.onclick = null;
            cancelButton.onclick = null;
            inputField.onkeydown = null;
        };
        
        // Set up event listeners
        okButton.onclick = handleOk;
        cancelButton.onclick = handleCancel;
        inputField.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleOk();
            } else if (e.key === 'Escape') {
                handleCancel();
            } else {
                // Clear selection when typing
                assemblyList.querySelectorAll('.assembly-item').forEach(el => {
                    el.classList.remove('selected');
                });
            }
        };
        
        moveContainer.style.display = 'block';
        inputField.focus();
        
        // Hide on click outside
        const hideOnClickOutside = (e) => {
            if (!moveContainer.contains(e.target)) {
                handleCancel();
                document.removeEventListener('click', hideOnClickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', hideOnClickOutside);
        }, 10);
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
    
    GLTFViewer.prototype.showRenameDialog = function(event, treeItem, uuid) {
        const renameContainer = document.getElementById('rename-input-container');
        const inputField = document.getElementById('rename-input');
        const okButton = document.getElementById('rename-ok');
        const cancelButton = document.getElementById('rename-cancel');
        
        if (!renameContainer || !inputField) return;
        
        const part = this.partsList.find(p => p.uuid === uuid);
        if (!part) return;
        
        // Position input box next to tree item
        if (treeItem) {
            const rect = treeItem.getBoundingClientRect();
            const sidebar = document.getElementById('sidebar');
            const sidebarRect = sidebar ? sidebar.getBoundingClientRect() : null;
            
            renameContainer.style.left = (rect.right + 10) + 'px';
            renameContainer.style.top = rect.top + 'px';
            
            if (sidebarRect && (rect.right + 10 + 220) > sidebarRect.right) {
                renameContainer.style.left = (rect.left - 230) + 'px';
            }
        } else {
            renameContainer.style.left = (event.pageX + 10) + 'px';
            renameContainer.style.top = event.pageY + 'px';
        }
        
        // Set current name
        inputField.value = part.name;
        inputField.focus();
        inputField.select();
        
        // Handle OK button
        const handleOk = () => {
            const newName = inputField.value.trim();
            if (newName === '') {
                alert('Name cannot be empty');
                return;
            }
            
            // Check if it's a model root - prevent using GLTF file name
            if (part.isModelRoot) {
                // For model root, we can rename but it's just for display
                // The actual file name won't change
                part.name = newName;
                // Update the modelData
                const modelData = this.loadedModels.find(m => m.uuid === part.uuid);
                if (modelData) {
                    modelData.name = newName;
                }
            } else {
                // For parts and assemblies, update the object name
                if (part.object) {
                    part.object.name = newName;
                    part.object.userData = part.object.userData || {};
                    part.object.userData.name = newName;
                    part.name = newName;
                }
            }
            
            renameContainer.style.display = 'none';
            
            // Rebuild tree to reflect the new name
            if (typeof this.buildPartsTree === 'function') {
                this.buildPartsTree();
            }
            
            // Remove event listeners
            okButton.onclick = null;
            cancelButton.onclick = null;
            inputField.onkeydown = null;
        };
        
        // Handle Cancel button
        const handleCancel = () => {
            renameContainer.style.display = 'none';
            
            // Remove event listeners
            okButton.onclick = null;
            cancelButton.onclick = null;
            inputField.onkeydown = null;
        };
        
        // Set up event listeners
        okButton.onclick = handleOk;
        cancelButton.onclick = handleCancel;
        inputField.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleOk();
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        renameContainer.style.display = 'block';
        
        // Hide on click outside
        const hideOnClickOutside = (e) => {
            if (!renameContainer.contains(e.target)) {
                handleCancel();
                document.removeEventListener('click', hideOnClickOutside);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', hideOnClickOutside);
        }, 10);
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


