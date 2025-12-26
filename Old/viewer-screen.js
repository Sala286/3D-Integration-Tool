/**
 * GLTF Viewer - Screen/UI Module
 * Handles scene setup, rendering, model loading, and UI helpers
 */

window.__rotationModePreference = window.__rotationModePreference || 'screen';

class GLTFViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.loadedModels = []; // Array of {model, fileName, name, uuid}
        this.animations = [];
        this.mixers = []; // Array of mixers, one per model
        this.clock = new THREE.Clock();
        
        this.wireframeEnabled = false;
        
        // Selection state
        this.selectedPartUUIDs = []; // Array of selected part UUIDs for multiple selection
        this.originalMaterials = new Map(); // Store original materials for all parts
        this.originalSelectionColors = new Map(); // Store original colors for selected parts (for temporary highlight)
        this.selectionBox = null; // Selection box overlay element
        this.isBoxSelecting = false; // Box selection state
        this._currentDragUUID = null; // Track current drag UUID for drop handlers
        
        // Random color view state
        this.randomColorsEnabled = false;
        this.randomColorMaterialMap = new Map(); // Map of mesh UUID -> { original, random }
        this._randomColorsPaused = false;
        
        // Sidebar width (should match CSS)
        this.sidebarWidth = 300;
        
        // Area zoom state
        this.areaZoomActive = false;
        this.areaZoomStart = null;
        this.areaZoomBox = null;
        
        this.previewActive = false;
        this.previewBox = null;
        this.previewOverlay = null;
        
        // Boundary box state
        this.boundaryBoxHelper = null;
        this.boundaryBoxVisible = false;
        this.boundaryBoxCenter = null; // Store boundary box center for rotation

        // Rotation mode state
        this.rotationPivotMode = window.__rotationModePreference || 'screen';
        this._activeRotationPivot = null;
        this._isRotating = false;
        this._isPanning = false;
        this._isZooming = false;
        this._lastInteractionTime = 0;
        this._interactionTimeout = null;
        this._lockedRotationPivot = null; // Locked pivot point during rotation
        
        this.init();
        this.setupMessageListener();
    }
    
    isPointInCanvasArea(clientX, clientY) {
        // Check if mouse position is within canvas area (excluding sidebar and viewport indicator)
        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const sidebarRight = rect.right;
        const canvasLeft = rect.left;
        const canvasRight = sidebarRight - this.sidebarWidth;
        
        // Check if point is within canvas bounds (excluding sidebar) 
        if (!(clientX >= canvasLeft && clientX <= canvasRight && 
               clientY >= rect.top && clientY <= rect.bottom)) {
            return false;
        }
        
        return true;
    }
    
    init() {
        // Check if Three.js is available
        if (typeof THREE === 'undefined') {
            this.showError('Three.js library not found. Please ensure three.min.js is in the viewer directory.');
            return;
        }
        
        // Create scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xffffff);
        
        // Add ambient light - reduced intensity to match captured image colors
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(ambientLight);
        
        // Add directional light - will follow camera view direction
        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(5, 10, 5);
        this.scene.add(this.directionalLight);
        
        // Add hemisphere light for better overall illumination - reduced intensity
        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.15);
        hemisphereLight.position.set(0, 10, 0);
        this.scene.add(hemisphereLight);
        
        // Create camera
        const container = document.getElementById('container');
        // Calculate canvas area excluding sidebar
        const canvasWidth = container.clientWidth - this.sidebarWidth;
        const canvasHeight = container.clientHeight;
        const aspect = canvasWidth / canvasHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(5, 5, 5);
        this.perspectiveCamera = this.camera;
        this.orthographicCamera = null;
        this.cameraMode = 'perspective';
        this._orthoFrustumHeight = 10;
        this._orthoFrustumDistance = 5;
        
        // Create renderer with performance optimizations
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('canvas'),
            antialias: true,
            powerPreference: 'high-performance',
            logarithmicDepthBuffer: false,
            preserveDrawingBuffer: true  // Required for canvas.toDataURL() to work
        });
        // Enable sorting by renderOrder to ensure cursor renders on top
        this.renderer.sortObjects = true;
        // Set renderer size to full container (canvas is full screen, sidebar is overlay)
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        // Set viewport to exclude sidebar area
        this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
        // Limit pixel ratio for better performance on high-DPI displays
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        // Performance optimizations
        this.renderer.shadowMap.enabled = false; // Disable shadows for better performance
        // Keep sortObjects = true to ensure cursor renders on top (set above)
        
        // Initialize orthographic camera (default view)
        this.orthographicCamera = this._createOrthographicCamera(aspect);
        this.camera = this.orthographicCamera;
        this.cameraMode = 'orthographic';
        this._updateActiveCameraProjection(aspect);
        
        // Setup orbit controls (fallback to manual if not available)
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = false; // Disabled for immediate stop
            this.controls.minDistance = 0.5;
            this.controls.maxDistance = 100;
            // Enable pan and zoom, disable default rotation (using CAD-style rotation instead)
            this.controls.enableRotate = false; // Disabled - using CAD-style rotation
            this.controls.enablePan = true;
            this.controls.panSpeed = 1.0;
            // Mouse buttons: middle=pan, right=zoom (left will be handled by CAD rotation)
            this.controls.mouseButtons = {
                LEFT: null, // Handled by CAD rotation
                MIDDLE: THREE.MOUSE.PAN,
                RIGHT: THREE.MOUSE.DOLLY
            };
            this.controls.touches = {
                ONE: null, // Handled by CAD rotation
                TWO: THREE.TOUCH.DOLLY_PAN
            };
            // Note: Rotation tracking is handled by CAD-style rotation in setupCADRotation()
            
            // Setup controls (methods added by viewer-controls.js)
            // Retry mechanism: if controls aren't loaded yet, try again after a delay
            const setupControls = () => {
                let allSetup = true;
                
            if (typeof this.setupCADRotation === 'function') {
                this.setupCADRotation();
                } else {
                    allSetup = false;
            }
                
            if (typeof this.setupPanControls === 'function') {
                this.setupPanControls();
                } else {
                    allSetup = false;
            }
                
            if (typeof this.setupZoomToPoint === 'function') {
                this.setupZoomToPoint();
                } else {
                    allSetup = false;
            }
                
            if (typeof this.setupModelClickDetection === 'function') {
                this.setupModelClickDetection();
                } else {
                    allSetup = false;
            }
                
            if (typeof this.setupAreaZoom === 'function') {
                this.setupAreaZoom();
                } else {
                    allSetup = false;
            }
                
            // Setup preview
                if (typeof this.setupPreview === 'function') {
            this.setupPreview();
                }
                
                // If controls weren't available, retry after a delay
                if (!allSetup) {
                    console.warn('Some control functions not available, retrying in 200ms...');
                    setTimeout(() => {
                        if (!this._controlsSetupComplete) {
                            setupControls();
                        }
                    }, 200);
                } else {
                    this._controlsSetupComplete = true;
                    console.log('All controls setup complete');
                }
            };
            
            setupControls();
        } else {
            // Manual controls if OrbitControls not available
            this.setupManualControls();
        }
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
        
        // Initialize image capture module
        if (typeof window.ImageCapture !== 'undefined') {
            this.imageCapture = new window.ImageCapture(this);
            console.log('Image capture module initialized');
        } else {
            console.warn('Image capture module not available');
        }
        
        // Initialize 3D cursor (like Blender)
        this.init3DCursor();
        
        // Initialize part origin indicator
        this.initPartOriginIndicator();
        
        // Initialize rotation pivot indicator
        this.initRotationPivotIndicator();
        
        // Initialize viewport axis indicator (HUD)
        this.initViewportAxisIndicator();

        // Initialize section plane manager (UI + clipping tools)
        if (typeof this.initSectionManager === 'function') {
            this.initSectionManager();
        }
        
        // Initialize transform gizmos
        if (typeof this.initTransformGizmos === 'function') {
            this.initTransformGizmos();
        }
        
        // Start render loop
        this.animate();
        
        this.hideLoading();
        this._updatePerspectiveButtonState();
    }
    
    // Public method to re-setup controls (useful if scripts load after initialization)
    reSetupControls() {
        if (!this.controls) {
            console.warn('Cannot re-setup controls: OrbitControls not available');
            return false;
        }
        
        console.log('Re-setting up controls...');
        this._controlsSetupComplete = false;
        
        if (typeof this.setupCADRotation === 'function') {
            this.setupCADRotation();
        }
        if (typeof this.setupPanControls === 'function') {
            this.setupPanControls();
        }
        if (typeof this.setupZoomToPoint === 'function') {
            this.setupZoomToPoint();
        }
        if (typeof this.setupModelClickDetection === 'function') {
            this.setupModelClickDetection();
        }
        if (typeof this.setupAreaZoom === 'function') {
            this.setupAreaZoom();
        }
        if (typeof this.setupPreview === 'function') {
            this.setupPreview();
        }
        
        this._controlsSetupComplete = true;
        console.log('Controls re-setup complete');
        return true;
    }
    
    init3DCursor() {
        // Initialize 3D cursor at world origin (0, 0, 0)
        this.cursor3DPosition = new THREE.Vector3(0, 0, 0);
        this.cursor3DEnabled = false; // Cursor placement mode off by default
        
        // Create visual representation of 3D cursor (like Blender)
        // Single orange dotted circle with dark grey axis lines
        const cursorGroup = new THREE.Group();
        
        // Create single orange dotted circle (much smaller)
        const circleRadius = 0.08; // Much smaller size
        
        // Create dotted circle using line segments
        const circlePoints = [];
        const segments = 20; // Number of dots around the circle
        const dotAngle = (Math.PI * 2) / segments * 0.4; // Angle for each dot (40% of segment)
        
        for (let i = 0; i < segments; i++) {
            const segmentAngle = (i / segments) * Math.PI * 2;
            const angle1 = segmentAngle;
            const angle2 = segmentAngle + dotAngle;
            const x1 = Math.cos(angle1) * circleRadius;
            const y1 = Math.sin(angle1) * circleRadius;
            const x2 = Math.cos(angle2) * circleRadius;
            const y2 = Math.sin(angle2) * circleRadius;
            circlePoints.push(new THREE.Vector3(x1, y1, 0));
            circlePoints.push(new THREE.Vector3(x2, y2, 0));
        }
        
        const circleLineGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
        const circleLineMaterial = new THREE.LineBasicMaterial({
            color: 0xff0000, // Red color
            linewidth: 1,
            depthTest: false, // Always visible, even behind objects
            depthWrite: false, // Don't write to depth buffer
            polygonOffset: false
        });
        const dottedCircle = new THREE.LineSegments(circleLineGeometry, circleLineMaterial);
        dottedCircle.renderOrder = 999; // Render on top
        cursorGroup.add(dottedCircle);
        
        // Store reference to dotted circle for billboard effect
        this.cursor3DCircle = dottedCircle;
        
        // Add axis lines (X, Y, Z) in dark grey - lines don't join at center
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x404040, // Dark grey
            transparent: false,
            linewidth: 1,
            depthTest: false, // Always visible, even behind objects
            depthWrite: false, // Don't write to depth buffer
            polygonOffset: false
        });
        
        const lineLength = 0.2; // Bigger line length
        const gapSize = 0.03; // Bigger gap at center so lines don't join
        
        // X axis line - two separate lines (don't join at center)
        const xLine1Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-lineLength, 0, 0),
            new THREE.Vector3(-gapSize, 0, 0)
        ]);
        const xLine1 = new THREE.Line(xLine1Geometry, lineMaterial);
        xLine1.renderOrder = 999; // Render on top
        cursorGroup.add(xLine1);
        
        const xLine2Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(gapSize, 0, 0),
            new THREE.Vector3(lineLength, 0, 0)
        ]);
        const xLine2 = new THREE.Line(xLine2Geometry, lineMaterial);
        xLine2.renderOrder = 999; // Render on top
        cursorGroup.add(xLine2);
        
        // Y axis line - two separate lines (don't join at center)
        const yLine1Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -lineLength, 0),
            new THREE.Vector3(0, -gapSize, 0)
        ]);
        const yLine1 = new THREE.Line(yLine1Geometry, lineMaterial);
        yLine1.renderOrder = 999; // Render on top
        cursorGroup.add(yLine1);
        
        const yLine2Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, gapSize, 0),
            new THREE.Vector3(0, lineLength, 0)
        ]);
        const yLine2 = new THREE.Line(yLine2Geometry, lineMaterial);
        yLine2.renderOrder = 999; // Render on top
        cursorGroup.add(yLine2);
        
        // Z axis line - two separate lines (don't join at center)
        const zLine1Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, -lineLength),
            new THREE.Vector3(0, 0, -gapSize)
        ]);
        const zLine1 = new THREE.Line(zLine1Geometry, lineMaterial);
        zLine1.renderOrder = 999; // Render on top
        cursorGroup.add(zLine1);
        
        const zLine2Geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, gapSize),
            new THREE.Vector3(0, 0, lineLength)
        ]);
        const zLine2 = new THREE.Line(zLine2Geometry, lineMaterial);
        zLine2.renderOrder = 999; // Render on top
        cursorGroup.add(zLine2);
        
        // Position at origin
        cursorGroup.position.copy(this.cursor3DPosition);
        
        // Circle will be rotated to face camera in animate() function
        // Axis lines stay in world space (no rotation)
        
        // Set render order to render on top (higher number = renders later/on top)
        cursorGroup.renderOrder = 999;
        
        this.cursor3DGroup = cursorGroup;
        this.scene.add(cursorGroup); // Add to main scene
        
        // Setup cursor click handler
        this.setupCursorClickHandler();
    }
    
    initPartOriginIndicator() {
        // Create dark orange origin indicator for selected parts
        // This will be positioned at the bounding box center of selected parts
        // Maintains fixed screen size like cursor
        
        // Create a small sphere as the origin point (base size, will be scaled dynamically)
        const baseSize = 0.01; // Very small base size - like a point
        const sphereGeometry = new THREE.SphereGeometry(baseSize, 12, 12);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF4500, // Darker orange (OrangeRed)
            depthTest: false, // Always visible, even behind objects
            depthWrite: false, // Don't write to depth buffer
            transparent: false
        });
        
        // Create a group to hold the sphere for scaling
        const originGroup = new THREE.Group();
        originGroup.name = 'PartOriginIndicatorGroup';
        
        const originPoint = new THREE.Mesh(sphereGeometry, sphereMaterial);
        originPoint.name = 'PartOriginIndicator';
        originPoint.renderOrder = 999; // Render on top
        
        originGroup.add(originPoint);
        originGroup.visible = false; // Hidden by default
        originGroup.renderOrder = 999;
        
        this.partOriginIndicator = originPoint;
        this.partOriginIndicatorGroup = originGroup;
        this.partOriginIndicatorBaseSize = baseSize;
        this.scene.add(originGroup);
    }
    
    updatePartOriginIndicator() {
        // Update origin indicator position based on selected parts
        if (!this.partOriginIndicator || !this.partOriginIndicatorGroup) return;
        
        if (!this.selectedPartUUIDs || this.selectedPartUUIDs.length === 0) {
            // No selection - hide indicator
            this.partOriginIndicatorGroup.visible = false;
            return;
        }
        
        // For multiple selection, use the first selected part's center
        // Or calculate combined bounding box center
        const firstSelectedUUID = this.selectedPartUUIDs[0];
        const part = this.partsList.find(p => p.uuid === firstSelectedUUID);
        
        if (!part || !part.object) {
            this.partOriginIndicatorGroup.visible = false;
            return;
        }
        
        // Calculate bounding box center
        const box = new THREE.Box3().setFromObject(part.object);
        const center = box.getCenter(new THREE.Vector3());
        
        // Update position
        this.partOriginIndicatorGroup.position.copy(center);
        this.partOriginIndicatorGroup.visible = true;
    }
    
    initRotationPivotIndicator() {
        // Create rotation pivot indicator (center point + box)
        // Shows where the camera rotates around
        
        // Don't re-initialize if already exists
        if (this.rotationPivotIndicatorGroup) {
            return;
        }
        
        const indicatorGroup = new THREE.Group();
        indicatorGroup.name = 'RotationPivotIndicatorGroup';
        
        // Center point (small sphere)
        const centerSize = 0.015;
        const centerGeometry = new THREE.SphereGeometry(centerSize, 16, 16);
        const centerMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF4500, // Orange-red
            depthTest: false,
            depthWrite: false,
            transparent: false
        });
        const centerPoint = new THREE.Mesh(centerGeometry, centerMaterial);
        centerPoint.renderOrder = 998;
        indicatorGroup.add(centerPoint);
        
        // Box around center (dashed line effect using line segments)
        const boxSize = 0.15;
        const boxMaterial = new THREE.LineBasicMaterial({
            color: 0xFF4500,
            linewidth: 2,
            depthTest: false,
            depthWrite: false
        });
        
        // Create dashed box using line segments
        const dashLength = 0.02;
        const gapLength = 0.015;
        const createDashedLine = (start, end) => {
            const points = [];
            const direction = new THREE.Vector3().subVectors(end, start);
            const length = direction.length();
            direction.normalize();
            
            let distance = 0;
            let isDash = true;
            
            while (distance < length) {
                const point1 = start.clone().add(direction.clone().multiplyScalar(distance));
                const segmentLength = isDash ? dashLength : gapLength;
                distance += segmentLength;
                
                if (isDash && distance <= length) {
                    const point2 = start.clone().add(direction.clone().multiplyScalar(Math.min(distance, length)));
                    points.push(point1, point2);
                }
                
                isDash = !isDash;
            }
            
            return points;
        };
        
        // Create box lines
        const halfBox = boxSize / 2;
        const corners = [
            new THREE.Vector3(-halfBox, -halfBox, -halfBox),
            new THREE.Vector3(halfBox, -halfBox, -halfBox),
            new THREE.Vector3(halfBox, halfBox, -halfBox),
            new THREE.Vector3(-halfBox, halfBox, -halfBox),
            new THREE.Vector3(-halfBox, -halfBox, halfBox),
            new THREE.Vector3(halfBox, -halfBox, halfBox),
            new THREE.Vector3(halfBox, halfBox, halfBox),
            new THREE.Vector3(-halfBox, halfBox, halfBox)
        ];
        
        const boxEdges = [
            [0, 1], [1, 2], [2, 3], [3, 0], // Bottom
            [4, 5], [5, 6], [6, 7], [7, 4], // Top
            [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical
        ];
        
        const allBoxPoints = [];
        boxEdges.forEach(([i, j]) => {
            const dashedPoints = createDashedLine(corners[i], corners[j]);
            allBoxPoints.push(...dashedPoints);
        });
        
        const boxGeometry = new THREE.BufferGeometry().setFromPoints(allBoxPoints);
        const boxLines = new THREE.LineSegments(boxGeometry, boxMaterial);
        boxLines.renderOrder = 998;
        indicatorGroup.add(boxLines);
        
        // Cross lines extending from box
        const crossLength = 0.05;
        const crossPoints = [
            // +X
            new THREE.Vector3(halfBox, 0, 0),
            new THREE.Vector3(halfBox + crossLength, 0, 0),
            // -X
            new THREE.Vector3(-halfBox, 0, 0),
            new THREE.Vector3(-halfBox - crossLength, 0, 0),
            // +Y
            new THREE.Vector3(0, halfBox, 0),
            new THREE.Vector3(0, halfBox + crossLength, 0),
            // -Y
            new THREE.Vector3(0, -halfBox, 0),
            new THREE.Vector3(0, -halfBox - crossLength, 0),
            // +Z
            new THREE.Vector3(0, 0, halfBox),
            new THREE.Vector3(0, 0, halfBox + crossLength),
            // -Z
            new THREE.Vector3(0, 0, -halfBox),
            new THREE.Vector3(0, 0, -halfBox - crossLength)
        ];
        
        const crossGeometry = new THREE.BufferGeometry().setFromPoints(crossPoints);
        const crossLines = new THREE.LineSegments(crossGeometry, boxMaterial);
        crossLines.renderOrder = 998;
        indicatorGroup.add(crossLines);
        
        // Store references
        this.rotationPivotIndicator = centerPoint;
        this.rotationPivotIndicatorGroup = indicatorGroup;
        this.rotationPivotIndicatorBaseSize = centerSize;
        this.rotationPivotBoxSize = boxSize;
        
        // Position will be set by updateRotationPivotIndicator
        // Initial position at origin, will update on first frame
        indicatorGroup.position.set(0, 0, 0);
        
        indicatorGroup.visible = false; // Hidden by default (user can unhide with button)
        indicatorGroup.renderOrder = 998;
        
        this.scene.add(indicatorGroup);
        
        // Update position immediately
        if (typeof this.updateRotationPivotIndicator === 'function') {
            this.updateRotationPivotIndicator();
        }
    }
    
    initViewportAxisIndicator() {
        const canvas = document.getElementById('control-indicator-canvas');
        if (!canvas || typeof THREE === 'undefined') {
            this.viewportIndicatorCanvas = null;
            this.viewportIndicatorCtx = null;
            return;
        }
        
        this.viewportIndicatorCanvas = canvas;
        this.viewportIndicatorCtx = canvas.getContext('2d');
        this._viewportIndicatorCenter = {
            x: canvas.width / 2,
            y: canvas.height / 2 - 6
        };
        this._viewportIndicatorLength = Math.min(canvas.width, canvas.height) * 0.32;
        this._viewportIndicatorQuat = new THREE.Quaternion();
        
        this.viewportIndicatorAxes = [
            {
                label: 'X',
                base: new THREE.Vector3(1, 0, 0),
                working: new THREE.Vector3(),
                color: '#ff4d4d',
                fill: '#ff9b9b',
                stroke: '#ff4d4d',
                text: '#b12c2c'
            },
            {
                label: 'Y',
                base: new THREE.Vector3(0, 1, 0),
                working: new THREE.Vector3(),
                color: '#4cd964',
                fill: '#bff5bf',
                stroke: '#4cd964',
                text: '#2a8a2a'
            },
            {
                label: 'Z',
                base: new THREE.Vector3(0, 0, 1),
                working: new THREE.Vector3(),
                color: '#4a90ff',
                fill: '#aed0ff',
                stroke: '#4a90ff',
                text: '#1f5fe0'
            }
        ];
        
        this.updateViewportAxisIndicator();
        
        if (!this._viewportIndicatorClickHandlerAttached) {
            canvas.addEventListener('click', (event) => this.handleViewportIndicatorClick(event));
            this._viewportIndicatorClickHandlerAttached = true;
        }
    }
    
    updateViewportAxisIndicator() {
        if (!this.viewportIndicatorCtx || !this.camera || !this.viewportIndicatorAxes) {
            return;
        }
        
        const ctx = this.viewportIndicatorCtx;
        const canvas = ctx.canvas;
        const width = canvas.width;
        const height = canvas.height;
        const center = this._viewportIndicatorCenter || { x: width / 2, y: height / 2 };
        const axisLength = this._viewportIndicatorLength || (Math.min(width, height) * 0.3);
        
        ctx.clearRect(0, 0, width, height);
        
        // Soft shadow ellipse
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.beginPath();
        ctx.ellipse(center.x, center.y + 8, axisLength * 0.55, axisLength * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        const invQuat = this._viewportIndicatorQuat || new THREE.Quaternion();
        this._viewportIndicatorQuat = invQuat;
        invQuat.copy(this.camera.quaternion).invert();
        
        this.viewportAxisEndpoints = this.viewportAxisEndpoints || new Map();
        this.viewportAxisEndpoints.clear();
        
        this.viewportIndicatorAxes.forEach(axis => {
            const dir = axis.working;
            dir.copy(axis.base).applyQuaternion(invQuat).normalize();
            
            // Positive axis
            const endX = center.x + dir.x * axisLength;
            const endY = center.y - dir.y * axisLength;
            const depthAlpha = dir.z < 0 ? 1 : 0.35; // Facing viewer vs away
            
            ctx.save();
            ctx.globalAlpha = depthAlpha;
            ctx.strokeStyle = axis.color;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.restore();
            
            ctx.save();
            ctx.globalAlpha = depthAlpha;
            ctx.fillStyle = axis.fill;
            ctx.beginPath();
            ctx.arc(endX, endY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = axis.stroke;
            ctx.stroke();
            ctx.restore();
            
            ctx.save();
            ctx.fillStyle = axis.text;
            ctx.font = 'bold 9px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(axis.label, endX, endY + 0.5);
            ctx.restore();
            
            this.viewportAxisEndpoints.set(axis.label, { x: endX, y: endY, radius: 10 });
            
            // Negative axis (opposite direction)
            const negEndX = center.x - dir.x * axisLength;
            const negEndY = center.y + dir.y * axisLength;
            const negDepthAlpha = -dir.z < 0 ? 1 : 0.35; // Facing viewer vs away (inverted)
            
            ctx.save();
            ctx.globalAlpha = negDepthAlpha;
            ctx.strokeStyle = axis.color;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(negEndX, negEndY);
            ctx.stroke();
            ctx.restore();
            
            // Negative axis balloon (empty circle, no text label, no minus sign)
            ctx.save();
            ctx.globalAlpha = negDepthAlpha;
            ctx.fillStyle = axis.fill;
            ctx.beginPath();
            ctx.arc(negEndX, negEndY, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = axis.stroke;
            ctx.stroke();
            ctx.restore();
        });
        
        // Base reference circles (X, Z, Y) - positioned above padding area
        // Box has 10px padding, so position circles higher to be above padding
        const baseY = height - 12; // Position above padding area, keeping circles and text visible
        const spacing = 28; // Increased gap between circles (was 18)
        const startX = center.x - spacing;
        const baseData = [
            { label: 'X', color: '#ff6b6b' },
            { label: 'Z', color: '#4a90ff' },
            { label: 'Y', color: '#4cd964' }
        ];
        this.viewportAxisBaseCircles = [];
        baseData.forEach((data, idx) => {
            const x = startX + idx * spacing;
            ctx.save();
            ctx.globalAlpha = 0.4;
            ctx.lineWidth = 2;
            ctx.strokeStyle = data.color;
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(x, baseY, 9, 0, Math.PI * 2); // Increased circle radius from 6 to 9
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            
            ctx.save();
            ctx.fillStyle = data.color;
            ctx.font = 'bold 12px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(data.label, x, baseY);
            ctx.restore();
            
            this.viewportAxisBaseCircles.push({ label: data.label, x, y: baseY, radius: 12 }); // Updated radius for hit testing
        });
    }
    
    handleViewportIndicatorClick(event) {
        if (!this.viewportIndicatorCanvas || !this.viewportAxisEndpoints) return;
        
        const rect = this.viewportIndicatorCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        
        const scaleX = this.viewportIndicatorCanvas.width / rect.width;
        const scaleY = this.viewportIndicatorCanvas.height / rect.height;
        const canvasX = (event.clientX - rect.left) * scaleX;
        const canvasY = (event.clientY - rect.top) * scaleY;
        
        const hitTest = (x, y, radius) => {
            const dx = canvasX - x;
            const dy = canvasY - y;
            return Math.sqrt(dx * dx + dy * dy) <= radius;
        };
        
        let targetAxis = null;
        for (const [label, info] of this.viewportAxisEndpoints.entries()) {
            if (hitTest(info.x, info.y, info.radius || 10)) {
                targetAxis = label;
                break;
            }
        }
        
        if (!targetAxis && Array.isArray(this.viewportAxisBaseCircles)) {
            for (const circle of this.viewportAxisBaseCircles) {
                if (hitTest(circle.x, circle.y, circle.radius || 8)) {
                    targetAxis = circle.label;
                    break;
                }
            }
        }
        
        if (targetAxis) {
            this.alignCameraToAxis(targetAxis);
        }
    }
    
    alignCameraToAxis(axisLabel) {
        if (!this.camera) return;
        
        const pivot = (this.controls && this.controls.target)
            ? this.controls.target.clone()
            : new THREE.Vector3(0, 0, 0);
        const distance = this.camera.position.distanceTo(pivot) || 5;
        
        let baseDir, upVector;
        switch (axisLabel.toUpperCase()) {
            case 'X':
                baseDir = new THREE.Vector3(1, 0, 0);
                upVector = new THREE.Vector3(0, 1, 0);
                break;
            case 'Y':
                baseDir = new THREE.Vector3(0, 1, 0);
                upVector = new THREE.Vector3(0, 0, 1);
                break;
            case 'Z':
                baseDir = new THREE.Vector3(0, 0, 1);
                upVector = new THREE.Vector3(0, 1, 0);
                break;
            default:
                return;
        }
        
        const currentDir = new THREE.Vector3().subVectors(this.camera.position, pivot).normalize();
        let viewDir = baseDir.clone();
        const alignment = currentDir.dot(viewDir);
        
        if (alignment > 0.9) {
            viewDir.negate();
        } else if (alignment < -0.9) {
            viewDir.copy(baseDir);
        }
        
        const newCameraPos = pivot.clone().add(viewDir.multiplyScalar(distance));
        this.camera.position.copy(newCameraPos);
        this.camera.up.copy(upVector);
        this.camera.lookAt(pivot);
        
        if (this.controls) {
            this.controls.target.copy(pivot);
            this.controls.update();
        }
        
        this._lastInteractionTime = Date.now();
        if (typeof this.updateRotationPivotIndicator === 'function') {
            this.updateRotationPivotIndicator();
        }
    }
    
    _getVisibleGeometryCenter() {
        // Calculate center of all visible geometry (meshes)
        // This is what the model should rotate around
        if (!this.loadedModels || this.loadedModels.length === 0) {
            return null;
        }
        
        const box = new THREE.Box3();
        let hasVisible = false;
        
        this.loadedModels.forEach(modelData => {
            if (!modelData || !modelData.model) return;
            
            modelData.model.traverse(child => {
                if (child.isMesh && child.visible) {
                    const childBox = new THREE.Box3().setFromObject(child);
                    if (!childBox.isEmpty()) {
                        if (!hasVisible) {
                            box.copy(childBox);
                            hasVisible = true;
                        } else {
                            box.union(childBox);
                        }
                    }
                }
            });
        });
        
        if (!hasVisible) {
            return null;
        }
        
        return box.getCenter(new THREE.Vector3());
    }
    
    _getSelectionCenter() {
        // Get center of selected parts (for selection-based rotation mode)
        // Use selectedPartUUIDs array for accurate selection tracking
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
    }
    
    _getScreenCenter3D() {
        // Calculate the 3D position of the center of the current screen viewport
        // This is where the center of the screen (0,0 in NDC) projects into 3D space
        // Always shows the center of what's currently visible on screen
        if (!this.camera || !this.controls) {
            return null;
        }
        
        // Always calculate viewport center (screen center), not geometry center
        if (!this.controls.target) {
            return new THREE.Vector3(0, 0, 0);
        }
        
        // Screen center in NDC (Normalized Device Coordinates) - center of viewport
        const screenCenterNDC = new THREE.Vector2(0, 0);
        
        // Create raycaster from camera through screen center
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(screenCenterNDC, this.camera);
        
        // Calculate distance from camera to controls.target
        const targetDistance = this.camera.position.distanceTo(this.controls.target);
        
        // Get camera forward direction (view direction)
        const cameraForward = new THREE.Vector3();
        cameraForward.subVectors(this.controls.target, this.camera.position).normalize();
        
        // If camera forward is invalid, use camera's default forward
        if (cameraForward.length() < 0.001) {
            cameraForward.set(0, 0, -1);
            this.camera.getWorldDirection(cameraForward);
        }
        
        // Create plane perpendicular to camera direction at target distance
        const plane = new THREE.Plane();
        const planePoint = this.camera.position.clone().add(cameraForward.clone().multiplyScalar(targetDistance));
        plane.setFromNormalAndCoplanarPoint(cameraForward, planePoint);
        
        // Find intersection point (screen center in 3D space)
        const screenCenter3D = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, screenCenter3D)) {
            return screenCenter3D;
        }
        
        // Final fallback: use controls.target
        return this.controls.target.clone();
    }
    
    updateRotationPivotIndicator() {
        // Update rotation pivot indicator based on current rotation mode
        // Aligned with current screen view (not world coordinates)
        if (!this.rotationPivotIndicatorGroup || !this.camera) return;
        
        // Only update if indicator is visible
        if (!this.rotationPivotIndicatorGroup.visible) return;
        
        const mode = this.rotationPivotMode || 'screen';
        
        // For cursor and world modes, pivot is fixed - don't update during pan/zoom
        // Only update during rotation or when explicitly requested
        if ((mode === 'cursor' || mode === 'world') && 
            !this._isRotating && 
            (this._isPanning || this._isZooming)) {
            // Don't update fixed pivots during pan/zoom
            return;
        }
        
        // Get pivot point based on mode and rotation state
        let pivotPoint;
        
        if (this._isRotating && this._lockedRotationPivot) {
            // During rotation: use locked pivot (doesn't change)
            pivotPoint = this._lockedRotationPivot;
        } else {
            // Not rotating: get pivot based on current mode
            switch (mode) {
                case 'screen':
                    // Screen center (viewport center in 3D) - updates with view
                    pivotPoint = this._getScreenCenter3D();
                    break;
                
                case 'world':
                    // World origin - fixed at (0, 0, 0)
                    pivotPoint = new THREE.Vector3(0, 0, 0);
                    break;
                
                case 'cursor':
                    // 3D cursor position - fixed at placed position
                    if (this.cursor3DPosition) {
                        pivotPoint = this.cursor3DPosition.clone();
                    } else {
                        // Fallback to screen center
                        pivotPoint = this._getScreenCenter3D();
                    }
                    break;
                
                case 'selection':
                    // Selected parts bounding box center - updates with selection
                    pivotPoint = this._getSelectionCenter();
                    break;
                
                default:
                    pivotPoint = this._getScreenCenter3D();
            }
        }
        
        if (pivotPoint) {
            // Position indicator at pivot point
            this.rotationPivotIndicatorGroup.position.copy(pivotPoint);
            
            // IMPORTANT: Keep controls.target at pivot point during rotation
            // This makes the model rotate around the viewport center (screen center)
            if (this._isRotating && this.controls && this.controls.target) {
                // Lock controls target to locked pivot during rotation
                // This ensures rotation always happens around the viewport center
                this.controls.target.copy(pivotPoint);
            }
        } else if (this.controls && this.controls.target) {
            // Fallback to controls target
            const target = this.controls.target;
            if (target && target.isVector3) {
                this.rotationPivotIndicatorGroup.position.set(target.x, target.y, target.z);
            }
        }
        
        // Make the box align with screen X/Y (face camera)
        // Skip expensive matrix calculations during active rotation for better performance
        if (!this._isRotating) {
            // Get camera's right and up vectors (screen space directions)
            const cameraRight = new THREE.Vector3();
            const cameraUp = new THREE.Vector3();
            cameraRight.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
            cameraUp.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
            
            // Create rotation matrix that aligns box with screen space
            // Box X aligns with screen X (camera right)
            // Box Y aligns with screen Y (camera up)
            const rotationMatrix = new THREE.Matrix4();
            rotationMatrix.makeBasis(cameraRight, cameraUp, new THREE.Vector3().crossVectors(cameraRight, cameraUp));
            
            const quaternion = new THREE.Quaternion();
            quaternion.setFromRotationMatrix(rotationMatrix);
            this.rotationPivotIndicatorGroup.quaternion.copy(quaternion);
        }
        // During rotation, keep the last quaternion (indicator stays aligned)
    }
    
    setupCursorClickHandler() {
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('click', (e) => {
            // Only work if cursor tool is enabled
            if (!this.cursor3DEnabled) {
                return;
            }
            
            // Skip if outside canvas area
            if (!this.isPointInCanvasArea(e.clientX, e.clientY)) {
                return;
            }
            
            // Get mouse position
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
            
            // Raycast to find intersection with model
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouse, this.camera);
            
            if (this.loadedModels && this.loadedModels.length > 0) {
                let allIntersects = [];
                this.loadedModels.forEach(modelData => {
                    const intersects = raycaster.intersectObject(modelData.model, true);
                    allIntersects = allIntersects.concat(intersects);
                });
                
                allIntersects.sort((a, b) => a.distance - b.distance);
                
                // Filter only visible objects
                const visibleIntersects = allIntersects.filter(intersect => {
                    let obj = intersect.object;
                    while (obj) {
                        if (!obj.visible) return false;
                        obj = obj.parent;
                    }
                    return true;
                });
                
                if (visibleIntersects.length > 0) {
                    // Place cursor at intersection point
                    const point = visibleIntersects[0].point;
                    this.cursor3DPosition.copy(point);
                    this.cursor3DGroup.position.copy(point);
                    
                    console.log('3D Cursor placed at:', point.x.toFixed(3), point.y.toFixed(3), point.z.toFixed(3));
                }
            }
        }, false); // Use bubble phase - don't capture to avoid conflicts
    }
    
    onWindowResize() {
        const container = document.getElementById('container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // Calculate canvas area excluding sidebar
        const canvasWidth = width - this.sidebarWidth;
        const canvasHeight = height;
        
        // Update camera aspect ratio for visible canvas area
        const aspect = canvasWidth / canvasHeight;
        this._updateActiveCameraProjection(aspect);
        
        if (this.cameraMode === 'orthographic' && this.orthographicCamera) {
            const frustumHeight = this._orthoFrustumHeight || 10;
            const halfH = frustumHeight / 2;
            const halfW = halfH * (canvasWidth / Math.max(canvasHeight, 1));
            this.orthographicCamera.left = -halfW;
            this.orthographicCamera.right = halfW;
            this.orthographicCamera.top = halfH;
            this.orthographicCamera.bottom = -halfH;
            this.orthographicCamera.updateProjectionMatrix();
        }
        
        // Set renderer size to full container
        this.renderer.setSize(width, height);
        // Set viewport to exclude sidebar area
        this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // Update controls (this is lightweight)
        if (this.controls) {
            this.controls.update();
        }
        
        // Check if any interaction stopped (no interaction for 150ms)
        const timeSinceLastInteraction = Date.now() - this._lastInteractionTime;
        if ((this._isRotating || this._isPanning || this._isZooming) && timeSinceLastInteraction > 150) {
            // Mark all interactions as stopped
            this._isRotating = false;
            this._isPanning = false;
            this._isZooming = false;
            // Update indicator to current screen center when interaction stops
            if (typeof this.updateRotationPivotIndicator === 'function') {
                this.updateRotationPivotIndicator();
            }
        }
        
        // Update rotation pivot indicator smoothly during any interaction (rotate, pan, zoom)
        // This makes it move/rotate smoothly while interacting
        if (this.rotationPivotIndicatorGroup && this.rotationPivotIndicatorGroup.visible) {
            if ((this._isRotating || this._isPanning || this._isZooming) && 
                typeof this.updateRotationPivotIndicator === 'function') {
                this.updateRotationPivotIndicator();
            }
        }
        
        // Update 3D cursor scale to maintain fixed screen size
        if (this.cursor3DGroup && this.camera && this.cursor3DPosition) {
            const distance = this.camera.position.distanceTo(this.cursor3DPosition);
            const baseCursorSize = 0.28; // Base cursor size in world units (lineLength 0.2 + circleRadius 0.08)
            const desiredPixelSize = 25; // Desired size in pixels
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseCursorSize;
                this.cursor3DGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseCursorSize;
                this.cursor3DGroup.scale.set(scale, scale, scale);
            }
            
            // Make circle always face camera (billboard effect)
            // Only the circle rotates, axis lines stay in world space
            if (this.cursor3DCircle) {
                // Get direction from cursor to camera
                const direction = new THREE.Vector3();
                direction.subVectors(this.camera.position, this.cursor3DPosition).normalize();
                // Create rotation to face camera (billboard effect)
                const quaternion = new THREE.Quaternion();
                quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
                this.cursor3DCircle.quaternion.copy(quaternion);
            }
        }
        
        // Update part origin indicator scale to maintain fixed screen size
        if (this.partOriginIndicatorGroup && this.partOriginIndicatorGroup.visible && this.camera) {
            const distance = this.camera.position.distanceTo(this.partOriginIndicatorGroup.position);
            const baseSize = this.partOriginIndicatorBaseSize || 0.01;
            const desiredPixelSize = 4; // Very small pixel size - like a point
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.partOriginIndicatorGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.partOriginIndicatorGroup.scale.set(scale, scale, scale);
            }
        }
        
        // Update rotation pivot indicator scale to maintain fixed screen size
        if (this.rotationPivotIndicatorGroup && this.rotationPivotIndicatorGroup.visible && this.camera) {
            const distance = this.camera.position.distanceTo(this.rotationPivotIndicatorGroup.position);
            const baseSize = this.rotationPivotBoxSize || 0.15;
            const desiredPixelSize = 80; // Moderate size in pixels
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.rotationPivotIndicatorGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.rotationPivotIndicatorGroup.scale.set(scale, scale, scale);
            }
        }
        
        // Update viewport axis indicator (HUD)
        if (typeof this.updateViewportAxisIndicator === 'function') {
            this.updateViewportAxisIndicator();
        }
        
        // Update transform gizmo scale to maintain fixed screen size (like 3D cursor)
        if (this.transformGizmoGroup && this.camera) {
            const distance = this.camera.position.distanceTo(this.transformGizmoGroup.position);
            const baseSize = 1.0; // Base arrow length
            const desiredPixelSize = 100; // Desired size in pixels
            
            if (this.camera.isPerspectiveCamera) {
                const fov = this.camera.fov * (Math.PI / 180);
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = 2 * Math.tan(fov / 2) * distance;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.transformGizmoGroup.scale.set(scale, scale, scale);
            } else {
                // Orthographic camera: zoom makes frustum smaller, so divide by zoom
                const viewportHeight = this.renderer.domElement.clientHeight || 1;
                const worldHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
                const pixelToWorld = worldHeight / viewportHeight;
                const desiredWorldSize = desiredPixelSize * pixelToWorld;
                const scale = desiredWorldSize / baseSize;
                this.transformGizmoGroup.scale.set(scale, scale, scale);
            }
        }
        
        // Update lighting to follow camera view direction
        // This makes lighting always come from the screen/view direction
        if (this.directionalLight && this.camera && this.controls) {
            // Calculate direction from camera to target (view direction)
            const viewDirection = new THREE.Vector3();
            viewDirection.subVectors(this.controls.target, this.camera.position).normalize();
            
            // Position directional light behind camera (opposite to view direction)
            // So light shines from screen (camera side) towards the model
            const lightDistance = this.camera.position.distanceTo(this.controls.target);
            const lightPosition = this.camera.position.clone().add(
                viewDirection.clone().multiplyScalar(-lightDistance * 2)
            );
            
            // Set light position - this makes the light shine from camera direction
            // The light will always illuminate the front of whatever we're viewing
            this.directionalLight.position.copy(lightPosition);
            
            // Update light matrix to apply changes
            this.directionalLight.updateMatrixWorld();
        }
        
        // Update animations if present (for all models)
        this.mixers.forEach(mixer => {
            if (mixer) {
                mixer.update(delta);
            }
        });
        
        // Render scene - cursor will render on top due to depthTest: false and renderOrder
        this.renderer.render(this.scene, this.camera);
        
        // Note: The violation warning is usually harmless - it just means 
        // the first frame took longer than 16ms. Subsequent frames should be faster.
        // This is common with complex 3D models during initial load.
    }
    
    loadGLTF(filePath, fileName = null, addMode = false) {
        this.showLoading();
        this.hideError();
        
        // Check if GLTFLoader is available
        if (typeof THREE.GLTFLoader === 'undefined') {
            this.showError('GLTFLoader is not available. Please ensure GLTFLoader.js is in the viewer directory.');
            this.hideLoading();
            if (window.pywebview && window.pywebview.api) {
                window.pywebview.api.onModelError('GLTFLoader not found');
            }
            return;
        }
        
        // Extract file name from path if not provided
        if (!fileName) {
            // Handle both forward and backslash paths
            const pathParts = filePath.split(/[/\\]/);
            fileName = pathParts[pathParts.length - 1];
            // Remove query parameters if present
            if (fileName.includes('?')) {
                fileName = fileName.split('?')[0];
            }
        }
        
        // Extract display name (without extension)
        const displayName = fileName.replace(/\.(gltf|glb)$/i, '');
        
        // If not in add mode, clear existing models
        if (!addMode) {
            // Clear material manager data first (before clearing models)
            if (this.materialManager && typeof this.materialManager.clear === 'function') {
                this.materialManager.clear();
            }
            
            if (typeof this.clear === 'function') {
                this.clear();
            } else {
                this._clearLoadedModelsFallback();
            }
        }
        
        // Handle special characters in file path - ensure proper URL encoding
        let safeFilePath = filePath;
        try {
            // If path contains special characters, properly encode them
            // But preserve the protocol and domain
            if (safeFilePath.includes('://')) {
                const url = new URL(safeFilePath);
                // Encode the pathname properly
                url.pathname = url.pathname.split('/').map(segment => {
                    // Decode first, then re-encode to handle special characters properly
                    try {
                        return encodeURIComponent(decodeURIComponent(segment));
                    } catch (e) {
                        // If decoding fails, just encode as-is
                        return encodeURIComponent(segment);
                    }
                }).join('/');
                safeFilePath = url.toString();
            } else {
                // Relative path - encode each segment
                safeFilePath = safeFilePath.split('/').map(segment => {
                    try {
                        return encodeURIComponent(decodeURIComponent(segment));
                    } catch (e) {
                        return encodeURIComponent(segment);
                    }
                }).join('/');
            }
        } catch (e) {
            console.warn('Error encoding file path, using original:', e);
            // Use original path if encoding fails
        }
        
        // Setup loaders
        const loader = new THREE.GLTFLoader();
        
        // Note: LoadingManager timeout is handled automatically
        // For large files, the browser will handle timeouts based on network settings
        
        // Helper to start the actual GLTF load (called after Draco configuration)
        const startLoad = () => {
            // Load model with enhanced error handling
            loader.load(
                safeFilePath,
                (gltf) => {
                    const model = gltf.scene;
                    
                    // Extract materials from loaded GLTF
                    if (this.materialManager && typeof this.materialManager.refreshMaterials === 'function') {
                        setTimeout(() => {
                            this.materialManager.refreshMaterials();
                        }, 500);
                    }
                    const modelUuid = THREE.MathUtils.generateUUID();
                    
                    // Setup animations
                    let mixer = null;
                    if (gltf.animations && gltf.animations.length > 0) {
                        mixer = new THREE.AnimationMixer(model);
                        gltf.animations.forEach((clip) => {
                            mixer.clipAction(clip).play();
                        });
                        this.mixers.push(mixer);
                    }
                    
                    // Calculate bounding box (keep model at original coordinates - don't center)
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    
                    // DO NOT center model - keep original coordinates
                    // Model stays at its original position in world space
                    
                    // IMPORTANT: Temporarily hide model to prevent visual jump when camera position changes
                    // Set model visibility to false before positioning camera
                    model.visible = false;
                    
                    // Set camera position BEFORE adding model to scene to avoid visual "jump"
                    // This prevents the model from appearing at the old camera position first
                    // Fit camera to all loaded models
                    if (this.loadedModels.length === 0 || !addMode) {
                        // First model or replacing - check if preview is active
                        if (this.previewActive && typeof resetToPreviewBox === 'function') {
                            // Fit to preview box with isometric angle
                            const container = document.getElementById('container');
                            const canvasWidth = container.clientWidth - this.sidebarWidth;
                            const canvasHeight = container.clientHeight;
                            resetToPreviewBox(canvasWidth, canvasHeight);
                        } else {
                            // Default fit to screen with isometric top view
                            // Use actual model center (not world origin)
                            const size = box.getSize(new THREE.Vector3());
                            const maxDim = Math.max(size.x, size.y, size.z);
                            const distance = maxDim * 2.8; // Increased from 2 to 2.8 for better fit
                            // Set camera to isometric top view position: Z, -X, Y (looking down from top-back-left)
                            // Position camera relative to model center
                            this.camera.position.set(
                                center.x - distance, 
                                center.y + distance, 
                                center.z + distance
                            );
                            this.camera.lookAt(center);
                            
                            if (this.controls) {
                                // Set target to model center (not world origin)
                                this.controls.target.copy(center);
                                this.controls.update();
                            }
                        }
                    }
                    
                    // Add model to loaded models array
                    const modelData = {
                        model: model,
                        fileName: fileName,
                        name: displayName,
                        uuid: modelUuid
                    };
                    this.loadedModels.push(modelData);
                    this.scene.add(model);
                    
                    // Make model visible again after camera is positioned
                    // Use requestAnimationFrame to ensure camera position is applied before showing model
                    requestAnimationFrame(() => {
                        model.visible = true;
                    });
                    
                    // Apply random colours if feature is enabled
                    if (this.randomColorsEnabled && typeof this._applyRandomColorsToObject === 'function') {
                        this._applyRandomColorsToObject(model, { skipExisting: true });
                    }
                    
                    // Fit camera to all models - account for sidebar in aspect ratio
                    const container = document.getElementById('container');
                    const canvasWidth = container.clientWidth - this.sidebarWidth;
                    const canvasHeight = container.clientHeight;
                    const aspect = canvasWidth / canvasHeight;
                    
                    // Update camera aspect for visible area
                    this.camera.aspect = aspect;
                    this.camera.updateProjectionMatrix();
                    
                    // Update renderer viewport to exclude sidebar
                    this.renderer.setViewport(0, 0, canvasWidth, canvasHeight);
                    
                    // If adding model (not first model), fit to all models AFTER adding
                    if (this.loadedModels.length > 1 && addMode) {
                        // Adding model - fit to all models
                        if (typeof this.fitScreen === 'function') {
                            this.fitScreen();
                        }
                    }
                    
                    // Build parts tree in sidebar (called from viewer-tree.js)
                    if (typeof this.buildPartsTree === 'function') {
                        this.buildPartsTree();
                    }
                    
                    // Calculate boundary box center (always, for rotation)
                    if (typeof this.calculateBoundaryBoxCenter === 'function') {
                        this.calculateBoundaryBoxCenter();
                    }

                    if (this.sectionManager && typeof this.sectionManager.onSceneBoundsChanged === 'function') {
                        this.sectionManager.onSceneBoundsChanged();
                    }
                    
                    // Update boundary box if it's currently visible
                    if (this.boundaryBoxVisible && typeof this.updateBoundaryBox === 'function') {
                        this.updateBoundaryBox();
                    }
                    
                    // Collect statistics
                    const stats = this.collectStats(model);
                    
                    // Notify Python about successful load
                    if (window.pywebview) {
                        window.pywebview.api.onModelLoaded({
                            vertices: stats.vertices,
                            faces: stats.faces,
                            materials: stats.materials,
                            textures: stats.textures,
                            animations: gltf.animations ? gltf.animations.length : 0,
                            isDraco: this.checkIfDraco(gltf)
                        });
                    }
                    
                    this.hideLoading();
                },
                (progress) => {
                    // Handle progress for large files
                    if (progress.total > 0) {
                        const percent = (progress.loaded / progress.total * 100).toFixed(1);
                        const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(2);
                        const totalMB = (progress.total / (1024 * 1024)).toFixed(2);
                        this.showLoading(`Loading... ${percent}% (${loadedMB}MB / ${totalMB}MB)`);
                    } else {
                        // Unknown total size - show loaded amount
                        const loadedMB = (progress.loaded / (1024 * 1024)).toFixed(2);
                        this.showLoading(`Loading... ${loadedMB}MB loaded...`);
                    }
                },
                (error) => {
                    console.error('Error loading GLTF:', error);
                    
                    // Enhanced error handling for common issues
                    let errorMessage = error.message || 'Unknown error';
                    let userFriendlyMessage = errorMessage;
                    
                    // Handle specific error types
                    if (errorMessage.includes('Unexpected end of JSON input') || 
                        errorMessage.includes('JSON')) {
                        // JSON parse error - could be truncated file, special characters, or large file issue
                        userFriendlyMessage = 'File loading error. This might be due to:\n' +
                            '1. Large file size (try waiting longer)\n' +
                            '2. Special characters in filename\n' +
                            '3. Corrupted or incomplete file\n\n' +
                            'Error: ' + errorMessage;
                        
                        // Try to provide more helpful message
                        console.warn('JSON parse error - possible causes:', {
                            filePath: safeFilePath,
                            error: errorMessage,
                            suggestion: 'File might be too large or contain special characters'
                        });
                    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
                        userFriendlyMessage = 'File loading timeout. The file is too large or network is slow.\n' +
                            'Please try again or use a smaller file.';
                    } else if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
                        userFriendlyMessage = 'File not found. Please check the file path.\n' +
                            'Special characters in filename might need encoding.';
                    } else if (errorMessage.includes('CORS') || errorMessage.includes('cross-origin')) {
                        userFriendlyMessage = 'Cross-origin error. File cannot be loaded from this location.';
                    } else if (errorMessage.includes('Aborted') || errorMessage.includes('aborted')) {
                        // Draco decoder memory error - very large single-part mesh
                        userFriendlyMessage = 'DRACO DECOMPRESSION ERROR:\n\n' +
                            'The file contains a very large compressed mesh that exceeds browser memory limits.\n\n' +
                            'SOLUTIONS:\n' +
                            '1. Re-export the GLTF WITHOUT Draco compression\n' +
                            '2. Split the large single mesh into smaller parts (recommended)\n' +
                            '3. Export as multiple files with smaller assemblies\n' +
                            '4. Use GLB format without compression\n\n' +
                            'Note: Files under 100MB or with multiple smaller parts load fine.\n' +
                            'The issue is specifically with ONE very large compressed mesh.';
                    }
                    
                    this.showError(userFriendlyMessage);
                    this.hideLoading();
                    
                    if (window.pywebview) {
                        window.pywebview.api.onModelError(errorMessage);
                    }
                }
            );
        };
        
        // Setup Draco loader if available
        if (typeof THREE.DRACOLoader !== 'undefined') {
            const dracoLoader = new THREE.DRACOLoader();
            // Set decoder path to viewer directory (same directory as index.html)
            dracoLoader.setDecoderPath(window.location.origin + '/');
            // Limit to a single worker to reduce peak memory usage on very large meshes
            if (typeof dracoLoader.setWorkerLimit === 'function') {
                dracoLoader.setWorkerLimit(1);
            }
            
            // Configure with increased memory for large meshes
            // Try to use WASM decoder with maximum memory allocation
            const wasmWrapperUrl = window.location.origin + '/draco_wasm_wrapper.js';
            try {
                fetch(wasmWrapperUrl, { method: 'HEAD', cache: 'no-store' })
                    .then(res => {
                        if (res && res.ok) {
                            // Use WASM decoder - simplified config without custom memory settings
                            // The wasmMemory config was causing byteLength errors
                            dracoLoader.setDecoderConfig({ type: 'wasm' });
                            console.log('Using WASM Draco decoder');
                        } else {
                            // Fallback to JS decoder
                            dracoLoader.setDecoderConfig({ type: 'js' });
                            console.log('Using JS Draco decoder (WASM wrapper not found)');
                        }
                    })
                    .catch(() => {
                        dracoLoader.setDecoderConfig({ type: 'js' });
                        console.log('Using JS Draco decoder (fallback)');
                    })
                    .finally(() => {
                        // Preload the decoder before loading the model
                        try {
                            dracoLoader.preload();
                            console.log('Draco decoder preloaded');
                        } catch (e) {
                            console.warn('Could not preload Draco decoder:', e);
                        }
                        loader.setDRACOLoader(dracoLoader);
                        startLoad();
                    });
            } catch (e) {
                dracoLoader.setDecoderConfig({ type: 'js' });
                loader.setDRACOLoader(dracoLoader);
                console.log('Using JS Draco decoder (exception fallback)');
                startLoad();
            }
        } else {
            // No Draco loader – start immediately
            startLoad();
        }
    }
    
    _clearLoadedModelsFallback() {
        // Minimal clear routine used before viewer-view.js registers the full clear()
        
        // Clear material manager data first
        if (this.materialManager && typeof this.materialManager.clear === 'function') {
            this.materialManager.clear();
        }
        
        if (this.boundaryBoxHelper) {
            this.scene.remove(this.boundaryBoxHelper);
            if (this.boundaryBoxHelper.geometry) this.boundaryBoxHelper.geometry.dispose();
            if (this.boundaryBoxHelper.material) this.boundaryBoxHelper.material.dispose();
            this.boundaryBoxHelper = null;
        }
        this.boundaryBoxVisible = false;
        this.boundaryBoxCenter = null;
        
        if (this.loadedModels && this.loadedModels.length > 0) {
            this.loadedModels.forEach(modelData => {
                if (modelData && modelData.model && this.scene) {
                    this.scene.remove(modelData.model);
                }
            });
        }
        this.loadedModels = [];
        
        if (this.mixers && this.mixers.length > 0) {
            this.mixers.forEach(mixer => {
                if (mixer && typeof mixer.stopAllAction === 'function') {
                    mixer.stopAllAction();
                }
            });
        }
        this.mixers = [];
        this.animations = [];
        
        if (this.originalMaterials && typeof this.originalMaterials.clear === 'function') {
            this.originalMaterials.clear();
        }
        this.selectedPartUUIDs = [];
        this.partsList = [];
        
        const treeContainer = document.getElementById('tree-container');
        if (treeContainer) {
            treeContainer.innerHTML = '<div id="tree-placeholder" style="padding: 20px; color: #999; text-align: center;">No model loaded. Open a GLTF/GLB file to see parts.</div>';
        }
        
        const searchContainer = document.getElementById('tree-search');
        if (searchContainer) {
            searchContainer.style.display = 'none';
        }
        const searchInput = document.getElementById('tree-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
    }
    
    _updateActiveCameraProjection(aspect) {
        if (!this.camera || !aspect || !isFinite(aspect)) {
            return;
        }
        
        if (this.camera.isPerspectiveCamera) {
            this.camera.aspect = aspect;
            this.camera.updateProjectionMatrix();
        } else if (this.camera.isOrthographicCamera) {
            const frustumHeight = this._orthoFrustumHeight || 10;
            const halfH = frustumHeight / 2;
            const halfW = halfH * aspect;
            this.camera.left = -halfW;
            this.camera.right = halfW;
            this.camera.top = halfH;
            this.camera.bottom = -halfH;
            this.camera.updateProjectionMatrix();
        }
    }
    
    _createOrthographicCamera(aspect) {
        const perspective = this.perspectiveCamera || this.camera || new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        const target = this.controls && this.controls.target
            ? this.controls.target.clone()
            : new THREE.Vector3(0, 0, 0);
        const distance = perspective.position.distanceTo(target) || 5;
        const frustumHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2));
        const halfH = frustumHeight / 2;
        const halfW = halfH * aspect;
        const ortho = new THREE.OrthographicCamera(
            -halfW, halfW, halfH, -halfH, perspective.near, perspective.far * 4
        );
        ortho.position.copy(perspective.position);
        ortho.quaternion.copy(perspective.quaternion);
        ortho.up.copy(perspective.up);
        this._orthoFrustumHeight = frustumHeight;
        this._orthoFrustumDistance = distance;
        return ortho;
    }
    
    _updatePerspectiveButtonState() {
        const btn = document.getElementById('perspective-btn');
        if (btn) {
            const isPerspective = this.cameraMode !== 'orthographic';
            btn.classList.toggle('active', isPerspective);
            btn.setAttribute('aria-pressed', isPerspective ? 'true' : 'false');
            btn.setAttribute('data-tooltip', isPerspective ? 'Perspective Projection' : 'Orthographic Projection');
        }
    }
    
    togglePerspectiveMode() {
        const container = document.getElementById('container');
        if (!container) return;
        const canvasWidth = container.clientWidth - this.sidebarWidth;
        const canvasHeight = container.clientHeight;
        const aspect = canvasWidth / Math.max(canvasHeight, 1);
        
        if (this.cameraMode === 'perspective') {
            if (!this.orthographicCamera) {
                this.orthographicCamera = this._createOrthographicCamera(aspect);
            }
            this.orthographicCamera.position.copy(this.camera.position);
            this.orthographicCamera.quaternion.copy(this.camera.quaternion);
            this.orthographicCamera.up.copy(this.camera.up);
            this.orthographicCamera.zoom = 1;
            this.orthographicCamera.updateProjectionMatrix();
            this.camera = this.orthographicCamera;
            this.cameraMode = 'orthographic';
            const target = this.controls && this.controls.target ? this.controls.target : new THREE.Vector3(0, 0, 0);
            this._orthoFrustumDistance = this.camera.position.distanceTo(target);
            if (!this._orthoFrustumHeight) {
                this._orthoFrustumHeight = 2 * (this._orthoFrustumDistance || 5) * Math.tan(THREE.MathUtils.degToRad(this.perspectiveCamera ? this.perspectiveCamera.fov / 2 : 45));
            }
            this._updateActiveCameraProjection(aspect);
        } else {
            if (!this.perspectiveCamera) {
                const persp = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
                this.perspectiveCamera = persp;
            }
            this.perspectiveCamera.position.copy(this.camera.position);
            this.perspectiveCamera.quaternion.copy(this.camera.quaternion);
            this.perspectiveCamera.up.copy(this.camera.up);
            this.camera = this.perspectiveCamera;
            this.cameraMode = 'perspective';
            this._updateActiveCameraProjection(aspect);
        }
        
        if (this.controls) {
            this.controls.object = this.camera;
            this.controls.update();
        }
        
        this.onWindowResize();
        this._updatePerspectiveButtonState();
        
        if (typeof this.updateRotationPivotIndicator === 'function') {
            this.updateRotationPivotIndicator();
        }
    }
    
    checkIfDraco(gltf) {
        // Check if model uses Draco compression
        let isDraco = false;
        gltf.scene.traverse((object) => {
            if (object.isMesh && object.geometry) {
                const attributes = object.geometry.attributes;
                if (attributes.position && attributes.position.isInterleavedBufferAttribute) {
                    isDraco = true;
                }
            }
        });
        return isDraco;
    }
    
    collectStats(object) {
        let vertices = 0;
        let faces = 0;
        let materials = new Set();
        let textures = new Set();
        
        object.traverse((child) => {
            if (child.isMesh) {
                if (child.geometry) {
                    const pos = child.geometry.attributes.position;
                    if (pos) {
                        vertices += pos.count;
                        faces += pos.count / 3;
                    }
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => materials.add(mat));
                    } else {
                        materials.add(child.material);
                    }
                    
                    // Check for textures
                    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
                    if (mat.map) textures.add(mat.map);
                    if (mat.normalMap) textures.add(mat.normalMap);
                    if (mat.roughnessMap) textures.add(mat.roughnessMap);
                    if (mat.metalnessMap) textures.add(mat.metalnessMap);
                }
            }
        });
        
        return {
            vertices: Math.floor(vertices),
            faces: Math.floor(faces),
            materials: materials.size,
            textures: textures.size
        };
    }
    
    setupPreview() {
        // Create preview overlay elements if they don't exist
        let previewOverlay = document.getElementById('preview-overlay');
        if (!previewOverlay) {
            previewOverlay = document.createElement('div');
            previewOverlay.id = 'preview-overlay';
            const dimmer = document.createElement('div');
            dimmer.id = 'preview-dimmer';
            const previewBox = document.createElement('div');
            previewBox.id = 'preview-box';
            previewOverlay.appendChild(dimmer);
            previewOverlay.appendChild(previewBox);
            document.getElementById('container').appendChild(previewOverlay);
        }
        
        this.previewOverlay = previewOverlay;
        this.previewBox = document.getElementById('preview-box');
        
        // Update preview box position and size on window resize
        window.addEventListener('resize', () => {
            if (this.previewActive) {
                this.updatePreviewBox();
            }
        });
    }
    
    updatePreviewBox() {
        if (!this.previewBox || !this.previewActive) return;
        
        const container = document.getElementById('container');
        const canvasWidth = container.clientWidth - this.sidebarWidth;
        const canvasHeight = container.clientHeight;
        
        // Calculate 4:3 aspect ratio box
        const aspectRatio = 4 / 3;
        let boxWidth, boxHeight;
        
        // Fit box within canvas (excluding sidebar)
        if (canvasWidth / canvasHeight > aspectRatio) {
            // Canvas is wider, height is limiting
            boxHeight = canvasHeight * 0.8; // 80% of canvas height
            boxWidth = boxHeight * aspectRatio;
        } else {
            // Canvas is taller, width is limiting
            boxWidth = canvasWidth * 0.8; // 80% of canvas width
            boxHeight = boxWidth / aspectRatio;
        }
        
        // Center the box
        const left = (canvasWidth - boxWidth) / 2;
        const top = (canvasHeight - boxHeight) / 2;
        
        this.previewBox.style.left = left + 'px';
        this.previewBox.style.top = top + 'px';
        this.previewBox.style.width = boxWidth + 'px';
        this.previewBox.style.height = boxHeight + 'px';
        
        // No dimming effect - just clear the dimmer
        const dimmer = document.getElementById('preview-dimmer');
        if (dimmer) {
            dimmer.innerHTML = '';
        }
    }
    
    togglePreview() {
        this.previewActive = !this.previewActive;
        const btn = document.getElementById('preview-btn');
        
        if (this.previewActive) {
            // Show preview overlay
            if (this.previewOverlay) {
                this.previewOverlay.classList.add('active');
            }
            this.updatePreviewBox();
            
            if (btn) {
                btn.classList.add('active');
            }
        } else {
            // Hide preview overlay
            if (this.previewOverlay) {
                this.previewOverlay.classList.remove('active');
            }
            
            if (btn) {
                btn.classList.remove('active');
            }
        }
    }
    
    // Old capturePreviewImage method removed - now using image-capture.js module
    capturePreviewImage() {
        // Delegate to new ImageCapture module
        if (this.imageCapture && typeof this.imageCapture.capturePreviewImage === 'function') {
            return this.imageCapture.capturePreviewImage();
        }
        return null;
    }
    
    showLoading(message = 'Loading...') {
        const loading = document.getElementById('loading');
        loading.textContent = message;
        loading.classList.add('show');
    }
    
    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.remove('show');
        }
    }
    
    showError(message) {
        const error = document.getElementById('error');
        if (error) {
            error.textContent = message;
            error.classList.add('show');
            console.error('Viewer error:', message);
        }
    }
    
    hideError() {
        const error = document.getElementById('error');
        if (error) {
            error.classList.remove('show');
        }
    }
    
    setupManualControls() {
        // Simple manual controls if OrbitControls is not available
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        
        this.renderer.domElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            // Rotate camera around origin
            const spherical = new THREE.Spherical();
            spherical.setFromVector3(this.camera.position);
            spherical.theta -= deltaX * 0.01;
            spherical.phi += deltaY * 0.01;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            
            this.camera.position.setFromSpherical(spherical);
            this.camera.lookAt(0, 0, 0);
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        this.renderer.domElement.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const distance = this.camera.position.length();
            const newDistance = distance * (1 + e.deltaY * 0.001);
            this.camera.position.normalize().multiplyScalar(Math.max(0.5, Math.min(100, newDistance)));
        });
    }
    
    setupMessageListener() {
        // Listen for messages from Python
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.onLoadGLTF = (filePath) => {
                this.loadGLTF(filePath);
            };
            
            window.pywebview.api.onResetView = () => {
                if (typeof this.resetView === 'function') {
                    this.resetView();
                }
            };
            
            window.pywebview.api.onToggleWireframe = () => {
                if (typeof this.toggleWireframe === 'function') {
                    this.toggleWireframe();
                }
            };
            
            window.pywebview.api.onClear = () => {
                if (typeof this.clear === 'function') {
                    this.clear();
                }
            };
        }
    }
}

