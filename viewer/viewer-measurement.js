/**
 * Measurement Tool Module
 * Handles distance measurement between two points on mesh surfaces
 */

GLTFViewer.prototype.initMeasurementTool = function() {
    this.measurementEnabled = false;
    this.measurementPoints = [];
    this.measurementLine = null;
    this.measurementSpheres = [];
    this.measurementDisplayMode = 'distance';
    
    this.createMeasurementPanel();
    this.setupMeasurementClickHandler();
    this.setupMeasurementPanelResizeHandler();
};

GLTFViewer.prototype.setupMeasurementPanelResizeHandler = function() {
    // Ensure panel stays visible on window resize (like when developer console opens)
    window.addEventListener('resize', () => {
        if (this.measurementEnabled) {
            const panel = document.getElementById('measurement-panel');
            if (panel) {
                // Force panel to be visible if measurement tool is enabled
                panel.classList.add('visible');
                panel.setAttribute('aria-hidden', 'false');
                panel.style.display = 'block';
                
                // Update position
                if (typeof this.updateMeasurementPanelPosition === 'function') {
                    this.updateMeasurementPanelPosition();
                }
            }
        }
    });
};

GLTFViewer.prototype.createMeasurementPanel = function() {
    if (document.getElementById('measurement-panel')) {
        return;
    }
    
    const panel = document.createElement('div');
    panel.id = 'measurement-panel';
    panel.setAttribute('aria-hidden', 'true');
    
    panel.innerHTML = '<div class="section-panel-header" id="measurement-panel-header"><h3>Measurement</h3><div class="section-panel-actions"><button id="measurement-panel-close-btn" title="Close Panel">&times;</button></div></div><div class="section-panel-body"><div class="section-group"><div class="group-title">Distance Measurement</div><div class="section-field"><label>Status: <span id="measurement-status" style="color: #6666FF;">Ready</span></label></div><div class="section-field"><label>Point 1: <span id="measurement-point1" style="color: #666;">Not set</span></label></div><div class="section-field"><label>Point 2: <span id="measurement-point2" style="color: #666;">Not set</span></label></div><div class="section-field" id="measurement-result-field" style="display: none;"><label>Result: <span id="measurement-result" style="color: #4CAF50; font-weight: bold; cursor: pointer; text-decoration: underline;" title="Click to toggle between Distance and Diameter">-</span></label></div><div class="section-button-row"><button id="measurement-clear-btn" type="button">Clear</button></div></div></div>';
    
    document.getElementById('container').appendChild(panel);
    
    const closeBtn = document.getElementById('measurement-panel-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // Close panel and deselect measurement tool
            this.toggleMeasurementPanel(false);
            if (typeof this.toggleMeasurementTool === 'function') {
                this.toggleMeasurementTool(); // This will disable measurement and re-enable selection
            }
        });
    }
    
    const clearBtn = document.getElementById('measurement-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            this.clearMeasurement();
        });
    }
    
    const resultSpan = document.getElementById('measurement-result');
    if (resultSpan) {
        resultSpan.addEventListener('click', () => {
            this.toggleMeasurementDisplayMode();
        });
    }
    
    // Setup panel dragging (like material panel)
    this.setupMeasurementPanelDrag();
};

GLTFViewer.prototype.setupMeasurementPanelDrag = function() {
    const panel = document.getElementById('measurement-panel');
    const panelHeader = document.getElementById('measurement-panel-header');
    if (!panel || !panelHeader) return;
    
    let dragState = null;
    
    const startDrag = (event) => {
        if (event.button !== 0) return;
        if (event.target.closest('.section-panel-actions')) return;
        
        const rect = panel.getBoundingClientRect();
        dragState = {
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top
        };
        
        const moveHandler = (e) => onDrag(e);
        const upHandler = () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            dragState = null;
        };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    };
    
    const onDrag = (event) => {
        if (!dragState || !panel) return;
        
        const container = document.getElementById('container');
        const bounds = container ? container.getBoundingClientRect() : document.body.getBoundingClientRect();
        
        let left = event.clientX - dragState.offsetX;
        let top = event.clientY - dragState.offsetY;
        
        left = Math.max(bounds.left + 10, Math.min(left, bounds.right - panel.offsetWidth - 10));
        top = Math.max(bounds.top + 10, Math.min(top, bounds.bottom - panel.offsetHeight - 10));
        
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.transform = 'none';
    };
    
    panelHeader.addEventListener('mousedown', startDrag);
};

