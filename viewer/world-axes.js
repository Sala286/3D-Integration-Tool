/**
 * World Origin Axes Module
 * Creates X (red), Y (green), Z (blue) axis lines at world origin (0,0,0)
 * Provides UI controls for visibility and axis selection
 */

(function() {
    'use strict';
    
    // Initialize world axes when viewer is ready
    function initWorldAxes() {
        if (typeof GLTFViewer === 'undefined' || !window.viewer || !window.viewer.scene) {
            // Wait for viewer to be ready
            setTimeout(initWorldAxes, 100);
            return;
        }
        
        const viewer = window.viewer;
        
        // Don't initialize twice
        if (viewer.worldAxesGroup) {
            return;
        }
        
        // Add world axes initialization to GLTFViewer prototype
        if (!GLTFViewer.prototype.initWorldAxes) {
            GLTFViewer.prototype.initWorldAxes = function() {
                // Initialize axis visibility state
                this.worldAxesVisible = true; // Default: axes visible
                this.axisXVisible = true; // Default: X visible
                this.axisYVisible = false; // Default: Y hidden
                this.axisZVisible = true; // Default: Z visible
                
                // Create world origin axes group
                const axesGroup = new THREE.Group();
                axesGroup.name = 'WorldOriginAxes';
                
                // Axis line length - very long to extend full screen in both directions
                // Using a very large value to ensure axes extend beyond any view
                const axisLength = 10000.0; // Very long to cover full screen
                
                // X axis - RED (extends in both positive and negative directions)
                const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(-axisLength, 0, 0),
                    new THREE.Vector3(axisLength, 0, 0)
                ]);
                const xAxisMaterial = new THREE.LineBasicMaterial({
                    color: 0xff0000, // Red
                    linewidth: 2,
                    depthTest: true,
                    depthWrite: true
                });
                const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
                xAxis.name = 'WorldAxisX';
                axesGroup.add(xAxis);
                this.worldAxisX = xAxis;
                
                // Y axis - GREEN (extends in both positive and negative directions)
                const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, -axisLength, 0),
                    new THREE.Vector3(0, axisLength, 0)
                ]);
                const yAxisMaterial = new THREE.LineBasicMaterial({
                    color: 0x00ff00, // Green
                    linewidth: 2,
                    depthTest: true,
                    depthWrite: true
                });
                const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
                yAxis.name = 'WorldAxisY';
                axesGroup.add(yAxis);
                this.worldAxisY = yAxis;
                
                // Z axis - BLUE (extends in both positive and negative directions)
                const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(0, 0, -axisLength),
                    new THREE.Vector3(0, 0, axisLength)
                ]);
                const zAxisMaterial = new THREE.LineBasicMaterial({
                    color: 0x0000ff, // Blue
                    linewidth: 2,
                    depthTest: true,
                    depthWrite: true
                });
                const zAxis = new THREE.Line(zAxisGeometry, zAxisMaterial);
                zAxis.name = 'WorldAxisZ';
                zAxis.visible = true; // Default: Z visible
                axesGroup.add(zAxis);
                this.worldAxisZ = zAxis;
                
                // Set Y axis hidden by default
                yAxis.visible = false; // Default: Y hidden
                
                // Position at world origin (fixed, never changes)
                axesGroup.position.set(0, 0, 0);
                axesGroup.userData.isWorldAxes = true; // Mark as world axes (not affected by view operations)
                
                this.worldAxesGroup = axesGroup;
                this.scene.add(axesGroup);
                
                // Update button state
                updateAxisHideButton();
            };
            
            // Method to set world axes visibility
            GLTFViewer.prototype.setWorldAxesVisibility = function(visible) {
                this.worldAxesVisible = visible;
                if (this.worldAxesGroup) {
                    this.worldAxesGroup.visible = visible;
                }
                updateAxisHideButton();
            };
            
            // Method to set individual axis visibility
            GLTFViewer.prototype.setAxisXVisibility = function(visible) {
                this.axisXVisible = visible;
                if (this.worldAxisX) {
                    this.worldAxisX.visible = visible && this.worldAxesVisible;
                }
            };
            
            GLTFViewer.prototype.setAxisYVisibility = function(visible) {
                this.axisYVisible = visible;
                if (this.worldAxisY) {
                    this.worldAxisY.visible = visible && this.worldAxesVisible;
                }
            };
            
            GLTFViewer.prototype.setAxisZVisibility = function(visible) {
                this.axisZVisible = visible;
                if (this.worldAxisZ) {
                    this.worldAxisZ.visible = visible && this.worldAxesVisible;
                }
            };
        }
        
        // Initialize world axes
        if (viewer && viewer.scene) {
            viewer.initWorldAxes();
            // Update button state after initialization
            setTimeout(updateAxisHideButton, 100);
        }
    }
    
    // Update axis hide button state
    function updateAxisHideButton() {
        const btn = document.getElementById('axis-hide-btn');
        if (!btn || !window.viewer) return;
        
        // Button enabled when axes are visible (so you can click to hide)
        // Button active/disabled when axes are hidden
        if (window.viewer.worldAxesVisible) {
            btn.disabled = false;
            btn.classList.remove('active');
        } else {
            btn.disabled = false;
            btn.classList.add('active');
        }
    }
    
    // Toggle axis visibility
    window.toggleAxisHide = function() {
        if (!window.viewer) return;
        
        const newState = !window.viewer.worldAxesVisible;
        window.viewer.setWorldAxesVisibility(newState);
    };
    
    // Show axis context menu
    window.showAxisContextMenu = function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const contextMenu = document.getElementById('axis-context-menu');
        if (!contextMenu || !window.viewer) return;
        
        // Hide menu if clicking outside
        const hideMenu = (e) => {
            if (contextMenu && !contextMenu.contains(e.target) && e.target.id !== 'axis-hide-btn') {
                contextMenu.style.display = 'none';
                document.removeEventListener('click', hideMenu);
                document.removeEventListener('contextmenu', hideMenu);
            }
        };
        
        // Build context menu
        contextMenu.innerHTML = '';
        
        // X axis checkbox
        const xItem = document.createElement('div');
        xItem.className = 'context-menu-item';
        xItem.innerHTML = `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; width: 100%;">
                <input type="checkbox" id="axis-x-checkbox" ${window.viewer.axisXVisible ? 'checked' : ''} 
                       style="margin: 0; cursor: pointer;">
                <span>X (Red)</span>
            </label>
        `;
        xItem.querySelector('#axis-x-checkbox').addEventListener('change', (e) => {
            window.viewer.setAxisXVisibility(e.target.checked);
        });
        contextMenu.appendChild(xItem);
        
        // Y axis checkbox
        const yItem = document.createElement('div');
        yItem.className = 'context-menu-item';
        yItem.innerHTML = `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; width: 100%;">
                <input type="checkbox" id="axis-y-checkbox" ${window.viewer.axisYVisible ? 'checked' : ''} 
                       style="margin: 0; cursor: pointer;">
                <span>Y (Green)</span>
            </label>
        `;
        yItem.querySelector('#axis-y-checkbox').addEventListener('change', (e) => {
            window.viewer.setAxisYVisibility(e.target.checked);
        });
        contextMenu.appendChild(yItem);
        
        // Z axis checkbox
        const zItem = document.createElement('div');
        zItem.className = 'context-menu-item';
        zItem.innerHTML = `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; width: 100%;">
                <input type="checkbox" id="axis-z-checkbox" ${window.viewer.axisZVisible ? 'checked' : ''} 
                       style="margin: 0; cursor: pointer;">
                <span>Z (Blue)</span>
            </label>
        `;
        zItem.querySelector('#axis-z-checkbox').addEventListener('change', (e) => {
            window.viewer.setAxisZVisibility(e.target.checked);
        });
        contextMenu.appendChild(zItem);
        
        // Position menu at cursor, but ensure it stays on screen
        const menuWidth = 150;
        const menuHeight = 120; // Approximate height for 3 items
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
        contextMenu.style.display = 'block';
        
        // Hide menu on click outside
        setTimeout(() => {
            document.addEventListener('click', hideMenu);
            document.addEventListener('contextmenu', hideMenu);
        }, 10);
    };
    
    // Toggle cursor visibility
    window.toggleCursorHide = function() {
        if (!window.viewer || !window.viewer.cursor3DGroup) return;
        
        const isVisible = window.viewer.cursor3DGroup.visible;
        window.viewer.cursor3DGroup.visible = !isVisible;
        
        // Update button state
        const btn = document.getElementById('cursor-hide-btn');
        if (btn) {
            if (isVisible) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    };
    
    // Toggle rotation pivot visibility
    window.toggleRotationPivotHide = function() {
        if (!window.viewer) return;
        
        // Initialize rotation pivot indicator if not exists
        if (!window.viewer.rotationPivotIndicator) {
            window.viewer.initRotationPivotIndicator();
        }
        
        const isVisible = window.viewer.rotationPivotIndicatorGroup?.visible || false;
        
        if (window.viewer.rotationPivotIndicatorGroup) {
            window.viewer.rotationPivotIndicatorGroup.visible = !isVisible;
        }
        
        // Update button state - active when visible (enabled)
        const btn = document.getElementById('rotation-pivot-hide-btn');
        if (btn) {
            if (!isVisible) { // After toggle, new state is !isVisible
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    };
    
    // Make updateAxisHideButton globally accessible
    window.updateAxisHideButton = updateAxisHideButton;
    
    // ============================================
    // ROTATION MODE SELECTOR
    // ============================================
    
    // Set rotation mode and update UI
    window.setRotationMode = function(mode) {
        if (!window.viewer) {
            console.warn('Viewer not initialized');
            return;
        }
        
        // Store rotation mode
        window.viewer.rotationPivotMode = mode;
        
        // Update UI - remove active class from all cells
        const cells = document.querySelectorAll('.rotation-mode-cell');
        cells.forEach(cell => {
            if (cell.getAttribute('data-mode') === mode) {
                cell.classList.add('active');
            } else {
                cell.classList.remove('active');
            }
        });
        
        // Update rotation pivot indicator position based on new mode
        if (typeof window.viewer.updateRotationPivotIndicator === 'function') {
            window.viewer.updateRotationPivotIndicator();
        }
        
        console.log('Rotation mode set to:', mode);
    };
    
    // Initialize rotation mode on load
    function initRotationMode() {
        if (!window.viewer) {
            setTimeout(initRotationMode, 100);
            return;
        }
        
        // Set default mode to 'screen'
        window.viewer.rotationPivotMode = 'screen';
        
        // Ensure first cell is active
        const cells = document.querySelectorAll('.rotation-mode-cell');
        cells.forEach((cell, index) => {
            if (index === 0) {
                cell.classList.add('active');
            } else {
                cell.classList.remove('active');
            }
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initWorldAxes();
            initRotationMode();
        });
    } else {
        initWorldAxes();
        initRotationMode();
    }
    
    // Also try to initialize after viewer is created
    const originalInit = window.initViewer;
    if (originalInit) {
        window.initViewer = function() {
            originalInit();
            setTimeout(function() {
                initWorldAxes();
                initRotationMode();
            }, 200);
        };
    }
})();

