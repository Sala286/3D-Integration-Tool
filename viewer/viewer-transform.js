/**
 * GLTF Viewer - Transform Gizmo Module
 * Handles Move, Rotate, and Scale visual gizmos for part transformation
 */

// Add transform gizmo methods to GLTFViewer prototype
if (typeof GLTFViewer !== 'undefined') {
    
    // Initialize transform system
    GLTFViewer.prototype.initTransformGizmos = function() {
        // Transform state
        this.transformMode = null; // 'move', 'rotate', 'scale', 'transform', or null
        this.transformGizmoGroup = null;
        this.transformTarget = null; // UUID of part being transformed
        this.transformTargetObject = null; // The actual THREE.Object3D
        this.transformDragging = false;
        this.transformDragAxis = null; // 'x', 'y', 'z', or null
        this.transformDragStart = new THREE.Vector2();
        this.transformInitialValue = null; // Store initial position/rotation/scale
        
        // Gizmo visual elements
        this.gizmoHandles = new Map(); // Map of handle meshes for raycasting (cones, circles, cubes)
        this.gizmoElements = new Map(); // Map of gizmo elements (arrows, circles) for highlighting
        this.activeGizmoElement = null; // Currently active/dragged element
        this.transformPivotPoint = null; // Stored pivot point (bounding box center)
        
        console.log('Transform gizmo system initialized');
    };
    
    // Show gizmo for currently active tool when part is selected
    GLTFViewer.prototype.showGizmoForActiveTool = function(partUUID) {
        // Check which transform tool button is active
        const moveBtn = document.getElementById('move-tool');
        const rotateBtn = document.getElementById('rotate-tool');
        const transformBtn = document.getElementById('transform-tool');
        const scaleBtn = document.getElementById('scale-tool');
        
        if (moveBtn && moveBtn.classList.contains('active')) {
            this.showMoveGizmo(partUUID);
        } else if (rotateBtn && rotateBtn.classList.contains('active')) {
            this.showRotateGizmo(partUUID);
        } else if (transformBtn && transformBtn.classList.contains('active')) {
            this.showTransformGizmo(partUUID);
        } else if (scaleBtn && scaleBtn.classList.contains('active')) {
            this.showScaleGizmo(partUUID);
        }
    };
    
    // Show move gizmo at selected part's origin
    GLTFViewer.prototype.showMoveGizmo = function(partUUID) {
        if (!partUUID) {
            console.warn('No part UUID provided for move gizmo');
            return;
        }
        
        const part = this.partsList.find(p => p.uuid === partUUID);
        if (!part || !part.object) {
            console.warn('Part not found for move gizmo:', partUUID);
            return;
        }
        
        // Clear any existing gizmo
        this.hideTransformGizmo();
        
        // Set transform mode and target
        this.transformMode = 'move';
        this.transformTarget = partUUID;
        this.transformTargetObject = part.object;
        
        // Calculate bounding box center (part origin)
        const box = new THREE.Box3().setFromObject(part.object);
        const center = box.getCenter(new THREE.Vector3());
        this.transformPivotPoint = center.clone();
        this.transformPivotPoint = center.clone();
        this.transformPivotPoint = center.clone();
        
        // Create gizmo group
        this.transformGizmoGroup = new THREE.Group();
        this.transformGizmoGroup.position.copy(center);
        this.transformGizmoGroup.name = 'MoveGizmo';
        
        // Arrow length and handle size
        const arrowLength = 1.0;
        const handleSize = 0.1;
        const arrowHeadLength = 0.2;
        const arrowHeadWidth = 0.1;
        
        // Create X axis arrow (Red)
        const xArrowDir = new THREE.Vector3(1, 0, 0);
        const xArrow = new THREE.ArrowHelper(
            xArrowDir, 
            new THREE.Vector3(0, 0, 0), 
            arrowLength, 
            0xff0000,
            arrowHeadLength,
            arrowHeadWidth
        );
        xArrow.name = 'xArrow';
        
        // Make arrow always visible
        xArrow.line.material.depthTest = false;
        xArrow.line.material.depthWrite = false;
        xArrow.cone.material.depthTest = false;
        xArrow.cone.material.depthWrite = false;
        xArrow.line.renderOrder = 999;
        xArrow.cone.renderOrder = 999;
        
        // Store arrow cone for raycasting (no extra cubes)
        this.gizmoHandles.set('x', xArrow.cone);
        // Store arrow for highlighting
        this.gizmoElements.set('x', xArrow);
        
        this.transformGizmoGroup.add(xArrow);
        
        // Create Y axis arrow (Green)
        const yArrowDir = new THREE.Vector3(0, 1, 0);
        const yArrow = new THREE.ArrowHelper(
            yArrowDir,
            new THREE.Vector3(0, 0, 0),
            arrowLength,
            0x00ff00,
            arrowHeadLength,
            arrowHeadWidth
        );
        yArrow.name = 'yArrow';
        
        // Make arrow always visible
        yArrow.line.material.depthTest = false;
        yArrow.line.material.depthWrite = false;
        yArrow.cone.material.depthTest = false;
        yArrow.cone.material.depthWrite = false;
        yArrow.line.renderOrder = 999;
        yArrow.cone.renderOrder = 999;
        
        // Store arrow cone for raycasting (no extra cubes)
        this.gizmoHandles.set('y', yArrow.cone);
        // Store arrow for highlighting
        this.gizmoElements.set('y', yArrow);
        
        this.transformGizmoGroup.add(yArrow);
        
        // Create Z axis arrow (Blue)
        const zArrowDir = new THREE.Vector3(0, 0, 1);
        const zArrow = new THREE.ArrowHelper(
            zArrowDir,
            new THREE.Vector3(0, 0, 0),
            arrowLength,
            0x0000ff,
            arrowHeadLength,
            arrowHeadWidth
        );
        zArrow.name = 'zArrow';
        
        // Make arrow always visible
        zArrow.line.material.depthTest = false;
        zArrow.line.material.depthWrite = false;
        zArrow.cone.material.depthTest = false;
        zArrow.cone.material.depthWrite = false;
        zArrow.line.renderOrder = 999;
        zArrow.cone.renderOrder = 999;
        
        // Store arrow cone for raycasting (no extra cubes)
        this.gizmoHandles.set('z', zArrow.cone);
        // Store arrow for highlighting
        this.gizmoElements.set('z', zArrow);
        
        this.transformGizmoGroup.add(zArrow);
        
        // Set render order for gizmo
        this.transformGizmoGroup.renderOrder = 999;
        
        // Add to scene
        this.scene.add(this.transformGizmoGroup);
        
        // Setup drag interaction
        this.setupTransformDrag();
        
        console.log('Move gizmo created at', center);
    };
    
    // Show transform gizmo (both move and rotate) at selected part's origin
    GLTFViewer.prototype.showTransformGizmo = function(partUUID) {
        if (!partUUID) {
            console.warn('No part UUID provided for transform gizmo');
            return;
        }
        
        const part = this.partsList.find(p => p.uuid === partUUID);
        if (!part || !part.object) {
            console.warn('Part not found for transform gizmo:', partUUID);
            return;
        }
        
        // Clear any existing gizmo
        this.hideTransformGizmo();
        
        // Set transform mode and target
        this.transformMode = 'transform'; // Both move and rotate
        this.transformTarget = partUUID;
        this.transformTargetObject = part.object;
        
        // Calculate bounding box center (part origin)
        const box = new THREE.Box3().setFromObject(part.object);
        const center = box.getCenter(new THREE.Vector3());
        this.transformPivotPoint = center.clone();
        
        // Create gizmo group
        this.transformGizmoGroup = new THREE.Group();
        this.transformGizmoGroup.position.copy(center);
        this.transformGizmoGroup.name = 'TransformGizmo';
        
        const arrowLength = 1.0; // restore longer arrows like reference
        const arrowHeadLength = 0.2;
        const arrowHeadWidth = 0.1;
        const radius = 0.6; // smaller so arcs stay well inside arrow heads
        const tubeRadius = 0.02;
        
        // Add Move arrows (same as move gizmo)
        const xArrowDir = new THREE.Vector3(1, 0, 0);
        const xArrow = new THREE.ArrowHelper(xArrowDir, new THREE.Vector3(0, 0, 0), arrowLength, 0xff0000, arrowHeadLength, arrowHeadWidth);
        xArrow.name = 'xArrow';
        xArrow.line.material.depthTest = false;
        xArrow.line.material.depthWrite = false;
        xArrow.cone.material.depthTest = false;
        xArrow.cone.material.depthWrite = false;
        xArrow.line.renderOrder = 999;
        xArrow.cone.renderOrder = 999;
        this.transformGizmoGroup.add(xArrow);
        this.gizmoHandles.set('x_move', xArrow.cone);
        this.gizmoElements.set('x_move', xArrow);
        
        const yArrowDir = new THREE.Vector3(0, 1, 0);
        const yArrow = new THREE.ArrowHelper(yArrowDir, new THREE.Vector3(0, 0, 0), arrowLength, 0x00ff00, arrowHeadLength, arrowHeadWidth);
        yArrow.name = 'yArrow';
        yArrow.line.material.depthTest = false;
        yArrow.line.material.depthWrite = false;
        yArrow.cone.material.depthTest = false;
        yArrow.cone.material.depthWrite = false;
        yArrow.line.renderOrder = 999;
        yArrow.cone.renderOrder = 999;
        this.transformGizmoGroup.add(yArrow);
        this.gizmoHandles.set('y_move', yArrow.cone);
        this.gizmoElements.set('y_move', yArrow);
        
        const zArrowDir = new THREE.Vector3(0, 0, 1);
        const zArrow = new THREE.ArrowHelper(zArrowDir, new THREE.Vector3(0, 0, 0), arrowLength, 0x0000ff, arrowHeadLength, arrowHeadWidth);
        zArrow.name = 'zArrow';
        zArrow.line.material.depthTest = false;
        zArrow.line.material.depthWrite = false;
        zArrow.cone.material.depthTest = false;
        zArrow.cone.material.depthWrite = false;
        zArrow.line.renderOrder = 999;
        zArrow.cone.renderOrder = 999;
        this.transformGizmoGroup.add(zArrow);
        this.gizmoHandles.set('z_move', zArrow.cone);
        this.gizmoElements.set('z_move', zArrow);
        
        // Add Rotate half-circles (same as rotate gizmo)
        const xCircleGeom = new THREE.TorusGeometry(radius, tubeRadius, 16, 32, Math.PI);
        const xCircleMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
        const xCircle = new THREE.Mesh(xCircleGeom, xCircleMat);
        xCircle.rotation.y = Math.PI / 2;
        xCircle.name = 'xCircle';
        xCircle.renderOrder = 999;
        this.transformGizmoGroup.add(xCircle);
        this.gizmoHandles.set('x_rotate', xCircle);
        this.gizmoElements.set('x_rotate', xCircle);
        
        const yCircleGeom = new THREE.TorusGeometry(radius, tubeRadius, 16, 32, Math.PI);
        const yCircleMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
        const yCircle = new THREE.Mesh(yCircleGeom, yCircleMat);
        yCircle.rotation.x = Math.PI / 2;
        yCircle.name = 'yCircle';
        yCircle.renderOrder = 999;
        this.transformGizmoGroup.add(yCircle);
        this.gizmoHandles.set('y_rotate', yCircle);
        this.gizmoElements.set('y_rotate', yCircle);
        
        const zCircleGeom = new THREE.TorusGeometry(radius, tubeRadius, 16, 32, Math.PI);
        const zCircleMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
        const zCircle = new THREE.Mesh(zCircleGeom, zCircleMat);
        zCircle.name = 'zCircle';
        zCircle.renderOrder = 999;
        this.transformGizmoGroup.add(zCircle);
        this.gizmoHandles.set('z_rotate', zCircle);
        this.gizmoElements.set('z_rotate', zCircle);
        
        // Add central sphere
        const sphereGeom = new THREE.SphereGeometry(0.1, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0x888888, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.renderOrder = 999;
        this.transformGizmoGroup.add(sphere);
        
        // Set render order for gizmo
        this.transformGizmoGroup.renderOrder = 999;
        
        // Add to scene
        this.scene.add(this.transformGizmoGroup);
        
        // Setup drag interaction
        this.setupTransformDrag();
        
        console.log('Transform gizmo (both arrows and half-circles) created at', center);
    };
    
    // Show rotate gizmo at selected part's origin
    GLTFViewer.prototype.showRotateGizmo = function(partUUID) {
        if (!partUUID) {
            console.warn('No part UUID provided for rotate gizmo');
            return;
        }
        
        const part = this.partsList.find(p => p.uuid === partUUID);
        if (!part || !part.object) {
            console.warn('Part not found for rotate gizmo:', partUUID);
            return;
        }
        
        // Clear any existing gizmo
        this.hideTransformGizmo();
        
        // Set transform mode and target
        this.transformMode = 'rotate';
        this.transformTarget = partUUID;
        this.transformTargetObject = part.object;
        
        // Calculate bounding box center (part origin)
        const box = new THREE.Box3().setFromObject(part.object);
        const center = box.getCenter(new THREE.Vector3());
        
        // Create gizmo group
        this.transformGizmoGroup = new THREE.Group();
        this.transformGizmoGroup.position.copy(center);
        this.transformGizmoGroup.name = 'RotateGizmo';
        
        // Circle radius
        const radius = 1.0;
        const tubeRadius = 0.02;
        
        // Create central sphere
        const sphereGeom = new THREE.SphereGeometry(0.1, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.renderOrder = 999;
        this.transformGizmoGroup.add(sphere);
        
        // Create X axis half-circle (Red) - rotation around X axis
        const xCircleGeom = new THREE.TorusGeometry(radius, tubeRadius, 16, 32, Math.PI);
        const xCircleMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const xCircle = new THREE.Mesh(xCircleGeom, xCircleMat);
        xCircle.rotation.y = Math.PI / 2; // Rotate to align with X axis
        xCircle.name = 'xCircle';
        xCircle.renderOrder = 999;
        this.transformGizmoGroup.add(xCircle);
        this.gizmoHandles.set('x', xCircle);
        
        // Create Y axis half-circle (Green) - rotation around Y axis
        const yCircleGeom = new THREE.TorusGeometry(radius, tubeRadius, 16, 32, Math.PI);
        const yCircleMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const yCircle = new THREE.Mesh(yCircleGeom, yCircleMat);
        yCircle.rotation.x = Math.PI / 2; // Rotate to align with Y axis
        yCircle.name = 'yCircle';
        yCircle.renderOrder = 999;
        this.transformGizmoGroup.add(yCircle);
        this.gizmoHandles.set('y', yCircle);
        
        // Create Z axis half-circle (Blue) - rotation around Z axis
        const zCircleGeom = new THREE.TorusGeometry(radius, tubeRadius, 16, 32, Math.PI);
        const zCircleMat = new THREE.MeshBasicMaterial({
            color: 0x0000ff,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const zCircle = new THREE.Mesh(zCircleGeom, zCircleMat);
        // Z circle is already aligned correctly
        zCircle.name = 'zCircle';
        zCircle.renderOrder = 999;
        this.transformGizmoGroup.add(zCircle);
        this.gizmoHandles.set('z', zCircle);
        
        // Set render order for gizmo
        this.transformGizmoGroup.renderOrder = 999;
        
        // Add to scene
        this.scene.add(this.transformGizmoGroup);
        
        // Setup drag interaction
        this.setupTransformDrag();
        
        console.log('Rotate gizmo created at', center);
    };
    
    // Show scale gizmo at selected part's origin
    GLTFViewer.prototype.showScaleGizmo = function(partUUID) {
        if (!partUUID) {
            console.warn('No part UUID provided for scale gizmo');
            return;
        }
        
        const part = this.partsList.find(p => p.uuid === partUUID);
        if (!part || !part.object) {
            console.warn('Part not found for scale gizmo:', partUUID);
            return;
        }
        
        // Clear any existing gizmo
        this.hideTransformGizmo();
        
        // Set transform mode and target
        this.transformMode = 'scale';
        this.transformTarget = partUUID;
        this.transformTargetObject = part.object;
        
        // Calculate bounding box center (part origin)
        const box = new THREE.Box3().setFromObject(part.object);
        const center = box.getCenter(new THREE.Vector3());
        
        // Create gizmo group
        this.transformGizmoGroup = new THREE.Group();
        this.transformGizmoGroup.position.copy(center);
        this.transformGizmoGroup.name = 'ScaleGizmo';
        
        // Line length and cube size
        const lineLength = 1.0;
        const cubeSize = 0.15;
        
        // Create X axis line and cube (Red)
        const xLineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(lineLength, 0, 0)
        ]);
        const xLineMat = new THREE.LineBasicMaterial({
            color: 0xff0000,
            depthTest: false,
            depthWrite: false
        });
        const xLine = new THREE.Line(xLineGeom, xLineMat);
        xLine.renderOrder = 999;
        this.transformGizmoGroup.add(xLine);
        
        const xCubeGeom = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const xCubeMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const xCube = new THREE.Mesh(xCubeGeom, xCubeMat);
        xCube.position.set(lineLength, 0, 0);
        xCube.name = 'xCube';
        xCube.renderOrder = 999;
        this.transformGizmoGroup.add(xCube);
        this.gizmoHandles.set('x', xCube);
        
        // Create Y axis line and cube (Green)
        const yLineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, lineLength, 0)
        ]);
        const yLineMat = new THREE.LineBasicMaterial({
            color: 0x00ff00,
            depthTest: false,
            depthWrite: false
        });
        const yLine = new THREE.Line(yLineGeom, yLineMat);
        yLine.renderOrder = 999;
        this.transformGizmoGroup.add(yLine);
        
        const yCubeGeom = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const yCubeMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const yCube = new THREE.Mesh(yCubeGeom, yCubeMat);
        yCube.position.set(0, lineLength, 0);
        yCube.name = 'yCube';
        yCube.renderOrder = 999;
        this.transformGizmoGroup.add(yCube);
        this.gizmoHandles.set('y', yCube);
        
        // Create Z axis line and cube (Blue)
        const zLineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, lineLength)
        ]);
        const zLineMat = new THREE.LineBasicMaterial({
            color: 0x0000ff,
            depthTest: false,
            depthWrite: false
        });
        const zLine = new THREE.Line(zLineGeom, zLineMat);
        zLine.renderOrder = 999;
        this.transformGizmoGroup.add(zLine);
        
        const zCubeGeom = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
        const zCubeMat = new THREE.MeshBasicMaterial({
            color: 0x0000ff,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        const zCube = new THREE.Mesh(zCubeGeom, zCubeMat);
        zCube.position.set(0, 0, lineLength);
        zCube.name = 'zCube';
        zCube.renderOrder = 999;
        this.transformGizmoGroup.add(zCube);
        this.gizmoHandles.set('z', zCube);
        
        // Set render order for gizmo
        this.transformGizmoGroup.renderOrder = 999;
        
        // Add to scene
        this.scene.add(this.transformGizmoGroup);
        
        // Setup drag interaction
        this.setupTransformDrag();
        
        console.log('Scale gizmo created at', center);
    };
    
    // Hide transform gizmo
    GLTFViewer.prototype.hideTransformGizmo = function() {
        if (this.transformGizmoGroup) {
            this.scene.remove(this.transformGizmoGroup);
            this.transformGizmoGroup = null;
        }
        
        // Ensure handle maps exist before clearing (clear may run before gizmos initialize)
        if (!this.gizmoHandles) {
            this.gizmoHandles = new Map();
        }
        if (!this.gizmoElements) {
            this.gizmoElements = new Map();
        }
        
        this.gizmoHandles.clear();
        this.gizmoElements.clear();
        this.activeGizmoElement = null;
        this.transformPivotPoint = null;
        
        // Reset transform state
        this.transformMode = null;
        this.transformTarget = null;
        this.transformTargetObject = null;
        this.transformDragging = false;
        this.transformDragAxis = null;
    };
    
    // Setup drag interaction for transform gizmo
    GLTFViewer.prototype.setupTransformDrag = function() {
        const canvas = this.renderer.domElement;
        
        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            if (!this.transformGizmoGroup) return;
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) return;
            
            // Raycast to check if clicking on gizmo handle
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Map mouse position into renderer viewport coordinates
            const viewport = this._transformViewport || new THREE.Vector4();
            this._transformViewport = viewport;
            this.renderer.getViewport(viewport);
            const pixelRatio = this.renderer.getPixelRatio ? this.renderer.getPixelRatio() : window.devicePixelRatio || 1;
            const viewportX = viewport.x / pixelRatio;
            const viewportY = viewport.y / pixelRatio;
            const viewportWidth = viewport.z / pixelRatio;
            const viewportHeight = viewport.w / pixelRatio;
            const normalizedX = ((mouseX - viewportX) / viewportWidth) * 2 - 1;
            const normalizedY = -(((mouseY - viewportY) / viewportHeight) * 2 - 1);
            const mouse = new THREE.Vector2(normalizedX, normalizedY);
            
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            
            // Check intersection only with actual gizmo handles (arrow heads, circles, cubes)
            const handles = Array.from(this.gizmoHandles.values());
            const intersects = raycaster.intersectObjects(handles, false);
            
            if (intersects.length > 0) {
                const clickedHandle = intersects[0].object;
                
                // Prevent part selection when clicking gizmo
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                // Determine which axis and mode was clicked
                // Check both handle key and object name
                let handleKey = null;
                for (const [key, handle] of this.gizmoHandles.entries()) {
                    if (handle === clickedHandle) {
                        handleKey = key;
                        break;
                    }
                }
                
                if (handleKey) {
                    // Extract axis and mode from handle key (e.g., 'x_move', 'y_rotate', 'x', 'xCube')
                    if (handleKey.includes('_move') || (handleKey.length === 1 && handleKey.match(/[xyz]/i))) {
                        this.transformDragAxis = handleKey.charAt(0); // Extract 'x', 'y', or 'z'
                        this.transformDragMode = 'move';
                    } else if (handleKey.includes('_rotate') || handleKey.includes('Circle')) {
                        this.transformDragAxis = handleKey.charAt(0);
                        this.transformDragMode = 'rotate';
                    } else if (handleKey.includes('Cube')) {
                        this.transformDragAxis = handleKey.charAt(0);
                        this.transformDragMode = 'scale';
                    }
                } else {
                    // Fallback: check parent name for arrow cones
                    let handleName = clickedHandle.name;
                    if (clickedHandle.parent && clickedHandle.parent.name) {
                        handleName = clickedHandle.parent.name;
                    }
                    
                    if (handleName.includes('xArrow') || clickedHandle.name === 'xCube' || clickedHandle.name === 'xCircle') {
                        this.transformDragAxis = 'x';
                    } else if (handleName.includes('yArrow') || clickedHandle.name === 'yCube' || clickedHandle.name === 'yCircle') {
                        this.transformDragAxis = 'y';
                    } else if (handleName.includes('zArrow') || clickedHandle.name === 'zCube' || clickedHandle.name === 'zCircle') {
                        this.transformDragAxis = 'z';
                    }
                    
                    // Determine mode based on handle name
                    if (clickedHandle.name.includes('Circle')) {
                        this.transformDragMode = 'rotate';
                    } else if (clickedHandle.name.includes('Cube')) {
                        this.transformDragMode = 'scale';
                    } else {
                        this.transformDragMode = 'move';
                    }
                }
                
                if (this.transformDragAxis) {
                    this.transformDragging = true;
                    this.transformDragStart.set(e.clientX, e.clientY);
                    
                    // Disable camera controls while dragging
                    if (this.controls) {
                        this.controls.enabled = false;
                    }
                    
                    // Highlight the active gizmo element (make it thick and change color)
                    const keyCandidates = [];
                    if (this.transformDragMode === 'move') {
                        keyCandidates.push(`${this.transformDragAxis}_move`);
                    } else if (this.transformDragMode === 'rotate') {
                        keyCandidates.push(`${this.transformDragAxis}_rotate`);
                    } else if (this.transformDragMode === 'scale') {
                        keyCandidates.push(`${this.transformDragAxis}_scale`);
                    }
                    // Always try plain axis key as fallback (used by move-only/rotate-only gizmos)
                    keyCandidates.push(this.transformDragAxis);
                    
                    let activeElement = null;
                    for (const key of keyCandidates) {
                        if (this.gizmoElements.has(key)) {
                            activeElement = this.gizmoElements.get(key);
                            break;
                        }
                    }
                    if (activeElement) {
                        this.activeGizmoElement = activeElement;
                        // Store original color for restoration
                        this.activeGizmoOriginalColor = null;
                        
                        // Make line/circle thicker by scaling and change color to yellow/gold
                        if (activeElement.type === 'ArrowHelper' || activeElement.cone) {
                            // For arrows, scale up the entire arrow
                            activeElement.scale.set(1.3, 1.3, 1.3);
                            // Store original colors
                            this.activeGizmoOriginalColor = {
                                line: activeElement.line.material.color.getHex(),
                                cone: activeElement.cone.material.color.getHex()
                            };
                            // Change to yellow/gold color (0xffff00 or 0xffd700)
                            activeElement.line.material.color.setHex(0xffd700);
                            activeElement.cone.material.color.setHex(0xffd700);
                        } else if (activeElement.isMesh && activeElement.geometry.type === 'TorusGeometry') {
                            // For circles, scale up and change color
                            activeElement.scale.set(1.3, 1.3, 1.3);
                            // Store original color
                            this.activeGizmoOriginalColor = activeElement.material.color.getHex();
                            // Change to yellow/gold color
                            activeElement.material.color.setHex(0xffd700);
                        }
                    }
                    
                    // Store initial value based on drag mode
                    if (this.transformDragMode === 'move' || this.transformMode === 'move') {
                        this.transformInitialValue = this.transformTargetObject.position.clone();
                    } else if (this.transformDragMode === 'rotate' || this.transformMode === 'rotate') {
                        this.transformInitialValue = this.transformTargetObject.rotation.clone();
                    } else if (this.transformDragMode === 'scale' || this.transformMode === 'scale') {
                        this.transformInitialValue = this.transformTargetObject.scale.clone();
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
            }
        };
        
        const onMouseMove = (e) => {
            if (!this.transformDragging || !this.transformDragAxis) return;
            
            // Prevent camera rotation during drag
            e.preventDefault();
            e.stopPropagation();
            
            const deltaX = e.clientX - this.transformDragStart.x;
            const deltaY = e.clientY - this.transformDragStart.y;
            
            // Calculate drag amount - use both X and Y for smoother control
            // For horizontal axes (X, Z), use X movement
            // For vertical axis (Y), use Y movement
            let dragAmount = 0;
            let dragAmountY = 0;
            
            if (this.transformDragAxis === 'y') {
                // Y axis uses vertical mouse movement
                dragAmountY = -deltaY * 0.003; // Reduced speed for accurate control
                dragAmount = dragAmountY;
            } else {
                // X and Z axes use horizontal mouse movement
                dragAmount = deltaX * 0.003; // Reduced speed for accurate control
            }
            
            // Determine actual mode (use transformDragMode if set, otherwise transformMode)
            const actualMode = this.transformDragMode || this.transformMode;
            
            if (actualMode === 'move') {
                // Move part along selected axis (in world space, but relative to part's current position)
                const moveVector = new THREE.Vector3();
                if (this.transformDragAxis === 'x') {
                    moveVector.x = dragAmount;
                } else if (this.transformDragAxis === 'y') {
                    moveVector.y = dragAmount; // Use calculated dragAmount (already Y for Y axis)
                } else if (this.transformDragAxis === 'z') {
                    moveVector.z = dragAmount;
                }
                
                // Apply movement relative to part's current position (not world origin)
                this.transformTargetObject.position.copy(this.transformInitialValue).add(moveVector);
                if (this.transformPivotPoint) {
                    this.transformPivotPoint.add(moveVector);
                }
                
                // Force matrix update for smooth live update
                this.transformTargetObject.updateMatrixWorld(true);
                
                // Update gizmo position to follow part (at part's bounding box center)
                if (this.transformGizmoGroup) {
                    const box = new THREE.Box3().setFromObject(this.transformTargetObject);
                    const center = box.getCenter(new THREE.Vector3());
                    this.transformGizmoGroup.position.copy(center);
                }
                
                // Request animation frame for smooth updates
                if (!this._transformAnimationFrame) {
                    this._transformAnimationFrame = requestAnimationFrame(() => {
                        this._transformAnimationFrame = null;
                    });
                }
                
            } else if (actualMode === 'rotate') {
                // Rotate part around pivot point (part's bounding box center/origin)
                const rotateAmount = dragAmount * Math.PI * 0.3; // Convert to radians, reduced sensitivity
                
                // Get pivot point (stored when gizmo was created)
                const pivotPoint = (this.transformPivotPoint ? this.transformPivotPoint.clone() : this.transformTargetObject.position.clone());
                
                // Store current position
                const currentPos = this.transformTargetObject.position.clone();
                
                // Calculate offset from pivot to object position
                const offset = new THREE.Vector3().subVectors(currentPos, pivotPoint);
                
                // Get rotation axis
                const axis = new THREE.Vector3();
                if (this.transformDragAxis === 'x') {
                    axis.set(1, 0, 0);
                } else if (this.transformDragAxis === 'y') {
                    axis.set(0, 1, 0);
                } else if (this.transformDragAxis === 'z') {
                    axis.set(0, 0, 1);
                }
                
                // Create quaternion for rotation around axis
                const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, rotateAmount);
                
                // Rotate the offset vector
                offset.applyQuaternion(quaternion);
                
                // Apply rotation to object
                if (this.transformDragAxis === 'x') {
                    this.transformTargetObject.rotation.x = this.transformInitialValue.x + rotateAmount;
                } else if (this.transformDragAxis === 'y') {
                    this.transformTargetObject.rotation.y = this.transformInitialValue.y + rotateAmount;
                } else if (this.transformDragAxis === 'z') {
                    this.transformTargetObject.rotation.z = this.transformInitialValue.z + rotateAmount;
                }
                
                // Update position to maintain rotation around pivot
                this.transformTargetObject.position.copy(pivotPoint).add(offset);
                this.transformPivotPoint = pivotPoint.clone();
                
                // Force matrix update
                this.transformTargetObject.updateMatrixWorld(true);
                
                // Update gizmo position to follow part (at part's bounding box center)
                if (this.transformGizmoGroup) {
                    const newBox = new THREE.Box3().setFromObject(this.transformTargetObject);
                    const center = newBox.getCenter(new THREE.Vector3());
                    this.transformGizmoGroup.position.copy(center);
                }
                
            } else if (actualMode === 'scale') {
                // Scale part along selected axis
                const scaleAmount = 1.0 + dragAmount;
                
                if (this.transformDragAxis === 'x') {
                    this.transformTargetObject.scale.x = Math.max(0.1, this.transformInitialValue.x * scaleAmount);
                } else if (this.transformDragAxis === 'y') {
                    this.transformTargetObject.scale.y = Math.max(0.1, this.transformInitialValue.y * scaleAmount);
                } else if (this.transformDragAxis === 'z') {
                    this.transformTargetObject.scale.z = Math.max(0.1, this.transformInitialValue.z * scaleAmount);
                }
                
                // Force matrix update
                this.transformTargetObject.updateMatrixWorld(true);
            }
            
            e.preventDefault();
        };
        
        const onMouseUp = (e) => {
            if (this.transformDragging) {
                this.transformDragging = false;
                
                // Remove highlighting (restore normal size and color)
                if (this.activeGizmoElement) {
                    if (this.activeGizmoElement.type === 'ArrowHelper' || this.activeGizmoElement.cone) {
                        // Restore arrow scale and color
                        this.activeGizmoElement.scale.set(1, 1, 1);
                        // Restore original colors
                        if (this.activeGizmoOriginalColor && typeof this.activeGizmoOriginalColor === 'object') {
                            this.activeGizmoElement.line.material.color.setHex(this.activeGizmoOriginalColor.line);
                            this.activeGizmoElement.cone.material.color.setHex(this.activeGizmoOriginalColor.cone);
                        }
                    } else if (this.activeGizmoElement.isMesh && this.activeGizmoElement.geometry.type === 'TorusGeometry') {
                        // Restore circle scale and color
                        this.activeGizmoElement.scale.set(1, 1, 1);
                        // Restore original color
                        if (this.activeGizmoOriginalColor && typeof this.activeGizmoOriginalColor === 'number') {
                            this.activeGizmoElement.material.color.setHex(this.activeGizmoOriginalColor);
                        }
                    }
                    this.activeGizmoElement = null;
                    this.activeGizmoOriginalColor = null;
                }
                
                this.transformDragAxis = null;
                this.transformDragMode = null;
                this.transformInitialValue = null;
                
                // Re-enable camera controls
                if (this.controls) {
                    this.controls.enabled = true;
                }
                
                // Cancel any pending animation frame
                if (this._transformAnimationFrame) {
                    cancelAnimationFrame(this._transformAnimationFrame);
                    this._transformAnimationFrame = null;
                }
                
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            
            // Don't hide gizmo on outside click - only hide when part is deselected
            // Gizmo stays visible as long as part is selected and tool is enabled
        };
        
        // Remove old listeners if they exist
        if (this._transformMouseDown) {
            canvas.removeEventListener('mousedown', this._transformMouseDown);
        }
        if (this._transformMouseMove) {
            canvas.removeEventListener('mousemove', this._transformMouseMove);
        }
        if (this._transformMouseUp) {
            canvas.removeEventListener('mouseup', this._transformMouseUp);
        }
        
        // Store references for cleanup
        this._transformMouseDown = onMouseDown;
        this._transformMouseMove = onMouseMove;
        this._transformMouseUp = onMouseUp;
        
        // Add new listeners with capture phase to intercept before other handlers
        canvas.addEventListener('mousedown', onMouseDown, true); // Use capture phase
        canvas.addEventListener('mousemove', onMouseMove, true);
        canvas.addEventListener('mouseup', onMouseUp, true);
    };
}

