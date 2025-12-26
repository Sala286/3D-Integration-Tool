/**
 * GLTF Viewer - Model Tree UI Module
 * Handles context menus, dialogs, and UI interactions
 */

// Add tree UI methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
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
}