GLTFViewer.prototype.toggleMeasurementPanel = function(show) {
    const panel = document.getElementById('measurement-panel');
    if (!panel) {
        // Try to create panel if it doesn't exist
        if (typeof this.createMeasurementPanel === 'function') {
            this.createMeasurementPanel();
        }
        const panelAfter = document.getElementById('measurement-panel');
        if (!panelAfter) {
            console.error('Measurement panel not found and could not be created');
            return;
        }
        return this.toggleMeasurementPanel(show);
    }
    
    if (show === undefined) {
        // Use measurementEnabled as source of truth
        show = this.measurementEnabled === true;
    }
    
    if (show) {
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.style.display = 'block'; // Force display (like material panel)
    } else {
        panel.classList.remove('visible');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.display = 'none';
    }
};

GLTFViewer.prototype.toggleMeasurementTool = function() {
    this.measurementEnabled = !this.measurementEnabled;
    
    const btn = document.getElementById('measurement-tool');
    const selectBtn = document.getElementById('select-tool');
    
    if (btn) {
        if (this.measurementEnabled) {
            btn.classList.add('active');
            // Disable selection tool
            if (selectBtn) {
                selectBtn.classList.remove('active');
                selectBtn.disabled = true;
            }
            // Re-attach click handler to ensure it's active
            if (typeof this.setupMeasurementClickHandler === 'function') {
                this.setupMeasurementClickHandler();
            }
            // Set normal cursor (not hand) when measurement is enabled
            const canvas = this.renderer ? this.renderer.domElement : null;
            if (canvas) {
                canvas.style.cursor = 'default';
            }
            // Update cursor style through controls (if available)
            if (typeof this._updateCanvasCursor === 'function') {
                this._updateCanvasCursor();
            }
            this.toggleMeasurementPanel(true);
            if (typeof this.updateMeasurementStatus === 'function') {
                this.updateMeasurementStatus('Click on mesh (Ctrl+Click) to set Point 1');
            }
            console.log('[MEASUREMENT] Tool enabled - handler re-attached');
        } else {
            btn.classList.remove('active');
            // Re-enable selection tool
            if (selectBtn) {
                selectBtn.disabled = false;
                selectBtn.classList.add('active');
            }
            // Reset cursor through controls
            if (typeof this._updateCanvasCursor === 'function') {
                this._updateCanvasCursor();
            } else {
                const canvas = this.renderer ? this.renderer.domElement : null;
                if (canvas) {
                    canvas.style.cursor = '';
                }
            }
            this.toggleMeasurementPanel(false);
            if (typeof this.clearMeasurement === 'function') {
                this.clearMeasurement();
            }
            console.log('[MEASUREMENT] Tool disabled');
        }
    }
};

