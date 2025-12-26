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
        
        // Setup sidebar resize handler
        this.setupSidebarResize();
        
        this.hideLoading();
        this._updatePerspectiveButtonState();
    }
    
    setupSidebarResize() {
        const sidebar = document.getElementById('sidebar');
        const resizeHandle = document.getElementById('sidebar-resize-handle');
        
        if (!sidebar || !resizeHandle) {
            console.warn('Sidebar or resize handle not found');
            return;
        }
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        const startResize = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            
            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            
            e.preventDefault();
        };
        
        const doResize = (e) => {
            if (!isResizing) return;
            
            const deltaX = startX - e.clientX; // Inverted because sidebar is on the right
            const newWidth = startWidth + deltaX;
            
            // Apply min/max constraints
            const minWidth = 200;
            const maxWidth = window.innerWidth * 0.5; // Max 50% of window width
            
            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = newWidth + 'px';
                
                // Update viewer's sidebarWidth
                this.sidebarWidth = newWidth;
                
                // Update canvas CSS to exclude sidebar
                const canvas = document.getElementById('canvas');
                if (canvas) {
                    canvas.style.width = `calc(100% - ${newWidth}px)`;
                    // Update CSS variable for sidebar width
                    document.documentElement.style.setProperty('--sidebar-width', newWidth + 'px');
                }
                
                // Update right side controls position to match sidebar width
                const controls = document.getElementById('controls');
                if (controls) {
                    // Add some padding (1.25rem = 20px) from sidebar edge
                    controls.style.right = (newWidth + 20) + 'px';
                }
                
                // Update measurement panel position to match sidebar width (only if measurement tool is enabled)
                if (this.measurementEnabled && typeof this.updateMeasurementPanelPosition === 'function') {
                    this.updateMeasurementPanelPosition();
                }
                
                // Update bottom bar container position to match sidebar width
                const bottomBarContainer = document.getElementById('bottom-bar-container');
                if (bottomBarContainer) {
                    // 1.25rem = 20px margin from sidebar edge
                    // Use setProperty with important to override CSS calc
                    bottomBarContainer.style.setProperty('right', (newWidth + 20) + 'px', 'important');
                }
                
                // Update top-controls if it needs adjustment (currently centered, but check if it overlaps)
                const topControls = document.getElementById('top-controls');
                if (topControls) {
                    // Keep it centered, but ensure it doesn't overlap with sidebar
                    const containerWidth = window.innerWidth;
                    const maxLeft = containerWidth - newWidth - 20; // 20px padding
                    const topControlsWidth = topControls.offsetWidth;
                    const centerX = containerWidth / 2;
                    
                    // If centered position would overlap, adjust
                    if (centerX + topControlsWidth / 2 > maxLeft) {
                        topControls.style.left = (maxLeft - topControlsWidth / 2) + 'px';
                        topControls.style.transform = 'none';
                    } else {
                        topControls.style.left = '50%';
                        topControls.style.transform = 'translateX(-50%)';
                    }
                }
                
                // Update viewport to match new sidebar width
                this.onWindowResize();
                
                // Force viewport update
                const container = document.getElementById('container');
                const newCanvasWidth = container.clientWidth - newWidth;
                const newCanvasHeight = container.clientHeight;
                this.renderer.setViewport(0, 0, newCanvasWidth, newCanvasHeight);
            }
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            
            // Restore text selection
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        
        resizeHandle.addEventListener('mousedown', startResize);
        
        // Initialize sidebarWidth from actual sidebar width
        this.sidebarWidth = sidebar.offsetWidth;
        
        // Initialize controls position based on sidebar width
        const controls = document.getElementById('controls');
        if (controls) {
            controls.style.right = (this.sidebarWidth + 20) + 'px';
        }
        
        // Initialize bottom bar container position based on sidebar width
        const bottomBarContainer = document.getElementById('bottom-bar-container');
        if (bottomBarContainer) {
            // Force update with !important to override any CSS calc
            bottomBarContainer.style.setProperty('right', (this.sidebarWidth + 20) + 'px', 'important');
        }
        
        // Setup sidebar-bottom resize handler
        this.setupSidebarBottomResize();
    }
    
    setupSidebarBottomResize() {
        const sidebarBottom = document.getElementById('sidebar-bottom');
        const resizeHandle = document.getElementById('sidebar-bottom-resize-handle');
        if (!sidebarBottom || !resizeHandle) return;
        
        let isResizing = false;
        let startY;
        let startHeight;
        
        const startResize = (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = sidebarBottom.offsetHeight;
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
            
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'row-resize';
            
            e.preventDefault();
        };
        
        const doResize = (e) => {
            if (!isResizing) return;
            
            const deltaY = startY - e.clientY; // Inverted: moving up increases height
            const newHeight = startHeight + deltaY;
            
            const sidebar = document.getElementById('sidebar');
            const sidebarHeight = sidebar.offsetHeight;
            const minHeight = 3 * 16; // 3rem in pixels
            const maxHeight = sidebarHeight * 0.5; // 50% of sidebar height
            
            if (newHeight >= minHeight && newHeight <= maxHeight) {
                sidebarBottom.style.height = newHeight + 'px';
                sidebarBottom.style.flexShrink = '0';
            }
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        
        resizeHandle.addEventListener('mousedown', startResize);
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
        if (typeof this.initMeasurementTool === 'function') {
            this.initMeasurementTool();
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
        // Increased indicator size - use larger multiplier for bigger display
        this._viewportIndicatorLength = Math.min(canvas.width, canvas.height) * 0.35;
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
}