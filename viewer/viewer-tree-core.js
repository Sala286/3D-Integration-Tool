/**
 * GLTF Viewer - Model Tree Core Module
 * Handles tree building, expand/collapse, and search functionality
 */

// Add tree core methods to GLTFViewer prototype
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
            
            // Add indentation based on level (reduced from 20px to 12px per level)
            const indent = part.level * 12;
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
                // Calculate expand arrow position (parent's indent) - reduced from 20px to 12px
                const parentIndent = (part.level - 1) * 12;
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
                expandIcon = `<span class="tree-item-expand ${part.expanded ? '' : 'collapsed'}" onclick="event.stopPropagation(); toggleTreeExpand('${part.uuid}')">${expandSVG}</span>`;
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
            
            // Click handler - expand/collapse on name/icon click, or select
                item.addEventListener('click', (e) => {
                    // Don't handle toggle button clicks
                    if (e.target.classList.contains('tree-item-toggle')) return;
                    // Don't handle expand button clicks (already handled by onclick)
                    if (e.target.classList.contains('tree-item-expand')) return;
                    
                    // Check if clicked on name or icon (or their children)
                    const clickedName = e.target.classList.contains('tree-item-name') || 
                                       e.target.closest('.tree-item-name');
                    const clickedIcon = e.target.classList.contains('tree-item-icon') || 
                                       e.target.classList.contains('tree-item-icon-svg') ||
                                       e.target.closest('.tree-item-icon');
                    
                    // If clicked on name or icon, and it's an assembly/model root with children, toggle expand/collapse
                    if ((clickedName || clickedIcon) && (part.isAssembly || part.isModelRoot) && part.children.length > 0) {
                        if (typeof toggleTreeExpand === 'function') {
                            toggleTreeExpand(part.uuid);
                        }
                        return; // Don't select when toggling expand/collapse
                    }
                    
                    // Otherwise, handle selection
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
                    // Removed title attribute - no hover text
                    item.classList.add('expanded');
                } else {
                    expandBtn.classList.add('collapsed');
                    expandBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5z" fill="currentColor"/></svg>';
                    // Removed title attribute - no hover text
                    item.classList.remove('expanded');
                }
            }
        }
        
        // Show/hide children recursively
        const showHideChildren = (children, shouldShow) => {
            children.forEach(child => {
                const childItem = document.querySelector(`.tree-item[data-uuid="${child.uuid}"]`);
                if (childItem) {
                    if (shouldShow) {
                        childItem.classList.remove('hidden-tree-item');
                        // If child is expanded, show its children too
                        if (child.expanded && child.children && child.children.length > 0) {
                            showHideChildren(child.children, true);
                        }
                    } else {
                        // Hide child and all its descendants
                        childItem.classList.add('hidden-tree-item');
                        // Recursively hide all descendants
                        if (child.children && child.children.length > 0) {
                            showHideChildren(child.children, false);
                        }
                    }
                }
            });
        };
        
        showHideChildren(part.children, part.expanded);
    };
}