GLTFViewer.prototype.setupMeasurementClickHandler = function() {
    if (!this.renderer || !this.renderer.domElement) {
        console.error('[MEASUREMENT] Renderer or canvas not available');
        // Retry after a short delay
        setTimeout(() => {
            if (this.renderer && this.renderer.domElement) {
                this.setupMeasurementClickHandler();
            }
        }, 100);
        return;
    }
    
    const canvas = this.renderer.domElement;
    
    // Remove existing handlers if any
    if (canvas._measurementClickHandler) {
        canvas.removeEventListener('click', canvas._measurementClickHandler, { capture: true });
    }
    if (canvas._measurementMouseDownHandler) {
        canvas.removeEventListener('mousedown', canvas._measurementMouseDownHandler, { capture: true });
    }
    if (canvas._measurementMouseMoveHandler) {
        canvas.removeEventListener('mousemove', canvas._measurementMouseMoveHandler);
    }
    
    // Create click handler function
    const clickHandler = (e) => {
        // ALWAYS log to verify handler is being called
        console.log('[MEASUREMENT] Click handler called - enabled:', this.measurementEnabled, 'ctrl:', e.ctrlKey, 'meta:', e.metaKey, 'button:', e.button);
        
        // Early return if measurement not enabled
        if (!this.measurementEnabled) {
            console.log('[MEASUREMENT] Tool not enabled, ignoring click');
            return;
        }
        
        // Only work with Ctrl+Click (to avoid interfering with part selection)
        if (!e.ctrlKey && !e.metaKey) {
            console.log('[MEASUREMENT] No Ctrl/Meta key pressed, ignoring click');
            return;
        }
        
        // Check if point is in canvas area
        if (!this.isPointInCanvasArea || !this.isPointInCanvasArea(e.clientX, e.clientY)) {
            console.log('[MEASUREMENT] Click outside canvas area');
            return;
        }
        
        console.log('[MEASUREMENT] Valid Ctrl+Click detected - processing...');
        
        // Stop event propagation to prevent other handlers
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Temporarily disable controls to prevent interference
        const controlsWasEnabled = this.controls ? this.controls.enabled : false;
        if (this.controls) {
            this.controls.enabled = false;
        }
        
        // Store 'this' reference to avoid context loss
        const self = this;
        
        // Use requestAnimationFrame to ensure we process after other handlers
        requestAnimationFrame(() => {
            try {
                // Ensure arrays are initialized
                if (!self.measurementPoints) {
                    self.measurementPoints = [];
                }
                if (!self.measurementSpheres) {
                    self.measurementSpheres = [];
                }
                
                const rect = canvas.getBoundingClientRect();
                const container = document.getElementById('container');
                const canvasWidth = container.clientWidth - (self.sidebarWidth || 300);
                const canvasHeight = container.clientHeight;
                
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                const mouse = new THREE.Vector2(
                    (mouseX / canvasWidth) * 2 - 1,
                    -((mouseY / canvasHeight) * 2 - 1)
                );
                
                console.log('[MEASUREMENT] Mouse coords:', mouseX, mouseY, 'Normalized:', mouse.x, mouse.y);
                
                // Raycast to find intersection with model (same method as 3D cursor)
                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera(mouse, self.camera);
                
                if (!self.loadedModels || self.loadedModels.length === 0) {
                    console.log('[MEASUREMENT] No loaded models');
                    self.updateMeasurementStatus('No mesh found. Load a model first.');
                    if (self.controls) {
                        self.controls.enabled = controlsWasEnabled;
                    }
                    return;
                }
                
                let allIntersects = [];
                self.loadedModels.forEach(modelData => {
                    if (modelData.model) {
                        // Use intersectObject with recursive=true (like 3D cursor)
                        const intersects = raycaster.intersectObject(modelData.model, true);
                        allIntersects = allIntersects.concat(intersects);
                    }
                });
                
                console.log('[MEASUREMENT] Total intersects found:', allIntersects.length);
                
                if (allIntersects.length === 0) {
                    console.log('[MEASUREMENT] No intersections found');
                    self.updateMeasurementStatus('No intersection found. Click on a mesh surface.');
                    if (self.controls) {
                        self.controls.enabled = controlsWasEnabled;
                    }
                    return;
                }
                
                // Sort by distance
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
                
                console.log('[MEASUREMENT] Visible intersects found:', visibleIntersects.length);
                
                if (visibleIntersects.length > 0) {
                    const intersection = visibleIntersects[0];
                    const point = intersection.point.clone();
                    const mesh = intersection.object;
                    console.log('[MEASUREMENT] Adding point at:', point.x.toFixed(3), point.y.toFixed(3), point.z.toFixed(3));
                    self.addMeasurementPoint(point, mesh);
                } else {
                    console.log('[MEASUREMENT] No visible intersections');
                    self.updateMeasurementStatus('No visible intersection found. Click on a visible mesh surface.');
                }
                
                // Re-enable controls
                if (self.controls) {
                    self.controls.enabled = controlsWasEnabled;
                }
            } catch (error) {
                console.error('[MEASUREMENT] Error processing click:', error);
                console.error('[MEASUREMENT] Error stack:', error.stack);
                if (self.controls) {
                    self.controls.enabled = controlsWasEnabled;
                }
            }
        });
    };
    
    // Create mousedown handler as backup (in case click is prevented)
    const mouseDownHandler = (e) => {
        if (!this.measurementEnabled) return;
        if (!e.ctrlKey && !e.metaKey) return;
        if (!this.isPointInCanvasArea || !this.isPointInCanvasArea(e.clientX, e.clientY)) return;
        
        console.log('[MEASUREMENT] MouseDown detected with Ctrl - will process on click');
        // Don't prevent default here, let click handler do it
    };
    
    // Create mousemove handler to ensure cursor stays correct
    const mouseMoveHandler = (e) => {
        if (this.measurementEnabled) {
            // Update cursor style if function exists
            if (typeof this._updateCanvasCursor === 'function') {
                this._updateCanvasCursor();
            } else {
                // Fallback: directly set cursor
                canvas.style.cursor = 'default';
            }
        }
    };
    
    // Store handler references
    canvas._measurementClickHandler = clickHandler;
    canvas._measurementMouseDownHandler = mouseDownHandler;
    canvas._measurementMouseMoveHandler = mouseMoveHandler;
    
    // Use capture phase with highest priority to intercept before ALL other handlers
    // Add with capture phase (true) so it runs first
    canvas.addEventListener('click', clickHandler, { capture: true, passive: false });
    canvas.addEventListener('mousedown', mouseDownHandler, { capture: true, passive: false });
    canvas.addEventListener('mousemove', mouseMoveHandler);
    
    console.log('[MEASUREMENT] Click, mousedown, and mousemove handlers attached successfully');
    console.log('[MEASUREMENT] Handler will intercept ALL clicks when measurement is enabled');
    console.log('[MEASUREMENT] Current measurementEnabled state:', this.measurementEnabled);
    console.log('[MEASUREMENT] Canvas element:', canvas ? 'found' : 'NOT FOUND');
    console.log('[MEASUREMENT] Test: Try Ctrl+Click on the canvas to see if handler is called');
};