// Initialize viewer when page loads
let viewer;

// Check if file URL is in URL parameters
function getFileUrlFromParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('file') || null;
}

// Wait for Three.js to be available
function waitForThree(callback, maxWait = 50) {
    let waited = 0;
    function check() {
        if (typeof THREE !== 'undefined') {
            console.log('THREE.js is available');
            callback();
        } else if (waited < maxWait) {
            waited++;
            setTimeout(check, 100);
        } else {
            console.error('THREE.js not available after waiting');
            document.getElementById('error').textContent = 'Three.js not loaded. Please check three.min.js file.';
            document.getElementById('error').classList.add('show');
            document.getElementById('loading').classList.remove('show');
        }
    }
    check();
}

// Initialize when DOM is ready AND all scripts are loaded
// Check if scripts are already loaded (from index.html)
if (window.__viewerScriptsLoaded) {
    // Scripts already loaded, initialize immediately
    initViewer();
} else {
    // Wait for scripts to load or DOM to be ready
    const tryInit = () => {
        if (window.__viewerScriptsLoaded || document.readyState === 'complete') {
            // Wait a bit more to ensure all scripts are parsed
            setTimeout(() => {
                if (!window.__viewerInitialized) {
    initViewer();
                }
            }, 100);
        } else {
            setTimeout(tryInit, 50);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
}

function initViewer() {
    // Prevent multiple initializations
    if (window.__viewerInitialized) {
        console.log('Viewer already initialized, skipping...');
        return;
    }
    
    console.log('Initializing viewer...');
    // Wait for Three.js to load
    waitForThree(() => {
        // Wait a bit more for loaders and all scripts to be parsed
        setTimeout(() => {
            try {
                viewer = new GLTFViewer();
                window.viewer = viewer; // Make viewer globally accessible
                window.__viewerInitialized = true; // Mark as initialized

                const initialRotationMode = window.__rotationModePreference || 'screen';
                if (viewer && typeof viewer.setRotationPivotMode === 'function') {
                    viewer.setRotationPivotMode(initialRotationMode);
                } else if (viewer) {
                    viewer.rotationPivotMode = initialRotationMode;
                }
                console.log('Viewer initialized');
                
                // Check for file in URL parameters
                const fileUrl = getFileUrlFromParams();
                if (fileUrl) {
                    // Decode the file URL - handle multiple encoding (some files might be double-encoded)
                    let decodedUrl = fileUrl;
                    try {
                        decodedUrl = decodeURIComponent(fileUrl);
                        // Try decoding again if it looks encoded (contains %)
                        if (decodedUrl.includes('%')) {
                            try {
                                decodedUrl = decodeURIComponent(decodedUrl);
                            } catch (e) {
                                // Already decoded, use as-is
                            }
                        }
                    } catch (e) {
                        console.warn('Error decoding URL, using original:', e);
                        decodedUrl = fileUrl;
                    }
                    
                    console.log('Loading file from URL:', decodedUrl);
                    
                    // Build full URL properly
                    let fullUrl;
                    if (decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://')) {
                        fullUrl = decodedUrl;
                    } else if (decodedUrl.startsWith('/')) {
                        fullUrl = window.location.origin + decodedUrl;
                    } else {
                        fullUrl = window.location.origin + '/' + decodedUrl;
                    }
                    
                    console.log('Resolved file URL:', fullUrl);
                    
                    // Load the file after ensuring viewer is ready
                    setTimeout(() => {
                        if (viewer) {
                            console.log('Calling loadGLTF...');
                            viewer.loadGLTF(fullUrl);
                        } else {
                            console.error('Viewer not initialized');
                        }
                    }, 1000);
                } else {
                    console.log('No file URL in parameters');
                    document.getElementById('loading').textContent = 'Ready - No file loaded';
                }
            } catch (e) {
                console.error('Error initializing viewer:', e);
                document.getElementById('error').textContent = 'Error: ' + e.message;
                document.getElementById('error').classList.add('show');
                document.getElementById('loading').classList.remove('show');
            }
        }, 500);
    });
}

// Function to request file selection from desktop app
async function requestAddModel() {
    if (!viewer) {
        console.error('Viewer not initialized');
        return;
    }
    
    // Get server port from current URL
    const serverPort = window.location.port || '8765';
    const apiUrl = `http://localhost:${serverPort}/api/add-model`;
    
    // Show loading state
    if (typeof viewer.showLoading === 'function') {
        viewer.showLoading('Requesting file selection from desktop app...');
    }
    
    try {
        // Send POST request to desktop app
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success && result.fileUrl) {
            // Build full URL for the file
            const fullFileUrl = `http://localhost:${serverPort}${result.fileUrl}`;
            const fileName = result.fileName;
            
            // Load the model with addMode=true
            if (viewer) {
                viewer.loadGLTF(fullFileUrl, fileName, true);
            }
            
            // Update the browser URL so refresh keeps the same file
            updateBrowserUrl(result.fileUrl);
        } else {
            // User cancelled or error - just hide loading, don't show error message
            if (typeof viewer.hideLoading === 'function') {
                viewer.hideLoading();
            }
            // Hide any existing error message
            if (typeof viewer.hideError === 'function') {
                viewer.hideError();
            }
            // Silently handle cancellation - don't show error message
            // Only show error if it's an actual error (not a cancellation)
            const errorMsg = result.error ? result.error.toLowerCase() : '';
            const isCancellation = !result.error || 
                                  errorMsg.includes('cancelled') || 
                                  errorMsg.includes('cancel') ||
                                  errorMsg.includes('no file selected') ||
                                  errorMsg.includes('file selection cancelled') ||
                                  !result.success; // If success is false and no error, treat as cancellation
            
            if (!isCancellation && result.error) {
                // Only show error if it's not a cancellation
                if (typeof viewer.showError === 'function') {
                    viewer.showError(result.error);
                } else {
                    console.log('File selection failed:', result.error);
                }
            }
            // If it's a cancellation, do nothing - just hide loading silently
        }
    } catch (error) {
        console.error('Error requesting file selection:', error);
        if (typeof viewer.hideLoading === 'function') {
            viewer.hideLoading();
        }
        // Only show error for actual communication failures, not cancellations
        // Check if it's a network error (not a cancellation)
        if (error.name !== 'AbortError' && !error.message.includes('cancelled')) {
            if (typeof viewer.showError === 'function') {
                viewer.showError('Failed to communicate with desktop app. Please ensure the desktop app is running.');
            }
        }
    }
}

function updateBrowserUrl(relativeFileUrl) {
    try {
        if (!relativeFileUrl) {
            return;
        }
        const encoded = encodeURIComponent(relativeFileUrl);
        const base = window.location.origin + window.location.pathname;
        const newUrl = `${base}?file=${encoded}`;
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState({}, '', newUrl);
        }
    } catch (err) {
        console.warn('Unable to update browser URL:', err);
    }
}

// Handle file input
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const addFileInput = document.getElementById('add-file-input');
    
    // Load Model button - replaces existing models (can use file input or HTTP)
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const fileUrl = URL.createObjectURL(file);
                const fileName = file.name;
                if (viewer) {
                    viewer.loadGLTF(fileUrl, fileName, false);
                } else {
                    // Wait for viewer to initialize
                    setTimeout(() => {
                        if (viewer) {
                            viewer.loadGLTF(fileUrl, fileName, false);
                        }
                    }, 1000);
                }
            }
            // Reset input to allow selecting same file again
            e.target.value = '';
        });
    }
    
    // Add Model button - request from desktop app via HTTP
    // Note: The button in index.html should call requestAddModel() instead of file input
    // Keeping this for fallback if needed
    if (addFileInput) {
        addFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const fileUrl = URL.createObjectURL(file);
                const fileName = file.name;
                if (viewer) {
                    viewer.loadGLTF(fileUrl, fileName, true);
                } else {
                    // Wait for viewer to initialize
                    setTimeout(() => {
                        if (viewer) {
                            viewer.loadGLTF(fileUrl, fileName, true);
                        }
                    }, 1000);
                }
            }
            // Reset input to allow selecting same file again
            e.target.value = '';
        });
    }
});

