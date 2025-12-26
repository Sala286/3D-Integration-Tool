/**
 * GLTF Viewer - STL Export Module
 * Handles STL export with separate/combine modes for parts and assemblies
 */

// Add export methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    
    // Show export STL dialog
    GLTFViewer.prototype.showExportSTLDialog = function() {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            alert('Please select a part before exporting to STL.');
            return;
        }
        
        // Create modal dialog
        const dialog = document.createElement('div');
        dialog.id = 'export-stl-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #6666FF;
            border-radius: 10px;
            padding: 20px;
            z-index: 10000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            min-width: 350px;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin-top: 0; color: #6666FF;">Export STL</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px; font-weight: bold;">Export Target:</label>
                <label style="display: block; margin-bottom: 5px; cursor: pointer;">
                    <input type="radio" name="export-target" value="selected" checked>
                    Selected Part
                </label>
                <label style="display: block; cursor: pointer;">
                    <input type="radio" name="export-target" value="assembly">
                    Select Assembly (all parts in selected assembly)
                </label>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-weight: bold;">Export Mode:</label>
                <label style="display: block; margin-bottom: 5px; cursor: pointer;">
                    <input type="radio" name="export-mode" value="separate" checked>
                    Separate (each part as individual STL file)
                </label>
                <label style="display: block; cursor: pointer;">
                    <input type="radio" name="export-mode" value="combine">
                    Combine (merge all parts into single STL file)
                </label>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="export-stl-cancel" style="
                    padding: 8px 20px;
                    background: #ddd;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Cancel</button>
                <button id="export-stl-ok" style="
                    padding: 8px 20px;
                    background: #6666FF;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Export</button>
            </div>
        `;
        
        // Add overlay
        const overlay = document.createElement('div');
        overlay.id = 'export-stl-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        `;
        
        document.body.appendChild(overlay);
        document.body.appendChild(dialog);
        
        // Handle cancel
        document.getElementById('export-stl-cancel').addEventListener('click', () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        });
        
        // Handle export
        document.getElementById('export-stl-ok').addEventListener('click', () => {
            const target = document.querySelector('input[name="export-target"]:checked').value;
            const mode = document.querySelector('input[name="export-mode"]:checked').value;
            
            // Close dialog
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
            
            // Perform export
            if (target === 'selected') {
                this.exportSelectedPartSTL(mode === 'separate');
            } else {
                this.exportAssemblySTL(mode === 'separate');
            }
        });
        
        // Close on overlay click
        overlay.addEventListener('click', () => {
            document.body.removeChild(dialog);
            document.body.removeChild(overlay);
        });
    };
    
    // Export selected part to STL
    GLTFViewer.prototype.exportSelectedPartSTL = function(separate = true) {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            alert('No part selected');
            return;
        }
        
        const selectedUUID = this.selectedPartUUIDs[0];
        const part = this.partsList.find(p => p.uuid === selectedUUID);
        
        if (!part || !part.object) {
            alert('Selected part not found');
            return;
        }
        
        // Export single part
        this.exportMeshToSTL(part.object, part.name || 'part');
    };
    
    // Export assembly to STL
    GLTFViewer.prototype.exportAssemblySTL = function(separate = true) {
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            alert('No part selected');
            return;
        }
        
        const selectedUUID = this.selectedPartUUIDs[0];
        const selectedPart = this.partsList.find(p => p.uuid === selectedUUID);
        
        if (!selectedPart) {
            alert('Selected part not found');
            return;
        }
        
        // Find assembly: traverse up to find parent assembly
        let assemblyPart = selectedPart;
        while (assemblyPart.parent && !assemblyPart.isAssembly) {
            assemblyPart = assemblyPart.parent;
        }
        
        // Get all parts in assembly
        const assemblyParts = [];
        const collectParts = (part) => {
            if (part.isMesh && part.object) {
                assemblyParts.push(part);
            }
            if (part.children) {
                part.children.forEach(child => collectParts(child));
            }
        };
        collectParts(assemblyPart);
        
        if (assemblyParts.length === 0) {
            alert('No parts found in assembly');
            return;
        }
        
        if (separate) {
            // Export each part separately
            assemblyParts.forEach((part, index) => {
                const partName = part.name || `part_${index + 1}`;
                this.exportMeshToSTL(part.object, partName);
            });
            alert(`Exported ${assemblyParts.length} parts separately`);
        } else {
            // Combine all parts into single STL
            const combinedGeometry = new THREE.BufferGeometry();
            const positions = [];
            const normals = [];
            
            assemblyParts.forEach(part => {
                if (part.object && part.object.geometry) {
                    const geometry = part.object.geometry.clone();
                    
                    // Apply world transform
                    part.object.updateMatrixWorld();
                    geometry.applyMatrix4(part.object.matrixWorld);
                    
                    // Get position and normal attributes
                    const posAttr = geometry.attributes.position;
                    const normAttr = geometry.attributes.normal;
                    
                    if (posAttr) {
                        for (let i = 0; i < posAttr.count; i++) {
                            positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
                        }
                    }
                    
                    if (normAttr) {
                        for (let i = 0; i < normAttr.count; i++) {
                            normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
                        }
                    }
                }
            });
            
            combinedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            if (normals.length > 0) {
                combinedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            } else {
                combinedGeometry.computeVertexNormals();
            }
            
            const tempMesh = new THREE.Mesh(combinedGeometry);
            this.exportMeshToSTL(tempMesh, assemblyPart.name || 'assembly');
        }
    };
    
    // Export mesh to STL file
    GLTFViewer.prototype.exportMeshToSTL = function(mesh, filename) {
        if (!mesh || !mesh.geometry) {
            console.error('Invalid mesh for STL export');
            return;
        }
        
        // Generate STL data (ASCII format)
        const stlString = this.generateSTLString(mesh);
        
        // Create blob and download
        const blob = new Blob([stlString], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.stl`;
        link.click();
        
        console.log(`Exported ${filename}.stl`);
    };
    
    // Generate STL string from mesh (ASCII format)
    GLTFViewer.prototype.generateSTLString = function(mesh) {
        const geometry = mesh.geometry;
        const vertices = geometry.attributes.position;
        const normals = geometry.attributes.normal || null;
        const indices = geometry.index;
        
        let output = `solid ${mesh.name || 'model'}\n`;
        
        if (indices) {
            // Indexed geometry
            for (let i = 0; i < indices.count; i += 3) {
                const a = indices.getX(i);
                const b = indices.getX(i + 1);
                const c = indices.getX(i + 2);
                
                // Calculate face normal if not provided
                const vA = new THREE.Vector3(vertices.getX(a), vertices.getY(a), vertices.getZ(a));
                const vB = new THREE.Vector3(vertices.getX(b), vertices.getY(b), vertices.getZ(b));
                const vC = new THREE.Vector3(vertices.getX(c), vertices.getY(c), vertices.getZ(c));
                
                const cb = new THREE.Vector3();
                const ab = new THREE.Vector3();
                cb.subVectors(vC, vB);
                ab.subVectors(vA, vB);
                cb.cross(ab);
                cb.normalize();
                
                output += `  facet normal ${cb.x} ${cb.y} ${cb.z}\n`;
                output += `    outer loop\n`;
                output += `      vertex ${vA.x} ${vA.y} ${vA.z}\n`;
                output += `      vertex ${vB.x} ${vB.y} ${vB.z}\n`;
                output += `      vertex ${vC.x} ${vC.y} ${vC.z}\n`;
                output += `    endloop\n`;
                output += `  endfacet\n`;
            }
        } else {
            // Non-indexed geometry
            for (let i = 0; i < vertices.count; i += 3) {
                const vA = new THREE.Vector3(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
                const vB = new THREE.Vector3(vertices.getX(i + 1), vertices.getY(i + 1), vertices.getZ(i + 1));
                const vC = new THREE.Vector3(vertices.getX(i + 2), vertices.getY(i + 2), vertices.getZ(i + 2));
                
                // Calculate face normal
                const cb = new THREE.Vector3();
                const ab = new THREE.Vector3();
                cb.subVectors(vC, vB);
                ab.subVectors(vA, vB);
                cb.cross(ab);
                cb.normalize();
                
                output += `  facet normal ${cb.x} ${cb.y} ${cb.z}\n`;
                output += `    outer loop\n`;
                output += `      vertex ${vA.x} ${vA.y} ${vA.z}\n`;
                output += `      vertex ${vB.x} ${vB.y} ${vB.z}\n`;
                output += `      vertex ${vC.x} ${vC.y} ${vC.z}\n`;
                output += `    endloop\n`;
                output += `  endfacet\n`;
            }
        }
        
        output += `endsolid ${mesh.name || 'model'}\n`;
        
        return output;
    };
    
    // Save transform data (positions, rotations, scales)
    GLTFViewer.prototype.saveTransformData = function() {
        const transformData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            parts: []
        };
        
        // Collect transform data for all parts
        this.partsList.forEach(part => {
            if (part.object) {
                transformData.parts.push({
                    uuid: part.uuid,
                    name: part.name,
                    position: {
                        x: part.object.position.x,
                        y: part.object.position.y,
                        z: part.object.position.z
                    },
                    rotation: {
                        x: part.object.rotation.x,
                        y: part.object.rotation.y,
                        z: part.object.rotation.z
                    },
                    scale: {
                        x: part.object.scale.x,
                        y: part.object.scale.y,
                        z: part.object.scale.z
                    }
                });
            }
        });
        
        // Convert to JSON
        const jsonString = JSON.stringify(transformData, null, 2);
        
        // Create blob and download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'transform_data.json';
        link.click();
        
        console.log('Transform data saved');
    };
}

// Global function for export button
function showExportSTLDialog() {
    if (typeof viewer !== 'undefined' && viewer && typeof viewer.showExportSTLDialog === 'function') {
        viewer.showExportSTLDialog();
    } else {
        alert('Viewer not ready');
    }
}

// Global function for save button
function saveTransformData() {
    if (typeof viewer !== 'undefined' && viewer && typeof viewer.saveTransformData === 'function') {
        viewer.saveTransformData();
    } else {
        alert('Viewer not ready');
    }
}