GLTFViewer.prototype.addMeasurementPoint = function(position, mesh) {
    console.log('[MEASUREMENT] addMeasurementPoint called with position:', position.x.toFixed(3), position.y.toFixed(3), position.z.toFixed(3));
    
    // Ensure arrays are initialized
    if (!this.measurementPoints) {
        console.log('[MEASUREMENT] Initializing measurementPoints array');
        this.measurementPoints = [];
    }
    if (!this.measurementSpheres) {
        console.log('[MEASUREMENT] Initializing measurementSpheres array');
        this.measurementSpheres = [];
    }
    
    this.measurementPoints.push({
        position: position.clone(),
        mesh: mesh
    });
    
    console.log('[MEASUREMENT] measurementPoints count:', this.measurementPoints.length);
    
    // Calculate sphere size based on model bounding box for better visibility
    let sphereRadius = 0.1; // Default size
    if (this.loadedModels && this.loadedModels.length > 0) {
        const box = new THREE.Box3();
        this.loadedModels.forEach(modelData => {
            if (modelData.model) {
                const modelBox = new THREE.Box3().setFromObject(modelData.model);
                if (!modelBox.isEmpty()) {
                    if (box.isEmpty()) {
                        box.copy(modelBox);
                    } else {
                        box.union(modelBox);
                    }
                }
            }
        });
        if (!box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            // Sphere size should be about 1% of the largest dimension
            sphereRadius = maxDim * 0.01;
            // Clamp between reasonable min/max values
            sphereRadius = Math.max(0.05, Math.min(sphereRadius, 1.0));
        }
    }
    
    console.log('[MEASUREMENT] Using sphere radius:', sphereRadius.toFixed(3));
    
    // Create sphere with calculated size
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x4CAF50, // Green color
        transparent: false, // Make it fully opaque for better visibility
        opacity: 1.0,
        depthTest: true,
        depthWrite: true
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(position);
    sphere.name = 'measurement-point-' + this.measurementSpheres.length;
    sphere.renderOrder = 999; // Render on top
    
    console.log('[MEASUREMENT] Creating sphere at:', sphere.position.x.toFixed(3), sphere.position.y.toFixed(3), sphere.position.z.toFixed(3), 'radius:', sphereRadius.toFixed(3));
    
    if (!this.scene) {
        console.error('[MEASUREMENT] Scene is null, cannot add sphere');
        return;
    }
    
    this.scene.add(sphere);
    this.measurementSpheres.push(sphere);
    console.log('[MEASUREMENT] Sphere added to scene. Total spheres:', this.measurementSpheres.length);
    console.log('[MEASUREMENT] Scene children count:', this.scene.children.length);
    
    if (this.measurementPoints.length === 1) {
        this.updateMeasurementStatus('Point 1 set. Click on mesh (Ctrl+Click) to set Point 2');
        this.updateMeasurementPoint1(position);
    } else if (this.measurementPoints.length === 2) {
        this.updateMeasurementStatus('Point 2 set. Distance calculated.');
        this.updateMeasurementPoint2(position);
        this.calculateMeasurement();
    } else {
        this.clearMeasurement();
        this.addMeasurementPoint(position, mesh);
    }
    
    // Force immediate render
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
        console.log('Renderer.render called after adding point');
    } else {
        console.error('Renderer, scene, or camera is null - cannot render');
    }
    
    // Also request render through animate loop
    if (typeof this._requestRender === 'function') {
        this._requestRender();
    } else if (typeof this._needsRender !== 'undefined') {
        this._needsRender = true;
    }
};

