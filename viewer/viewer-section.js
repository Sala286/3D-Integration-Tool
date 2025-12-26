/**
 * GLTF Viewer - Section Plane & Box Module
 * Handles cut planes, clipping boxes and UI panel interactions
 */
(function() {
    if (typeof GLTFViewer === 'undefined' || typeof THREE === 'undefined') {
        return;
    }

    const clamp = THREE.MathUtils.clamp;

    const wrapDegrees = (value) => {
        let v = value % 360;
        if (v > 180) v -= 360;
        if (v < -180) v += 360;
        return v;
    };

    class SectionPlaneManager {
        constructor(viewer) {
            this.viewer = viewer;
            this.renderer = viewer.renderer;

            this.planeEnabled = false;
            this.planeSectionActive = false;
            this.planeHidden = false;
            this.planeOriginMode = 'world';
            this.planeYaw = 0;
            this.planePitch = 0;
            this.planeOffset = 0;
            this.planeOffsetLimit = 50;

            this.sectionPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
            this.planeHelper = null;

            this.panelEl = document.getElementById('section-plane-panel');
            this.panelHeaderEl = document.getElementById('section-panel-header');
            this.topButton = document.getElementById('section-plane-btn');

            this.boxEnabled = false;
            this.boxSectionActive = false;
            this.boxHidden = false;
            this.boxCenterMode = 'world';
            this.boxScale = 1.0;
            this.boxYaw = 0;
            this.boxPitch = 0;
            this.boxBaseSize = new THREE.Vector3(1, 1, 1);
            this.boxSize = new THREE.Vector3(1, 1, 1);
            this.boxCenter = new THREE.Vector3(0, 0, 0);
            this.boxHelper = null;
            this._boxInitialized = false;
            this.boxPlanes = [
                new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
                new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
                new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
                new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
                new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
                new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
            ];

            this._dragState = null;

            this._cacheControls();
            this._bindUI();
            this._ensureHelpers();
            this._updateAll();
        }

        refresh() {
            this.renderer = this.viewer.renderer;
            this._ensureHelpers();
            this._updateRendererClipping();
        }

        _cacheControls() {
            this.controls = {
                planeToggle: document.getElementById('section-plane-enable'),
                originSelect: document.getElementById('section-plane-origin'),
                offsetSlider: document.getElementById('section-plane-offset'),
                offsetInput: document.getElementById('section-plane-offset-value'),
                yawSlider: document.getElementById('section-plane-yaw'),
                yawInput: document.getElementById('section-plane-yaw-value'),
                pitchSlider: document.getElementById('section-plane-pitch'),
                pitchInput: document.getElementById('section-plane-pitch-value'),
                alignCursorBtn: document.getElementById('section-plane-align-cursor'),
                flipBtn: document.getElementById('section-plane-flip'),
                hideBtn: document.getElementById('section-plane-hide'),
                resetBtn: document.getElementById('section-plane-reset'),
                panelResetBtn: document.getElementById('section-panel-reset-btn'),
                closeBtn: document.getElementById('section-panel-close-btn'),
                boxToggle: document.getElementById('section-box-enable'),
                boxSectionBtn: document.getElementById('section-box-section'),
                boxAnchor: document.getElementById('section-box-center-mode'),
                boxScaleSlider: document.getElementById('section-box-scale'),
                boxScaleInput: document.getElementById('section-box-scale-value'),
                boxYawSlider: document.getElementById('section-box-yaw'),
                boxYawInput: document.getElementById('section-box-yaw-value'),
                boxPitchSlider: document.getElementById('section-box-pitch'),
                boxPitchInput: document.getElementById('section-box-pitch-value'),
                boxHideBtn: document.getElementById('section-box-hide'),
                boxAlignCursorBtn: document.getElementById('section-box-align-cursor'),
                boxFlipBtn: document.getElementById('section-box-flip'),
                boxResetBtn: document.getElementById('section-box-reset'),
                planeSectionBtn: document.getElementById('section-plane-section')
            };
        }

        _bindUI() {
            if (!this.controls || !this.panelEl) {
                return;
            }

            const {
                planeToggle,
                planeSectionBtn,
                originSelect,
                offsetSlider,
                offsetInput,
                yawSlider,
                yawInput,
                pitchSlider,
                pitchInput,
                alignCursorBtn,
                flipBtn,
                hideBtn,
                resetBtn,
                panelResetBtn,
                closeBtn,
                boxToggle,
                boxSectionBtn,
                boxAnchor,
                boxScaleSlider,
                boxScaleInput,
                boxYawSlider,
                boxYawInput,
                boxPitchSlider,
                boxPitchInput,
                boxHideBtn,
                boxAlignCursorBtn,
                boxFlipBtn,
                boxResetBtn
            } = this.controls;

            const syncRangeNumber = (slider, input, onChange) => {
                if (!slider || !input) return;
                slider.addEventListener('input', () => {
                    input.value = slider.value;
                    onChange(parseFloat(slider.value));
                });
                input.addEventListener('change', () => {
                    let value = parseFloat(input.value);
                    if (isNaN(value)) value = 0;
                    slider.value = value;
                    onChange(value);
                });
            };

            const setupSliderReset = (slider, input, defaultValue, onReset) => {
                if (!slider) return;
                slider.addEventListener('dblclick', () => {
                    const value = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
                    slider.value = value;
                    if (input) {
                        input.value = value;
                    }
                    onReset(parseFloat(value));
                });
            };

            if (planeToggle) {
                planeToggle.addEventListener('change', () => {
                    this.setPlaneEnabled(planeToggle.checked);
                });
            }

            if (planeSectionBtn) {
                planeSectionBtn.addEventListener('click', () => {
                    this.setPlaneSectionActive(!this.planeSectionActive);
                });
            }

            if (originSelect) {
                originSelect.addEventListener('change', () => {
                    this.planeOriginMode = originSelect.value;
                    this._updatePlaneFromState();
                });
            }

            const handleOffsetChange = (value) => {
                this.planeOffset = clamp(value, -1000, 1000);
                this._updatePlaneFromState();
            };

            const handleYawChange = (value) => {
                this.planeYaw = wrapDegrees(value);
                this._updatePlaneFromState();
            };

            const handlePitchChange = (value) => {
                this.planePitch = clamp(value, -89, 89);
                this._updatePlaneFromState();
            };

            syncRangeNumber(offsetSlider, offsetInput, handleOffsetChange);

            syncRangeNumber(yawSlider, yawInput, handleYawChange);

            syncRangeNumber(pitchSlider, pitchInput, handlePitchChange);

            setupSliderReset(offsetSlider, offsetInput, 0, handleOffsetChange);
            setupSliderReset(yawSlider, yawInput, 0, handleYawChange);
            setupSliderReset(pitchSlider, pitchInput, 0, handlePitchChange);

            if (alignCursorBtn) {
                alignCursorBtn.addEventListener('click', () => this.alignPlaneToCursor());
            }

            if (flipBtn) {
                flipBtn.addEventListener('click', () => this.flipPlane());
            }

            if (hideBtn) {
                hideBtn.addEventListener('click', () => this.togglePlaneVisibility());
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.resetPlaneSettings());
            }

            if (panelResetBtn) {
                panelResetBtn.addEventListener('click', () => this.resetAll());
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hidePanel());
            }

            if (boxToggle) {
                boxToggle.addEventListener('change', () => this.setBoxEnabled(boxToggle.checked));
            }

            if (boxSectionBtn) {
                boxSectionBtn.addEventListener('click', () => {
                    this.setBoxSectionActive(!this.boxSectionActive);
                });
            }

            if (boxAnchor) {
                boxAnchor.addEventListener('change', () => {
                    this.boxCenterMode = boxAnchor.value;
                    this._boxInitialized = true;
                    if (this.boxEnabled) {
                        this._updateBoxFromState();
                    }
                });
            }

            const handleBoxScaleChange = (value) => {
                this.boxScale = Math.max(0.01, parseFloat(value) || 1.0);
                this._updateBoxFromState();
            };

            const handleBoxYawChange = (value) => {
                this.boxYaw = wrapDegrees(value);
                this._updateBoxFromState();
            };

            const handleBoxPitchChange = (value) => {
                this.boxPitch = clamp(value, -89, 89);
                this._updateBoxFromState();
            };

            if (boxScaleSlider && boxScaleInput) {
                syncRangeNumber(boxScaleSlider, boxScaleInput, handleBoxScaleChange);
                setupSliderReset(boxScaleSlider, boxScaleInput, 1.0, handleBoxScaleChange);
                }

            if (boxYawSlider && boxYawInput) {
                syncRangeNumber(boxYawSlider, boxYawInput, handleBoxYawChange);
                setupSliderReset(boxYawSlider, boxYawInput, 0, handleBoxYawChange);
            }

            if (boxPitchSlider && boxPitchInput) {
                syncRangeNumber(boxPitchSlider, boxPitchInput, handleBoxPitchChange);
                setupSliderReset(boxPitchSlider, boxPitchInput, 0, handleBoxPitchChange);
            }

            if (boxHideBtn) {
                boxHideBtn.addEventListener('click', () => this.toggleBoxVisibility());
            }

            if (boxAlignCursorBtn) {
                boxAlignCursorBtn.addEventListener('click', () => this.alignBoxToCursor());
            }

            if (boxFlipBtn) {
                boxFlipBtn.addEventListener('click', () => this.flipBox());
            }

            if (boxResetBtn) {
                boxResetBtn.addEventListener('click', () => this.resetBoxSettings());
            }

            if (this.panelHeaderEl) {
                this.panelHeaderEl.addEventListener('mousedown', (event) => this._startPanelDrag(event));
            }
        }

        _startPanelDrag(event) {
            if (event.button !== 0 || !this.panelEl) return;
            if (event.target.closest('.section-panel-actions')) return;

            const rect = this.panelEl.getBoundingClientRect();
            this._dragState = {
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top
            };

            const moveHandler = (e) => this._onPanelDrag(e);
            const upHandler = () => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
                this._dragState = null;
            };

            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        }

        _onPanelDrag(event) {
            if (!this._dragState || !this.panelEl) return;

            const container = document.getElementById('container');
            const bounds = container ? container.getBoundingClientRect() : document.body.getBoundingClientRect();

            let left = event.clientX - this._dragState.offsetX;
            let top = event.clientY - this._dragState.offsetY;

            left = clamp(left, bounds.left + 10, bounds.right - this.panelEl.offsetWidth - 10);
            top = clamp(top, bounds.top + 10, bounds.bottom - this.panelEl.offsetHeight - 10);

            this.panelEl.style.left = `${left}px`;
            this.panelEl.style.top = `${top}px`;
        }

        togglePanel(forceState) {
            if (!this.panelEl) return;
            const shouldShow = typeof forceState === 'boolean'
                ? forceState
                : !this.panelEl.classList.contains('visible');

            if (shouldShow) {
                this.panelEl.classList.add('visible');
                this.panelEl.setAttribute('aria-hidden', 'false');
            } else {
                this.panelEl.classList.remove('visible');
                this.panelEl.setAttribute('aria-hidden', 'true');
            }
            this._updateButtonState();
        }

        isPanelVisible() {
            return this.panelEl ? this.panelEl.classList.contains('visible') : false;
        }

        hidePanel() {
            this.togglePanel(false);
        }

        _ensureHelpers() {
            if (!this.viewer || !this.viewer.scene) return;

            if (!this.planeHelper) {
                this.planeHelper = new THREE.PlaneHelper(this.sectionPlane, 1.5, 0xff8c00);
                this.planeHelper.visible = false;
                this.planeHelper.renderOrder = 900;
                this.viewer.scene.add(this.planeHelper);
            }

            if (!this.boxHelper) {
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const edges = new THREE.EdgesGeometry(geometry);
                const material = new THREE.LineBasicMaterial({ color: 0x6666FF });
                this.boxHelper = new THREE.LineSegments(edges, material);
                this.boxHelper.visible = false;
                this.viewer.scene.add(this.boxHelper);
            }
        }

        setPlaneEnabled(value) {
            this.planeEnabled = !!value;
            if (!this.planeEnabled) {
                this.planeSectionActive = false;
            }
            this._updateDynamicRanges();
            this._updatePlaneFromState();
            this._updateRendererClipping();
            this._updateUIState();
        }

        setPlaneSectionActive(value) {
            if (!this.planeEnabled) return;
            this.planeSectionActive = !!value;
            this._updateRendererClipping();
            this._updateUIState();
        }

        setBoxEnabled(value) {
            this.boxEnabled = !!value;
            if (!this.boxEnabled) {
                this.boxSectionActive = false;
            } else {
                if (!this._boxInitialized) {
                    this._initializeBoxFromBounds();
                }
                this._updateBoxFromState();
            }
                this._updateRendererClipping();
            this._updateBoxHelper();
            this._updateUIState();
        }

        setBoxSectionActive(value) {
            if (!this.boxEnabled) return;
            this.boxSectionActive = !!value;
            this._updateRendererClipping();
            this._updateUIState();
        }

        toggleBoxVisibility() {
            this.boxHidden = !this.boxHidden;
            this._updateBoxHelper();
            if (this.controls.boxHideBtn) {
                this.controls.boxHideBtn.textContent = this.boxHidden ? 'Show Box' : 'Hide Box';
            }
        }

        alignBoxToCursor() {
            if (!this.viewer || !this.viewer.cursor3DPosition) {
                console.warn('3D cursor not available');
                return;
            }
            this.boxCenterMode = 'cursor';
            if (this.controls.boxAnchor) {
                this.controls.boxAnchor.value = 'cursor';
            }
            this._updateBoxFromState();
        }

        flipBox() {
            this.boxYaw = wrapDegrees(this.boxYaw + 180);
            this.boxPitch = -this.boxPitch;
            this._updateBoxInputs();
            this._updateBoxFromState();
        }

        resetBoxSettings() {
            this.boxScale = 1.0;
            this.boxYaw = 0;
            this.boxPitch = 0;
            this.boxCenterMode = 'world';
            if (this.controls.boxAnchor) {
                this.controls.boxAnchor.value = 'world';
            }
            this._updateBoxInputs();
            this._updateBoxFromState();
        }

        alignPlaneToCursor() {
            if (!this.viewer || !this.viewer.cursor3DPosition) {
                console.warn('3D cursor not available');
                return;
            }
            this.planeOriginMode = 'cursor';
            if (this.controls.originSelect) {
                this.controls.originSelect.value = 'cursor';
            }
            this.planeOffset = 0;
            this._syncInputsFromState();
            this._updatePlaneFromState();
        }

        flipPlane() {
            this.planeYaw = wrapDegrees(this.planeYaw + 180);
            this.planePitch = -this.planePitch;
            this.planeOffset = -this.planeOffset;
            this._syncInputsFromState();
            this._updatePlaneFromState();
        }

        togglePlaneVisibility() {
            this.planeHidden = !this.planeHidden;
            if (this.planeHelper) {
                this.planeHelper.visible = this.planeEnabled && !this.planeHidden;
            }
            if (this.controls.hideBtn) {
                this.controls.hideBtn.textContent = this.planeHidden ? 'Show Plane' : 'Hide Plane';
            }
        }

        resetPlaneSettings() {
            this.planeOriginMode = 'world';
            this.planeYaw = 0;
            this.planePitch = 0;
            this.planeOffset = 0;
            if (this.controls.originSelect) {
                this.controls.originSelect.value = 'world';
            }
            this._syncInputsFromState();
            this._updatePlaneFromState();
        }

        resetAll() {
            this.setPlaneEnabled(false);
            this.setBoxEnabled(false);
            this.planeSectionActive = false;
            this.boxSectionActive = false;
            this.resetPlaneSettings();
            this.boxScale = 1.0;
            this.boxYaw = 0;
            this.boxPitch = 0;
            this._boxInitialized = false;
        }

        _updateBoxFromState() {
            if (!this.boxEnabled) {
                if (this.boxHelper) {
                    this.boxHelper.visible = false;
                }
                this._updateRendererClipping();
                return;
            }

            // Calculate rotated and scaled box size
            const yawRad = THREE.MathUtils.degToRad(this.boxYaw);
            const pitchRad = THREE.MathUtils.degToRad(this.boxPitch);
            
            // Apply scale to base size
            const scaledSize = this.boxBaseSize.clone().multiplyScalar(this.boxScale);
            this.boxSize.copy(scaledSize);

            this._resolveBoxCenter();
            this._updateBoxPlanes();
            this._updateRendererClipping();
            this._updateBoxHelper();
            
            // Update rotation pivot indicator after section box changes
            if (this.viewer && typeof this.viewer.updateRotationPivotIndicator === 'function') {
                this.viewer.updateRotationPivotIndicator();
            }
        }


        _resolveBoxCenter() {
            if (this.boxCenterMode === 'cursor' && this.viewer.cursor3DPosition) {
                this.boxCenter.copy(this.viewer.cursor3DPosition);
                return;
            }
            // Default world origin (bounds option removed)
            this.boxCenter.set(0, 0, 0);
        }

        _updatePlaneFromState() {
            if (!this.planeEnabled) {
                if (this.planeHelper) {
                    this.planeHelper.visible = false;
                }
                this._updateRendererClipping();
                return;
            }

            const yawRad = THREE.MathUtils.degToRad(this.planeYaw);
            const pitchRad = THREE.MathUtils.degToRad(this.planePitch);

            const normal = new THREE.Vector3(
                Math.cos(yawRad) * Math.cos(pitchRad),
                Math.sin(pitchRad),
                Math.sin(yawRad) * Math.cos(pitchRad)
            ).normalize();

            let anchor = new THREE.Vector3(0, 0, 0);
            if (this.planeOriginMode === 'cursor' && this.viewer.cursor3DPosition) {
                anchor = this.viewer.cursor3DPosition.clone();
            }

            const clampedOffset = clamp(this.planeOffset, -this.planeOffsetLimit, this.planeOffsetLimit);
            this.planeOffset = clampedOffset;

            const pointOnPlane = anchor.clone().addScaledVector(normal, clampedOffset);
            this.sectionPlane.setFromNormalAndCoplanarPoint(normal, pointOnPlane);

            if (this.planeHelper) {
                this.planeHelper.visible = !this.planeHidden;
                this.planeHelper.size = Math.max(1, this._estimateSceneScale());
                this.planeHelper.updateMatrixWorld(true);
            }

            this._updateRendererClipping();
            
            // Update rotation pivot indicator after section plane changes
            if (this.viewer && typeof this.viewer.updateRotationPivotIndicator === 'function') {
                this.viewer.updateRotationPivotIndicator();
            }
        }

        _estimateSceneScale() {
            if (!this.viewer || !this.viewer.loadedModels || this.viewer.loadedModels.length === 0) {
                return 1;
            }
            const bounds = this.viewer._computeBoundingInfo
                ? this.viewer._computeBoundingInfo({ visibleOnly: true })
                : null;
            if (!bounds) return 1;
            const size = bounds.box.getSize(new THREE.Vector3());
            return Math.max(size.x, size.y, size.z) || 1;
        }

        _updateBoxPlanes() {
            const half = this.boxSize.clone().multiplyScalar(0.5);
            const cx = this.boxCenter.x;
            const cy = this.boxCenter.y;
            const cz = this.boxCenter.z;

            // Create rotation matrix for box orientation
            const yawRad = THREE.MathUtils.degToRad(this.boxYaw);
            const pitchRad = THREE.MathUtils.degToRad(this.boxPitch);
            const euler = new THREE.Euler(pitchRad, yawRad, 0, 'YXZ');
            const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);

            // Local axis directions (before rotation) - normals pointing INWARD
            const localAxes = [
                new THREE.Vector3(-1, 0, 0),   // +X face (normal inward)
                new THREE.Vector3(1, 0, 0),    // -X face (normal inward)
                new THREE.Vector3(0, -1, 0),   // +Y face (normal inward)
                new THREE.Vector3(0, 1, 0),    // -Y face (normal inward)
                new THREE.Vector3(0, 0, -1),   // +Z face (normal inward)
                new THREE.Vector3(0, 0, 1)     // -Z face (normal inward)
            ];

            // Local offset points (before rotation)
            const localOffsets = [
                new THREE.Vector3(half.x, 0, 0),      // +X face
                new THREE.Vector3(-half.x, 0, 0),    // -X face
                new THREE.Vector3(0, half.y, 0),      // +Y face
                new THREE.Vector3(0, -half.y, 0),    // -Y face
                new THREE.Vector3(0, 0, half.z),     // +Z face
                new THREE.Vector3(0, 0, -half.z)     // -Z face
            ];

            // Transform axes and points to world space
            for (let i = 0; i < 6; i++) {
                const worldNormal = localAxes[i].clone().applyMatrix4(rotationMatrix).normalize();
                const worldPoint = this.boxCenter.clone().add(localOffsets[i].applyMatrix4(rotationMatrix));
                this.boxPlanes[i].setFromNormalAndCoplanarPoint(worldNormal, worldPoint);
            }
        }

        _updateBoxHelper() {
            if (!this.boxHelper) return;
            this.boxHelper.visible = this.boxEnabled && !this.boxHidden;
            this.boxHelper.scale.copy(this.boxSize);
            this.boxHelper.position.copy(this.boxCenter);
            
            // Apply rotation
            this.boxHelper.rotation.set(
                THREE.MathUtils.degToRad(this.boxPitch),
                THREE.MathUtils.degToRad(this.boxYaw),
                0
            );
            
            this.boxHelper.updateMatrixWorld(true);
        }

        _updateRendererClipping() {
            if (!this.renderer) return;
            const planes = [];
            if (this.planeEnabled && this.planeSectionActive) {
                planes.push(this.sectionPlane);
            }
            if (this.boxEnabled && this.boxSectionActive) {
                planes.push(...this.boxPlanes);
            }
            this.renderer.localClippingEnabled = planes.length > 0;
            this.renderer.clippingPlanes = planes;

            if (this.viewer && this.viewer.scene) {
                this.viewer.scene.traverse((child) => {
                    if (!child.isMesh || !child.material) return;
                    const applyMaterial = (material) => {
                        // For box, use clipIntersection=false to show only what's inside ALL planes
                        // For plane, clipIntersection doesn't matter (single plane)
                        material.clipIntersection = false; // Show only inside all planes
                        material.clippingPlanes = null;
                        material.needsUpdate = true;
                    };
                    if (Array.isArray(child.material)) {
                        child.material.forEach(applyMaterial);
                    } else {
                        applyMaterial(child.material);
                    }
                });
            }
        }

        _syncInputsFromState() {
            const { offsetSlider, offsetInput, yawSlider, yawInput, pitchSlider, pitchInput } = this.controls;
            if (offsetSlider) offsetSlider.value = this.planeOffset;
            if (offsetInput) offsetInput.value = this.planeOffset;
            if (yawSlider) yawSlider.value = this.planeYaw;
            if (yawInput) yawInput.value = this.planeYaw;
            if (pitchSlider) pitchSlider.value = this.planePitch;
            if (pitchInput) pitchInput.value = this.planePitch;
        }

        _updateUIState() {
            if (this.controls.planeToggle) {
                this.controls.planeToggle.checked = this.planeEnabled;
            }
            if (this.controls.planeSectionBtn) {
                this.controls.planeSectionBtn.disabled = !this.planeEnabled;
                this.controls.planeSectionBtn.textContent = this.planeSectionActive ? 'Disable Section' : 'Section';
                this.controls.planeSectionBtn.classList.toggle('active', this.planeSectionActive);
            }
            if (this.controls.boxToggle) {
                this.controls.boxToggle.checked = this.boxEnabled;
            }
            if (this.controls.boxSectionBtn) {
                this.controls.boxSectionBtn.disabled = !this.boxEnabled;
                this.controls.boxSectionBtn.textContent = this.boxSectionActive ? 'Disable Section' : 'Section';
                this.controls.boxSectionBtn.classList.toggle('active', this.boxSectionActive);
            }
            if (this.controls.hideBtn) {
                this.controls.hideBtn.textContent = this.planeHidden ? 'Show Plane' : 'Hide Plane';
            }
            if (this.controls.boxHideBtn) {
                this.controls.boxHideBtn.textContent = this.boxHidden ? 'Show Box' : 'Hide Box';
            }
            this._updateButtonState();
        }

        _updateButtonState() {
            if (!this.topButton) return;
            const visible = this.isPanelVisible();
            if (visible) {
                this.topButton.classList.add('active');
            } else {
                this.topButton.classList.remove('active');
            }
            this.topButton.setAttribute('aria-pressed', visible ? 'true' : 'false');
        }

        _updateAll() {
            this._updateDynamicRanges();
            this._syncInputsFromState();
            this._updatePlaneFromState();
            this._updateRendererClipping();
            this._updateUIState();
        }

        _getBoundsInfo() {
            if (!this.viewer || typeof this.viewer._computeBoundingInfo !== 'function') {
                return null;
            }
            return this.viewer._computeBoundingInfo({ visibleOnly: true });
        }

        _updateDynamicRanges() {
            const bounds = this._getBoundsInfo();
            let sceneScale = 1;
            if (bounds) {
                const size = bounds.box.getSize(new THREE.Vector3());
                sceneScale = Math.max(size.x, size.y, size.z, 0.01);
            }
            const limit = Math.max(0.05, sceneScale * 1.2);
            this.planeOffsetLimit = limit;

            const sliderStep = Math.max(limit / 200, 0.001);

            if (this.controls.offsetSlider) {
                this.controls.offsetSlider.min = (-limit).toFixed(3);
                this.controls.offsetSlider.max = limit.toFixed(3);
                this.controls.offsetSlider.step = sliderStep.toFixed(3);
            }
            if (this.controls.offsetInput) {
                this.controls.offsetInput.min = (-limit).toFixed(3);
                this.controls.offsetInput.max = limit.toFixed(3);
                this.controls.offsetInput.step = sliderStep.toFixed(3);
            }

            this.planeOffset = clamp(this.planeOffset, -limit, limit);
            if (this.controls.offsetSlider) {
                this.controls.offsetSlider.value = this.planeOffset;
            }
            if (this.controls.offsetInput) {
                this.controls.offsetInput.value = this.planeOffset;
            }
        }

        _initializeBoxFromBounds() {
            const bounds = this._getBoundsInfo();
            if (!bounds) {
                this.boxBaseSize.set(0.1, 0.1, 0.1);
                this.boxSize.set(0.1, 0.1, 0.1);
                this.boxScale = 1.0;
                this.boxCenter.set(0, 0, 0);
                this.boxCenterMode = 'world';
                this._updateBoxInputs();
                return false;
            }

            const size = bounds.box.getSize(new THREE.Vector3());
            const maxSize = Math.max(size.x, size.y, size.z);
            // Use a reasonable base size: 50% of model size, but at least 0.01 and at most 10
            const baseSize = Math.max(0.01, Math.min(maxSize * 0.5, 10));

            this.boxBaseSize.set(baseSize, baseSize, baseSize);
            this.boxScale = 1.0;
            this.boxSize.copy(this.boxBaseSize);
            this.boxCenter.copy(bounds.center);
            this.boxCenterMode = 'world';
            this._boxInitialized = true;
            this._updateBoxInputs();
            return true;
        }

        _updateBoxInputs() {
            if (this.controls.boxScaleSlider) this.controls.boxScaleSlider.value = this.boxScale;
            if (this.controls.boxScaleInput) this.controls.boxScaleInput.value = this.boxScale.toFixed(3);
            if (this.controls.boxYawSlider) this.controls.boxYawSlider.value = this.boxYaw;
            if (this.controls.boxYawInput) this.controls.boxYawInput.value = this.boxYaw;
            if (this.controls.boxPitchSlider) this.controls.boxPitchSlider.value = this.boxPitch;
            if (this.controls.boxPitchInput) this.controls.boxPitchInput.value = this.boxPitch;
            if (this.controls.boxAnchor) this.controls.boxAnchor.value = this.boxCenterMode;
        }

        onSceneBoundsChanged() {
            this._boxInitialized = false;
            this._updateDynamicRanges();
            if (this.boxEnabled) {
                this._initializeBoxFromBounds();
                this._updateBoxFromState();
            }
        }
    }

    GLTFViewer.prototype.initSectionManager = function() {
        if (!this.sectionManager) {
            this.sectionManager = new SectionPlaneManager(this);
            if (typeof this.sectionManager.onSceneBoundsChanged === 'function') {
                this.sectionManager.onSceneBoundsChanged();
            }
        } else {
            this.sectionManager.refresh();
        }
    };

    const ensureSectionManager = () => {
        if (window.viewer && typeof window.viewer.initSectionManager === 'function') {
            window.viewer.initSectionManager();
        }
    };

    window.toggleSectionPlanePanel = function() {
        ensureSectionManager();
        if (window.viewer && window.viewer.sectionManager) {
            window.viewer.sectionManager.togglePanel();
        }
    };
})();