GLTFViewer.prototype.calculateMeasurement = function() {
    if (this.measurementPoints.length !== 2) return;
    
    const point1 = this.measurementPoints[0].position;
    const point2 = this.measurementPoints[1].position;
    const distance = point1.distanceTo(point2);
    
    this.createMeasurementLine(point1, point2);
    this.updateMeasurementResult(distance);
    
    const resultField = document.getElementById('measurement-result-field');
    if (resultField) {
        resultField.style.display = 'block';
    }
    
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
    }
};

GLTFViewer.prototype.createMeasurementLine = function(point1, point2) {
    if (this.measurementLine) {
        this.scene.remove(this.measurementLine);
        this.measurementLine = null;
    }
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([point1, point2]);
    const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x4CAF50,
        linewidth: 2,
        transparent: true,
        opacity: 0.8
    });
    
    this.measurementLine = new THREE.Line(lineGeometry, lineMaterial);
    this.scene.add(this.measurementLine);
    
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
    }
};

GLTFViewer.prototype.updateMeasurementStatus = function(status) {
    const statusSpan = document.getElementById('measurement-status');
    if (statusSpan) {
        statusSpan.textContent = status;
    }
};

GLTFViewer.prototype.updateMeasurementPoint1 = function(position) {
    const point1Span = document.getElementById('measurement-point1');
    if (point1Span) {
        point1Span.textContent = '(' + position.x.toFixed(3) + ', ' + position.y.toFixed(3) + ', ' + position.z.toFixed(3) + ')';
        point1Span.style.color = '#4CAF50';
    }
};

GLTFViewer.prototype.updateMeasurementPoint2 = function(position) {
    const point2Span = document.getElementById('measurement-point2');
    if (point2Span) {
        point2Span.textContent = '(' + position.x.toFixed(3) + ', ' + position.y.toFixed(3) + ', ' + position.z.toFixed(3) + ')';
        point2Span.style.color = '#4CAF50';
    }
};

GLTFViewer.prototype.updateMeasurementResult = function(distance) {
    const resultSpan = document.getElementById('measurement-result');
    if (!resultSpan) return;
    
    if (this.measurementDisplayMode === 'distance') {
        resultSpan.textContent = distance.toFixed(3) + ' units';
        resultSpan.title = 'Click to show Diameter';
    } else {
        const diameter = distance * 2;
        resultSpan.textContent = 'Diameter: ' + diameter.toFixed(3) + ' units';
        resultSpan.title = 'Click to show Distance';
    }
};

GLTFViewer.prototype.toggleMeasurementDisplayMode = function() {
    if (this.measurementPoints.length !== 2) return;
    
    this.measurementDisplayMode = this.measurementDisplayMode === 'distance' ? 'diameter' : 'distance';
    
    const point1 = this.measurementPoints[0].position;
    const point2 = this.measurementPoints[1].position;
    const distance = point1.distanceTo(point2);
    
    this.updateMeasurementResult(distance);
    
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
    }
};

GLTFViewer.prototype.clearMeasurement = function() {
    if (!this.measurementSpheres) {
        this.measurementSpheres = [];
    }
    this.measurementSpheres.forEach(sphere => {
        this.scene.remove(sphere);
        if (sphere.geometry) sphere.geometry.dispose();
        if (sphere.material) sphere.material.dispose();
    });
    this.measurementSpheres = [];
    
    if (this.measurementLine) {
        this.scene.remove(this.measurementLine);
        if (this.measurementLine.geometry) this.measurementLine.geometry.dispose();
        if (this.measurementLine.material) this.measurementLine.material.dispose();
        this.measurementLine = null;
    }
    
    this.measurementPoints = [];
    
    this.updateMeasurementStatus('Ready');
    const point1Span = document.getElementById('measurement-point1');
    if (point1Span) {
        point1Span.textContent = 'Not set';
        point1Span.style.color = '#666';
    }
    const point2Span = document.getElementById('measurement-point2');
    if (point2Span) {
        point2Span.textContent = 'Not set';
        point2Span.style.color = '#666';
    }
    const resultField = document.getElementById('measurement-result-field');
    if (resultField) {
        resultField.style.display = 'none';
    }
    
    if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
    }
};

GLTFViewer.prototype.updateMeasurementPanelPosition = function() {
    const panel = document.getElementById('measurement-panel');
    if (!panel) return;
    
    // Check if measurement tool is enabled (source of truth)
    const shouldBeVisible = this.measurementEnabled === true;
    
    // Preserve visibility state before updating position
    const wasVisible = panel.classList.contains('visible') || shouldBeVisible;
    
    // Don't update position if panel was manually dragged (has custom left/top)
    const currentLeft = panel.style.left;
    const currentTop = panel.style.top;
    const wasManuallyPositioned = currentLeft && currentLeft !== '' && currentTop && currentTop !== '';
    
    // Only auto-position if panel hasn't been manually dragged
    if (!wasManuallyPositioned) {
        const container = document.getElementById('container');
        const containerWidth = container.clientWidth;
        const sidebarWidth = this.sidebarWidth || 300;
        const panelWidth = 320;
        const maxLeft = containerWidth - sidebarWidth - panelWidth - 20;
        
        const centerX = containerWidth / 2;
        if (centerX + panelWidth / 2 > maxLeft) {
            panel.style.left = (maxLeft - panelWidth / 2) + 'px';
            panel.style.transform = 'none';
        } else {
            panel.style.left = 'calc(50% - 11.25rem)';
            panel.style.transform = 'none';
        }
    }
    
    // Always restore visibility state based on measurementEnabled (like material panel does)
    if (shouldBeVisible || wasVisible) {
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.style.display = 'block'; // Force display
    }
};

function toggleMeasurementTool() {
    if (viewer && typeof viewer.toggleMeasurementTool === 'function') {
        viewer.toggleMeasurementTool();
    }
}

