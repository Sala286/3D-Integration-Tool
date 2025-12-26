/**
 * GLTF Viewer - Material Manager Module
 * Handles color creation, template import, part selection, and color export
 */
(function() {
    if (typeof GLTFViewer === 'undefined' || typeof THREE === 'undefined') {
        return;
    }

    class MaterialManager {
        constructor(viewer) {
            this.viewer = viewer;
            this.colors = []; // Array of {name, r, g, b, alpha}
            this.partColors = new Map(); // Map of part UUID -> color name
            this.selectedPart = null;
            this.selectedPartUUID = null;
            this.editingColorIndex = null; // Index of color being edited

            this.panelEl = document.getElementById('material-panel');
            this.panelHeaderEl = document.getElementById('material-panel-header');
            this.topButton = document.getElementById('material-btn');

            this._cacheControls();
            this._bindUI();
            // Load default material template colors directly from code
            this._loadDefaultTemplateColors();
            // Don't load colors from storage on initialization - only load when model is loaded
            // This prevents showing previous file's colors when browser is just opened
            this._extractMaterialsFromScene();
            this._updateColorList();
        }
        
        /**
         * Load default material template colors directly from code (from material-template.csv)
         */
        _loadDefaultTemplateColors() {
            // Material template colors from dist/material-template.csv
            const templateColors = [
                { name: 'MS01', r: 207, g: 51, b: 51, alpha: 100 },
                { name: 'MS02', r: 178, g: 178, b: 178, alpha: 100 },
                { name: 'MS03', r: 153, g: 153, b: 153, alpha: 100 },
                { name: 'MS04', r: 21, g: 21, b: 21, alpha: 100 },
                { name: 'MS05', r: 10, g: 10, b: 10, alpha: 100 },
                { name: 'MS06', r: 6, g: 153, b: 4, alpha: 100 },
                { name: 'MS07', r: 217, g: 69, b: 8, alpha: 100 },
                { name: 'MS08', r: 102, g: 102, b: 204, alpha: 100 },
                { name: 'MS09', r: 5, g: 36, b: 178, alpha: 100 },
                { name: 'MS10', r: 13, g: 59, b: 153, alpha: 100 },
                { name: 'MS11', r: 7, g: 145, b: 204, alpha: 100 },
                { name: 'MS12', r: 79, g: 74, b: 28, alpha: 100 },
                { name: 'MS13', r: 43, g: 13, b: 4, alpha: 100 },
                { name: 'MS14', r: 204, g: 153, b: 102, alpha: 100 },
                { name: 'MS15', r: 125, g: 26, b: 12, alpha: 100 },
                { name: 'MS16', r: 97, g: 71, b: 38, alpha: 100 },
                { name: 'MS17', r: 209, g: 184, b: 19, alpha: 100 },
                { name: 'MS18', r: 51, g: 120, b: 6, alpha: 100 },
                { name: 'MS19', r: 112, g: 194, b: 36, alpha: 100 },
                { name: 'MS20', r: 13, g: 51, b: 51, alpha: 100 },
                { name: 'MS21', r: 191, g: 33, b: 140, alpha: 100 },
                { name: 'MS22', r: 209, g: 115, b: 11, alpha: 100 },
                { name: 'MS23', r: 30, g: 194, b: 106, alpha: 100 },
                { name: 'MS24', r: 130, g: 33, b: 191, alpha: 100 },
                { name: 'MS25', r: 161, g: 54, b: 66, alpha: 100 },
                { name: 'MS26', r: 31, g: 135, b: 135, alpha: 100 },
                { name: 'MS27', r: 204, g: 110, b: 41, alpha: 100 },
                { name: 'MS28', r: 35, g: 143, b: 84, alpha: 100 },
                { name: 'MS29', r: 37, g: 148, b: 201, alpha: 100 },
                { name: 'MS30', r: 112, g: 2, b: 2, alpha: 100 },
                { name: 'MS31', r: 13, g: 71, b: 42, alpha: 100 },
                { name: 'MS32', r: 117, g: 40, b: 48, alpha: 100 },
                { name: 'MS33', r: 125, g: 153, b: 87, alpha: 100 },
                { name: 'MS34', r: 204, g: 204, b: 184, alpha: 100 },
                { name: 'MS35', r: 204, g: 204, b: 204, alpha: 100 },
                { name: 'MS36', r: 3, g: 13, b: 46, alpha: 100 },
                { name: 'MS37', r: 36, g: 97, b: 100, alpha: 100 },
                { name: 'MS38', r: 84, g: 92, b: 107, alpha: 100 },
                { name: 'MS39', r: 71, g: 66, b: 97, alpha: 100 },
                { name: 'MS40', r: 105, g: 110, b: 130, alpha: 100 },
                { name: 'MS41', r: 107, g: 107, b: 117, alpha: 100 },
                { name: 'MS42', r: 74, g: 84, b: 115, alpha: 100 },
                { name: 'MS43', r: 77, g: 59, b: 59, alpha: 100 }
            ];
            
            // Add template colors to colors array (only if they don't already exist)
            templateColors.forEach(color => {
                const exists = this.colors.some(c => c.name.toLowerCase() === color.name.toLowerCase());
                if (!exists) {
                    this.colors.push(color);
                }
            });
            
            // Sort colors by name for better organization
            this.colors.sort((a, b) => {
                // Extract numbers from names for natural sorting (MS01, MS02, MS10 instead of MS01, MS10, MS02)
                const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
                if (numA !== numB) {
                    return numA - numB;
                }
                return a.name.localeCompare(b.name);
            });
        }

        _cacheControls() {
            this.controls = {
                colorName: document.getElementById('material-color-name'),
                colorPicker: document.getElementById('material-color-picker'),
                colorAlpha: document.getElementById('material-color-alpha'),
                alphaValue: document.getElementById('material-alpha-value'),
                addColorBtn: document.getElementById('material-add-color-btn'),
                colorList: document.getElementById('material-color-list'),
                importTemplateBtn: document.getElementById('material-import-template-btn'),
                exportTemplateBtn: document.getElementById('material-export-template-btn'),
                csvSelectContainer: document.getElementById('material-csv-select-container'),
                csvFileInput: document.getElementById('material-csv-file'),
                selectedPartSpan: document.getElementById('material-selected-part'),
                partColorSelect: document.getElementById('material-part-color-select'),
                partColorSearch: document.getElementById('material-part-color-search'),
                partColorDropdownWrapper: document.getElementById('material-part-color-dropdown-wrapper'),
                partColorOptionsList: document.getElementById('material-part-color-options-list'),
                applyColorBtn: document.getElementById('material-apply-color-btn'),
                exportBtn: document.getElementById('material-export-btn'),
                bulkApplyBtn: document.getElementById('material-bulk-apply-btn'),
                closeBtn: document.getElementById('material-panel-close-btn'),
                colorWheel: document.getElementById('material-color-wheel'),
                colorSlider: document.getElementById('material-color-slider'),
                colorWheelIndicator: document.getElementById('material-color-wheel-indicator'),
                colorSliderIndicator: document.getElementById('material-color-slider-indicator'),
                colorPreview: document.getElementById('material-color-preview'),
                colorR: document.getElementById('material-color-r'),
                colorG: document.getElementById('material-color-g'),
                colorB: document.getElementById('material-color-b')
            };
            
            // Initialize color picker
            this._initColorWheel();
        }

        _initColorWheel() {
            const { colorWheel, colorSlider } = this.controls;
            if (!colorWheel || !colorSlider) return;

            // Initialize color wheel canvas
            this._drawColorWheel();
            
            // Store current HSV values
            this._currentHue = 0;
            this._currentSaturation = 100;
            this._currentValue = 100;
            
            // Draw initial slider
            this._updateColorSliderGradient();
            
            // Set initial color
            this._setColorFromHSVA(0, 100, 100, 100);
            
            // Bind events
            this._bindColorWheelEvents();
        }

        _drawColorWheel() {
            const { colorWheel } = this.controls;
            if (!colorWheel) return;
            
            const canvas = colorWheel;
            const ctx = canvas.getContext('2d');
            const size = canvas.width;
            const center = size / 2;
            const radius = center - 2;
            
            // Clear canvas
            ctx.clearRect(0, 0, size, size);
            
            // Draw color wheel
            for (let angle = 0; angle < 360; angle += 0.5) {
                for (let r = 0; r < radius; r += 1) {
                    const x = center + r * Math.cos(angle * Math.PI / 180);
                    const y = center + r * Math.sin(angle * Math.PI / 180);
                    
                    const hue = angle;
                    const saturation = (r / radius) * 100;
                    const value = 100;
                    
                    const rgb = this._hsvToRgb(hue, saturation, value);
                    ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }

        _updateColorSliderGradient() {
            const { colorSlider } = this.controls;
            if (!colorSlider) return;
            
            const canvas = colorSlider;
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            // Clear canvas
            ctx.clearRect(0, 0, width, height);
            
            // Get current hue and saturation (or defaults)
            const h = this._currentHue || 0;
            const s = this._currentSaturation || 100;
            
            // Draw gradient from full color (value=100) to black (value=0) for current hue/saturation
            const steps = height;
            for (let i = 0; i < steps; i++) {
                const value = 100 - (i / steps) * 100;
                const rgb = this._hsvToRgb(h, s, value);
                ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
                ctx.fillRect(0, i, width, 1);
            }
        }

        _hsvToRgb(h, s, v) {
            s /= 100;
            v /= 100;
            const c = v * s;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = v - c;
            let r, g, b;

            if (h >= 0 && h < 60) {
                r = c; g = x; b = 0;
            } else if (h >= 60 && h < 120) {
                r = x; g = c; b = 0;
            } else if (h >= 120 && h < 180) {
                r = 0; g = c; b = x;
            } else if (h >= 180 && h < 240) {
                r = 0; g = x; b = c;
            } else if (h >= 240 && h < 300) {
                r = x; g = 0; b = c;
            } else {
                r = c; g = 0; b = x;
            }

            return {
                r: Math.round((r + m) * 255),
                g: Math.round((g + m) * 255),
                b: Math.round((b + m) * 255)
            };
        }

        _rgbToHsv(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const diff = max - min;
            
            let h = 0;
            if (diff !== 0) {
                if (max === r) {
                    h = ((g - b) / diff) % 6;
                } else if (max === g) {
                    h = (b - r) / diff + 2;
                } else {
                    h = (r - g) / diff + 4;
                }
            }
            h = Math.round(h * 60);
            if (h < 0) h += 360;
            
            const s = max === 0 ? 0 : Math.round((diff / max) * 100);
            const v = Math.round(max * 100);
            
            return { h, s, v };
        }

        _setColorFromHSVA(h, s, v, a, updateWheel = true) {
            // Store current HSV values
            const oldHue = this._currentHue;
            const oldSat = this._currentSaturation;
            this._currentHue = h;
            this._currentSaturation = s;
            this._currentValue = v;
            
            // Update slider gradient when hue or saturation changes (but not when only value changes)
            const hueChanged = Math.abs((oldHue || 0) - (h || 0)) > 1;
            const satChanged = Math.abs((oldSat || 0) - (s || 0)) > 1;
            if (hueChanged || satChanged) {
                this._updateColorSliderGradient();
            }
            
            const rgb = this._hsvToRgb(h, s, v);
            
            // Only update wheel indicator if updateWheel is true (when wheel is moved, not when slider is moved)
            if (updateWheel) {
                this._updateColorIndicators(h, s, v);
            } else {
                // Only update slider indicator, keep wheel indicator at same position
                const { colorSlider, colorSliderIndicator } = this.controls;
                if (colorSlider && colorSliderIndicator) {
                    const sliderHeight = colorSlider.height;
                    const sliderY = sliderHeight - (v / 100) * sliderHeight;
                    colorSliderIndicator.style.top = sliderY + 'px';
                }
            }
            
            this._updateColorPreview(rgb.r, rgb.g, rgb.b, a);
            
            // Update hidden color input
            const { colorPicker } = this.controls;
            if (colorPicker) {
                const hex = '#' + [rgb.r, rgb.g, rgb.b]
                    .map(x => {
                        const hex = x.toString(16);
                        return hex.length === 1 ? '0' + hex : hex;
                    })
                    .join('');
                colorPicker.value = hex;
            }
        }

        _updateColorIndicators(h, s, v) {
            const { colorWheel, colorWheelIndicator, colorSlider, colorSliderIndicator } = this.controls;
            if (!colorWheel || !colorWheelIndicator || !colorSlider || !colorSliderIndicator) return;
            
            const wheelSize = colorWheel.width;
            const center = wheelSize / 2;
            const radius = center - 2;
            const distance = (s / 100) * radius;
            const angle = (h * Math.PI) / 180;
            
            const x = center + distance * Math.cos(angle);
            const y = center + distance * Math.sin(angle);
            
            colorWheelIndicator.style.left = x + 'px';
            colorWheelIndicator.style.top = y + 'px';
            
            const sliderHeight = colorSlider.height;
            const sliderY = sliderHeight - (v / 100) * sliderHeight;
            colorSliderIndicator.style.top = sliderY + 'px';
        }

        _updateColorPreview(r, g, b, a) {
            const { colorPreview, colorAlpha, colorR, colorG, colorB } = this.controls;
            if (!colorPreview) return;
            
            const alpha = colorAlpha ? colorAlpha.value / 100 : a / 100;
            colorPreview.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            
            // Update RGB inputs
            if (colorR) colorR.value = r;
            if (colorG) colorG.value = g;
            if (colorB) colorB.value = b;
        }

        _bindColorWheelEvents() {
            const { colorWheel, colorSlider } = this.controls;
            if (!colorWheel || !colorSlider) return;
            
            let isDraggingWheel = false;
            let isDraggingSlider = false;
            this._sliderValue = colorSlider.height * 0.2; // Initial value position
            
            // Color wheel events
            const handleWheelMove = (e) => {
                const rect = colorWheel.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const center = colorWheel.width / 2;
                const dx = x - center;
                const dy = y - center;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const radius = center - 2;
                
                if (distance <= radius) {
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const hue = (angle + 360) % 360;
                    const saturation = Math.min(100, (distance / radius) * 100);
                    
                    // Get current value from slider
                    const sliderRect = colorSlider.getBoundingClientRect();
                    const value = 100 - (this._sliderValue / sliderRect.height) * 100;
                    
                    this._setColorFromHSVA(hue, saturation, value, this.controls.colorAlpha ? this.controls.colorAlpha.value : 100);
                }
            };
            
            colorWheel.addEventListener('mousedown', (e) => {
                isDraggingWheel = true;
                handleWheelMove(e);
            });
            
            document.addEventListener('mousemove', (e) => {
                if (isDraggingWheel) {
                    handleWheelMove(e);
                } else if (isDraggingSlider) {
                    const rect = colorSlider.getBoundingClientRect();
                    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                    const value = 100 - (y / rect.height) * 100;
                    this._sliderValue = y;
                    
                    // Use stored hue and saturation, only change value (brightness)
                    // Pass false to updateWheel so wheel indicator doesn't move
                    this._setColorFromHSVA(
                        this._currentHue || 0, 
                        this._currentSaturation || 100, 
                        value, 
                        this.controls.colorAlpha ? this.controls.colorAlpha.value : 100,
                        false  // Don't update wheel indicator
                    );
                }
            });
            
            document.addEventListener('mouseup', () => {
                isDraggingWheel = false;
                isDraggingSlider = false;
            });
            
            // Color slider events
            colorSlider.addEventListener('mousedown', (e) => {
                isDraggingSlider = true;
                const rect = colorSlider.getBoundingClientRect();
                const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                const value = 100 - (y / rect.height) * 100;
                this._sliderValue = y;
                
                // Use stored hue and saturation, only change value (brightness)
                // Pass false to updateWheel so wheel indicator doesn't move
                this._setColorFromHSVA(
                    this._currentHue || 0, 
                    this._currentSaturation || 100, 
                    value, 
                    this.controls.colorAlpha ? this.controls.colorAlpha.value : 100,
                    false  // Don't update wheel indicator
                );
            });
            
            // Update preview when alpha changes
            const { colorAlpha, colorR, colorG, colorB } = this.controls;
            if (colorAlpha) {
                colorAlpha.addEventListener('input', () => {
                    const { colorPicker } = this.controls;
                    if (colorPicker) {
                        const hex = colorPicker.value;
                        const r = parseInt(hex.substr(1, 2), 16);
                        const g = parseInt(hex.substr(3, 2), 16);
                        const b = parseInt(hex.substr(5, 2), 16);
                        this._updateColorPreview(r, g, b, colorAlpha.value);
                    }
                });
            }
            
            // Update color when RGB inputs change
            if (colorR && colorG && colorB) {
                const updateFromRGB = () => {
                    const r = Math.max(0, Math.min(255, parseInt(colorR.value) || 0));
                    const g = Math.max(0, Math.min(255, parseInt(colorG.value) || 0));
                    const b = Math.max(0, Math.min(255, parseInt(colorB.value) || 0));
                    
                    // Update color picker
                    const { colorPicker } = this.controls;
                    if (colorPicker) {
                        const hex = '#' + [r, g, b]
                            .map(x => {
                                const hex = x.toString(16);
                                return hex.length === 1 ? '0' + hex : hex;
                            })
                            .join('');
                        colorPicker.value = hex;
                    }
                    
                    // Update color wheel
                    const hsv = this._rgbToHsv(r, g, b);
                    this._setColorFromHSVA(hsv.h, hsv.s, hsv.v, colorAlpha ? colorAlpha.value : 100);
                };
                
                colorR.addEventListener('input', updateFromRGB);
                colorR.addEventListener('change', updateFromRGB);
                colorG.addEventListener('input', updateFromRGB);
                colorG.addEventListener('change', updateFromRGB);
                colorB.addEventListener('input', updateFromRGB);
                colorB.addEventListener('change', updateFromRGB);
            }
        }

        _bindUI() {
            if (!this.controls || !this.panelEl) {
                return;
            }

            const {
                colorName,
                colorPicker,
                colorAlpha,
                alphaValue,
                addColorBtn,
                importTemplateBtn,
                exportTemplateBtn,
                csvFileInput,
                partColorSelect,
                applyColorBtn,
                exportBtn,
                closeBtn
            } = this.controls;

            if (colorAlpha && alphaValue) {
                colorAlpha.addEventListener('input', () => {
                    alphaValue.textContent = `${colorAlpha.value}%`;
                });
            }

            if (addColorBtn) {
                addColorBtn.addEventListener('click', () => this._addColor());
            }

            if (importTemplateBtn) {
                importTemplateBtn.addEventListener('click', () => {
                    // Directly request CSV selection from desktop app (no intermediate button)
                    this._requestCSVSelection();
                });
            }

            if (exportTemplateBtn) {
                exportTemplateBtn.addEventListener('click', () => this._exportTemplate());
            }

            if (csvFileInput) {
                csvFileInput.addEventListener('change', (e) => this._handleCSVImport(e));
            }

            // Setup search functionality for color dropdown
            const partColorSearch = this.controls.partColorSearch;
            const dropdownWrapper = this.controls.partColorDropdownWrapper;
            const optionsList = this.controls.partColorOptionsList;
            
            if (partColorSearch && partColorSelect) {
                // Show custom dropdown when select is focused/clicked
                if (partColorSelect && dropdownWrapper) {
                    partColorSelect.addEventListener('focus', () => {
                        if (!partColorSelect.disabled) {
                            this._showCustomDropdown();
                        }
                    });
                    
                    partColorSelect.addEventListener('click', () => {
                        if (!partColorSelect.disabled) {
                            this._showCustomDropdown();
                        }
                    });
                }
                
                partColorSearch.addEventListener('input', (e) => this._filterColorDropdown(e.target.value));
                
                // When user types and presses Enter, select first matching option
                partColorSearch.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const filteredOptions = Array.from(partColorSelect.options).filter(opt => 
                            opt.value && opt.style.display !== 'none' && 
                            opt.textContent.toLowerCase().includes(partColorSearch.value.toLowerCase())
                        );
                        if (filteredOptions.length > 0) {
                            partColorSelect.value = filteredOptions[0].value;
                            partColorSearch.value = filteredOptions[0].textContent;
                            partColorSelect.dispatchEvent(new Event('change'));
                            this._hideCustomDropdown();
                            if (this.controls.applyColorBtn) {
                                this.controls.applyColorBtn.disabled = false;
                            }
                        }
                    }
                });
                
                // Hide dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (dropdownWrapper && !dropdownWrapper.contains(e.target) && e.target !== partColorSelect) {
                        this._hideCustomDropdown();
                    }
                });
            }

            if (applyColorBtn) {
                applyColorBtn.addEventListener('click', () => this._applyColorToPart());
            }

            if (exportBtn) {
                exportBtn.addEventListener('click', () => this._exportPartListCSV());
            }

            if (this.controls.bulkApplyBtn) {
                this.controls.bulkApplyBtn.addEventListener('click', () => this._bulkApplyFromCSV());
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hidePanel());
            }

            if (this.panelHeaderEl) {
                this.panelHeaderEl.addEventListener('mousedown', (event) => this._startPanelDrag(event));
            }

            // Listen for part selection from viewer
            // Check for part selection periodically or use a custom event
            this._setupPartSelectionListener();
        }

        _setupPartSelectionListener() {
            // Check for part selection changes periodically
            let lastSelectedUUID = null;
            setInterval(() => {
                if (this.viewer && this.viewer.selectedPartUUIDs && this.viewer.selectedPartUUIDs.length > 0) {
                    const selectedUUID = this.viewer.selectedPartUUIDs[0];
                    const part = this.viewer.partsList ? this.viewer.partsList.find(p => p.uuid === selectedUUID) : null;
                    const partName = part ? part.name : null;
                    
                    if (selectedUUID !== lastSelectedUUID) {
                        lastSelectedUUID = selectedUUID;
                        this._onPartSelected(partName, selectedUUID);
                    }
                } else if (lastSelectedUUID !== null) {
                    lastSelectedUUID = null;
                    this._onPartSelected(null, null);
                }
            }, 100);
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

            left = Math.max(bounds.left + 10, Math.min(left, bounds.right - this.panelEl.offsetWidth - 10));
            top = Math.max(bounds.top + 10, Math.min(top, bounds.bottom - this.panelEl.offsetHeight - 10));

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

        _addColor() {
            const { colorName, colorPicker, colorAlpha, addColorBtn } = this.controls;
            if (!colorName || !colorPicker || !colorAlpha) return;

            const name = colorName.value.trim();
            if (!name) {
                alert('Please enter a color name');
                return;
            }

            // Extract RGB from hex color
            const hex = colorPicker.value;
            const r = parseInt(hex.substr(1, 2), 16);
            const g = parseInt(hex.substr(3, 2), 16);
            const b = parseInt(hex.substr(5, 2), 16);
            const alpha = parseInt(colorAlpha.value);

            if (this.editingColorIndex !== null) {
                // Update existing color
                const oldColor = this.colors[this.editingColorIndex];
                const oldName = oldColor.name;
                
                // Check if new name conflicts with another color (excluding current one)
                const nameConflict = this.colors.some((c, idx) => 
                    idx !== this.editingColorIndex && c.name.toLowerCase() === name.toLowerCase()
                );
                
                if (nameConflict) {
                    alert('Color name already exists');
                    return;
                }

                // Update color definition only - do NOT automatically apply to parts
                // This prevents the bug where changing a color affects all parts that had the old color
                this.colors[this.editingColorIndex] = { name, r, g, b, alpha };

                // If color name changed, update the partColors mapping to use new name
                // But do NOT automatically apply the new color values to those parts
                // Users must explicitly apply colors to parts - this prevents unwanted bulk updates
                if (oldName !== name) {
                this.partColors.forEach((colorName, partUUID) => {
                        if (colorName === oldName) {
                            // Update the color name reference, but don't apply the new color values
                            this.partColors.set(partUUID, name);
                    }
                });
                }

                this.editingColorIndex = null;
                if (addColorBtn) {
                    addColorBtn.textContent = 'Add Color';
                }
            } else {
                // Add new color
                // Check if color name already exists
                if (this.colors.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                    alert('Color name already exists');
                    return;
                }

                this.colors.push({ name, r, g, b, alpha });
            }

            this._saveColorsToStorage();
            this._updateColorList();
            this._updatePartColorSelect();

            // Reset form
            colorName.value = '';
            colorPicker.value = '#ff0000';
            colorAlpha.value = 100;
            if (this.controls.alphaValue) {
                this.controls.alphaValue.textContent = '100%';
            }
            // Reset color wheel to red
            this._setColorFromHSVA(0, 100, 100, 100);
        }

        _updateColorList() {
            const { colorList } = this.controls;
            if (!colorList) return;

            if (this.colors.length === 0) {
                colorList.innerHTML = '<p class="section-helper-text" style="text-align: center; color: #999;">No colors added yet</p>';
                return;
            }

            colorList.innerHTML = this.colors.map((color, index) => {
                const rgba = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.alpha / 100})`;
                return `
                    <div class="material-color-item" style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px; background: #ffffff; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 13px;">
                        <div style="width: 24px; height: 24px; border-radius: 3px; background: ${rgba}; border: 1px solid #999; flex-shrink: 0;"></div>
                        <div style="flex: 1; min-width: 0; overflow: hidden;">
                            <div style="font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this._escapeHtml(color.name)}</div>
                            <div style="font-size: 11px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">R:${color.r} G:${color.g} B:${color.b} A:${color.alpha}%</div>
                        </div>
                        <button class="material-edit-color" data-index="${index}" style="background: transparent; border: 1px solid #999; color: #333; padding: 4px; border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0;" title="Edit">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="material-delete-color" data-index="${index}" style="background: transparent; border: 1px solid #999; color: #333; padding: 4px; border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0;" title="Delete">
                            <svg viewBox="0 0 24 24" style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                `;
            }).join('');

            // Bind edit buttons
            colorList.querySelectorAll('.material-edit-color').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.material-edit-color').getAttribute('data-index'));
                    this._editColor(index);
                });
            });

            // Bind delete buttons
            colorList.querySelectorAll('.material-delete-color').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.closest('.material-delete-color').getAttribute('data-index'));
                    this._deleteColor(index);
                });
            });
        }

        _editColor(index) {
            if (index < 0 || index >= this.colors.length) return;

            const color = this.colors[index];
            const { colorName, colorPicker, colorAlpha, alphaValue, addColorBtn } = this.controls;

            // Populate form with color data
            if (colorName) colorName.value = color.name;
            if (colorPicker) {
                // Convert RGB to hex
                const hex = '#' + [color.r, color.g, color.b]
                    .map(x => {
                        const hex = x.toString(16);
                        return hex.length === 1 ? '0' + hex : hex;
                    })
                    .join('');
                colorPicker.value = hex;
                
                // Update color wheel
                const hsv = this._rgbToHsv(color.r, color.g, color.b);
                this._setColorFromHSVA(hsv.h, hsv.s, hsv.v, color.alpha);
            }
            if (colorAlpha) colorAlpha.value = color.alpha;
            if (alphaValue) alphaValue.textContent = `${color.alpha}%`;
            if (addColorBtn) addColorBtn.textContent = 'Update Color';

            this.editingColorIndex = index;

            // Scroll to form
            if (this.controls.colorName) {
                this.controls.colorName.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                this.controls.colorName.focus();
            }
        }

        _deleteColor(index) {
            if (index >= 0 && index < this.colors.length) {
                const color = this.colors[index];
                // Remove from part colors if used
                this.partColors.forEach((colorName, partName) => {
                    if (colorName === color.name) {
                        this.partColors.delete(partName);
                    }
                });
                this.colors.splice(index, 1);
                this._saveColorsToStorage();
                this._updateColorList();
                this._updatePartColorSelect();
            }
        }

        async _requestCSVSelection() {
            // Get server port from current URL
            const serverPort = window.location.port || '8765';
            const apiUrl = `http://localhost:${serverPort}/api/add-model`;
            
            // Show loading state
            if (typeof this.viewer.showLoading === 'function') {
                this.viewer.showLoading('Requesting CSV file selection from desktop app...');
            }
            
            try {
                // Send POST request to desktop app with CSV file type filter
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fileType: 'csv',
                        fileTypes: [['CSV Files', '*.csv']],
                        title: 'Select CSV File'
                    })
                });
                
                const result = await response.json();
                
                if (result.success && result.fileUrl) {
                    // Build full URL for the file
                    const fullFileUrl = `http://localhost:${serverPort}${result.fileUrl}`;
                    
                    // Fetch and parse CSV
                    const csvResponse = await fetch(fullFileUrl);
                    const csvText = await csvResponse.text();
                    this._parseCSV(csvText);
                } else {
                    // User cancelled or error - silently handle cancellation
                    const errorMsg = result.error ? result.error.toLowerCase() : '';
                    const isCancellation = !result.error || 
                                          errorMsg.includes('cancelled') || 
                                          errorMsg.includes('cancel') ||
                                          errorMsg.includes('no file selected') ||
                                          !result.success;
                    
                    if (!isCancellation && result.error) {
                        console.error('Failed to get CSV file from desktop app:', result);
                        alert('Failed to get CSV file from desktop app');
                    }
                }
            } catch (error) {
                console.error('Error requesting CSV file:', error);
                // Only show error for actual communication failures, not cancellations
                if (error.name !== 'AbortError' && !error.message.includes('cancelled')) {
                    alert('Error requesting CSV file: ' + error.message);
                }
            } finally {
                if (typeof this.viewer.hideLoading === 'function') {
                    this.viewer.hideLoading();
                }
            }
        }

        _handleCSVImport(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                this._parseCSV(e.target.result);
            };
            reader.readAsText(file);
        }

        _parseCSV(csvText) {
            const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
            if (lines.length < 2) {
                alert('CSV file must have at least a header row and one data row');
                return;
            }

            // Skip header row
            const dataLines = lines.slice(1);
            const importedColors = [];

            for (const line of dataLines) {
                const columns = this._parseCSVLine(line);
                if (columns.length >= 5) {
                    const name = columns[0].trim();
                    const r = parseInt(columns[1].trim()) || 0;
                    const g = parseInt(columns[2].trim()) || 0;
                    const b = parseInt(columns[3].trim()) || 0;
                    const alpha = parseInt(columns[4].trim()) || 100;

                    if (name && !this.colors.some(c => c.name.toLowerCase() === name.toLowerCase())) {
                        importedColors.push({ name, r, g, b, alpha });
                    }
                }
            }

            if (importedColors.length === 0) {
                alert('No new colors found in CSV file');
                return;
            }

            this.colors.push(...importedColors);
            this._saveColorsToStorage();
            this._updateColorList();
            this._updatePartColorSelect();
            alert(`Imported ${importedColors.length} color(s) from CSV`);
        }

        _parseCSVLine(line) {
            const columns = [];
            let current = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    columns.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            columns.push(current);
            return columns;
        }

        _onPartSelected(partName, partUUID) {
            this.selectedPart = partName;
            this.selectedPartUUID = partUUID;
            if (this.controls.selectedPartSpan) {
                this.controls.selectedPartSpan.textContent = partName || 'None';
            }
            this._updatePartColorSelect();
            if (this.controls.applyColorBtn) {
                this.controls.applyColorBtn.disabled = !partName || !this.controls.partColorSelect.value;
            }
        }

        _updatePartColorSelect() {
            const { partColorSelect, partColorSearch, partColorOptionsList } = this.controls;
            if (!partColorSelect) return;

            partColorSelect.innerHTML = '<option value="">Select a color...</option>';
            if (partColorOptionsList) {
                partColorOptionsList.innerHTML = '';
            }
            
            this.colors.forEach(color => {
                const option = document.createElement('option');
                option.value = color.name;
                option.textContent = color.name;
                partColorSelect.appendChild(option);
                
                // Also add to custom dropdown list
                if (partColorOptionsList) {
                    const customOption = document.createElement('div');
                    customOption.className = 'material-color-option';
                    customOption.style.cssText = 'padding: 6px 8px; cursor: pointer; font-size: 13px;';
                    customOption.textContent = color.name;
                    customOption.onclick = () => {
                        partColorSelect.value = color.name;
                        if (partColorSearch) {
                            partColorSearch.value = color.name;
                        }
                        partColorSelect.dispatchEvent(new Event('change'));
                        this._hideCustomDropdown();
                        if (this.controls.applyColorBtn) {
                            this.controls.applyColorBtn.disabled = false;
                        }
                    };
                    customOption.onmouseenter = () => {
                        customOption.style.backgroundColor = '#f0f0f0';
                    };
                    customOption.onmouseleave = () => {
                        customOption.style.backgroundColor = '';
                    };
                    partColorOptionsList.appendChild(customOption);
                }
            });

            const isDisabled = this.colors.length === 0 || !this.selectedPart || !this.selectedPartUUID;
            partColorSelect.disabled = isDisabled;
            if (partColorSearch) {
                partColorSearch.disabled = isDisabled;
            }
            
            // Set current color if part has one - check both partColors map and actual mesh material
            if (this.selectedPart && this.selectedPartUUID) {
                let appliedColorName = this.partColors.get(this.selectedPartUUID);
                
                // If not in map, try to get from actual mesh material using UUID
                if (!appliedColorName) {
                    appliedColorName = this._getColorNameFromPartByUUID(this.selectedPartUUID);
                    if (appliedColorName) {
                        // Store it in the map for future reference
                        this.partColors.set(this.selectedPartUUID, appliedColorName);
                    }
                }
                
                // Check if the color still exists in colors list
                if (appliedColorName) {
                    const colorExists = this.colors.some(c => c.name === appliedColorName);
                    if (colorExists) {
                        partColorSelect.value = appliedColorName;
                        if (partColorSearch) {
                            partColorSearch.value = appliedColorName;
                        }
                    } else {
                        partColorSelect.value = '';
                        if (partColorSearch) {
                            partColorSearch.value = '';
                        }
                    }
                } else {
                    partColorSelect.value = '';
                    if (partColorSearch) {
                        partColorSearch.value = '';
                    }
                }
            } else {
                partColorSelect.value = '';
                if (partColorSearch) {
                    partColorSearch.value = '';
                }
            }

            if (this.controls.applyColorBtn) {
                this.controls.applyColorBtn.disabled = !this.selectedPart || !partColorSelect.value;
            }
        }

        /**
         * Show custom dropdown with search box
         */
        _showCustomDropdown() {
            const dropdownWrapper = this.controls.partColorDropdownWrapper;
            const partColorSearch = this.controls.partColorSearch;
            if (dropdownWrapper) {
                dropdownWrapper.style.display = 'block';
                // Focus search box
                if (partColorSearch && !partColorSearch.disabled) {
                    setTimeout(() => partColorSearch.focus(), 10);
                }
            }
        }
        
        /**
         * Hide custom dropdown
         */
        _hideCustomDropdown() {
            const dropdownWrapper = this.controls.partColorDropdownWrapper;
            if (dropdownWrapper) {
                dropdownWrapper.style.display = 'none';
            }
        }
        
        /**
         * Filter color dropdown based on search text
         * @param {string} searchText - Text to search for
         */
        _filterColorDropdown(searchText) {
            const { partColorSelect, partColorSearch, optionsList } = this.controls;
            if (!partColorSelect || !partColorSearch) return;

            const searchLower = searchText.toLowerCase().trim();
            
            // Filter select options
            Array.from(partColorSelect.options).forEach(option => {
                if (option.value === '') {
                    // Always show the "Select a color..." option
                    option.style.display = '';
                } else {
                    const optionText = option.textContent.toLowerCase();
                    if (searchLower === '' || optionText.includes(searchLower)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                }
            });
            
            // Filter custom dropdown options
            if (optionsList) {
                Array.from(optionsList.children).forEach(customOption => {
                    const optionText = customOption.textContent.toLowerCase();
                    if (searchLower === '' || optionText.includes(searchLower)) {
                        customOption.style.display = '';
                    } else {
                        customOption.style.display = 'none';
                    }
                });
            }

            // If search matches exactly one option, auto-select it
            if (searchLower) {
                const visibleOptions = Array.from(partColorSelect.options).filter(opt => 
                    opt.style.display !== 'none' && opt.value
                );
                if (visibleOptions.length === 1) {
                    partColorSelect.value = visibleOptions[0].value;
                    if (this.controls.applyColorBtn) {
                        this.controls.applyColorBtn.disabled = false;
                    }
                }
            }
        }

        _getColorNameFromPartByUUID(partUUID) {
            if (!this.viewer || !this.viewer.scene || !partUUID) return null;

            // Find the part object by UUID
            let partObject = null;
            this.viewer.scene.traverse((child) => {
                if (child.uuid === partUUID && child.isMesh) {
                    partObject = child;
                }
            });

            if (!partObject || !partObject.material) return null;

            const materials = Array.isArray(partObject.material) ? partObject.material : [partObject.material];
            if (materials.length === 0) return null;

            const material = materials[0];
            const materialName = material.name || material.userData?.name;
            
            if (materialName) {
                // Try to find matching color by comparing RGB values
                const r = Math.round(material.color.r * 255);
                const g = Math.round(material.color.g * 255);
                const b = Math.round(material.color.b * 255);
                const alpha = Math.round((material.opacity !== undefined ? material.opacity : 1) * 100);
                
                // Find matching color in our colors list
                const matchingColor = this.colors.find(c => 
                    c.r === r && c.g === g && c.b === b && c.alpha === alpha
                );
                
                if (matchingColor) {
                    return matchingColor.name;
                } else if (materialName) {
                    // If material name exists in our colors, use it
                    const colorByName = this.colors.find(c => c.name === materialName);
                    if (colorByName) {
                        return materialName;
                    }
                }
            }
            
            return null;
        }

        _applyColorToPart() {
            const { partColorSelect, partColorSearch } = this.controls;
            if (!this.selectedPart || !this.selectedPartUUID || !partColorSelect || !partColorSelect.value) return;

            const colorName = partColorSelect.value;
            
            // Update search field to match selected value
            if (partColorSearch) {
                partColorSearch.value = partColorSelect.options[partColorSelect.selectedIndex].textContent;
            }
            const color = this.colors.find(c => c.name === colorName);
            if (!color) return;

            // CRITICAL: Apply color ONLY to the selected part by UUID
            // This is completely isolated - it does NOT affect any other parts
            // We use UUID (not name) to ensure we only update the exact selected part
            const targetUUID = this.selectedPartUUID;
            
            // Verify the UUID exists in the scene before applying
            let partExists = false;
            this.viewer.scene.traverse((child) => {
                if (child.uuid === targetUUID && child.isMesh) {
                    partExists = true;
                }
            });
            
            if (!partExists) {
                console.warn('Selected part UUID not found in scene:', targetUUID);
                return;
            }

            // Apply ONLY to this specific UUID - no bulk updates
            this.partColors.set(targetUUID, colorName);
            this._applyColorToPartMeshByUUID(targetUUID, color);
            
            // Save to storage after applying
            this._saveColorsToStorage();
        }

        _applyColorToPartMeshByUUID(partUUID, color) {
            if (!this.viewer || !this.viewer.scene || !partUUID) return;

            const threeColor = new THREE.Color(color.r / 255, color.g / 255, color.b / 255);

            // Find the exact part by UUID (works for parts in sub-assemblies too)
            this.viewer.scene.traverse((child) => {
                if (child.uuid === partUUID && child.isMesh && child.material) {
                    const applyMaterial = (material, index) => {
                        if (material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial) {
                            // CRITICAL: Clone material to avoid affecting other parts that share the same material
                            // This ensures each part has its own material instance when color is applied
                            const clonedMaterial = material.clone();
                            
                            // Preserve original material name and userData from Blender
                            clonedMaterial.name = material.name || '';
                            if (material.userData) {
                                clonedMaterial.userData = JSON.parse(JSON.stringify(material.userData));
                            }
                            
                            // Apply color to cloned material
                            clonedMaterial.color.copy(threeColor);
                            clonedMaterial.opacity = color.alpha / 100;
                            clonedMaterial.transparent = color.alpha < 100;
                            clonedMaterial.needsUpdate = true;
                            
                            // Replace material with cloned version
                            if (Array.isArray(child.material)) {
                                child.material[index] = clonedMaterial;
                            } else {
                                child.material = clonedMaterial;
                            }
                        }
                    };

                    if (Array.isArray(child.material)) {
                        child.material.forEach((mat, idx) => applyMaterial(mat, idx));
                    } else {
                        applyMaterial(child.material, 0);
                    }
                }
            });
        }

        _exportTemplate() {
            if (this.colors.length === 0) {
                alert('No colors to export');
                return;
            }

            // Create CSV content with header
            const csvLines = ['Name,R,G,B,Alpha'];
            
            // Add all colors
            this.colors.forEach(color => {
                csvLines.push(`${this._escapeCSV(color.name)},${color.r},${color.g},${color.b},${color.alpha}`);
            });

            const csvContent = csvLines.join('\n');
            this._downloadCSV(csvContent, 'material-template.csv');
        }

        _exportPartListCSV() {
            if (!this.viewer || !this.viewer.scene) {
                alert('No model loaded');
                return;
            }

            // Collect all parts from the scene with their UUIDs and material names
            const parts = [];
            this.viewer.scene.traverse((child) => {
                if (child.isMesh && child.name) {
                    // Get material name (color name applied to this part)
                    let materialName = this.partColors.get(child.uuid) || '';
                    
                    // If no color assigned, try to get from material
                    if (!materialName) {
                        materialName = this._getColorNameFromPartByUUID(child.uuid) || '';
                    }
                    
                    parts.push({ 
                        name: child.name, 
                        uuid: child.uuid,
                        materialName: materialName
                    });
                }
            });

            if (parts.length === 0) {
                alert('No parts found in the model');
                return;
            }

            // Create CSV content with Part Name and Material Name
            const csvLines = ['Part Name,Material Name'];
            parts.forEach(part => {
                csvLines.push(`${this._escapeCSV(part.name)},${this._escapeCSV(part.materialName)}`);
            });

            const csvContent = csvLines.join('\n');
            this._downloadCSV(csvContent, 'part-list.csv');
        }

        async _bulkApplyFromCSV() {
            // Request CSV file selection from desktop app (like add model)
            const serverPort = window.location.port || '8765';
            const apiUrl = `http://localhost:${serverPort}/api/add-model`;
            
            // Show loading state
            if (typeof this.viewer.showLoading === 'function') {
                this.viewer.showLoading('Requesting CSV file selection from desktop app...');
            }
            
            try {
                // Send POST request to desktop app with CSV file type filter
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fileType: 'csv',
                        fileTypes: [['CSV Files', '*.csv']],
                        title: 'Select CSV File'
                    })
                });
                
                const result = await response.json();
                
                if (result.success && result.fileUrl) {
                    // Build full URL for the file
                    const fullFileUrl = `http://localhost:${serverPort}${result.fileUrl}`;
                    
                    // Fetch and parse CSV
                    const csvResponse = await fetch(fullFileUrl);
                    const csvText = await csvResponse.text();
                    this._parseBulkApplyCSV(csvText);
                } else {
                    // User cancelled or error - silently handle cancellation
                    const errorMsg = result.error ? result.error.toLowerCase() : '';
                    const isCancellation = !result.error || 
                                          errorMsg.includes('cancelled') || 
                                          errorMsg.includes('cancel') ||
                                          errorMsg.includes('no file selected') ||
                                          !result.success;
                    
                    if (!isCancellation && result.error) {
                        console.error('Failed to get CSV file from desktop app:', result);
                        alert('Failed to get CSV file from desktop app');
                    }
                }
            } catch (error) {
                console.error('Error requesting CSV file:', error);
                // Only show error for actual communication failures, not cancellations
                if (error.name !== 'AbortError' && !error.message.includes('cancelled')) {
                    alert('Error requesting CSV file: ' + error.message);
                }
            } finally {
                if (typeof this.viewer.hideLoading === 'function') {
                    this.viewer.hideLoading();
                }
            }
        }

        _parseBulkApplyCSV(csvText) {
            if (!this.viewer || !this.viewer.scene) {
                alert('No model loaded');
                return;
            }

            const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
            if (lines.length < 2) {
                alert('CSV file must have at least a header row and one data row');
                return;
            }

            // Skip first row (header)
            const dataLines = lines.slice(1);
            const partMaterialMap = new Map(); // Map of part name -> material name
            const newMaterials = new Set(); // Track new materials that need to be created

            // Parse CSV data
            for (const line of dataLines) {
                const columns = this._parseCSVLine(line);
                if (columns.length >= 2) {
                    const partName = columns[0].trim();
                    const materialName = columns[1].trim();
                    
                    if (partName && materialName) {
                        partMaterialMap.set(partName, materialName);
                        
                        // Check if material exists in colors list
                        const materialExists = this.colors.some(c => c.name.toLowerCase() === materialName.toLowerCase());
                        if (!materialExists) {
                            newMaterials.add(materialName);
                        }
                    }
                }
            }

            if (partMaterialMap.size === 0) {
                alert('No valid part-material pairs found in CSV file');
                return;
            }

            // Create new materials if they don't exist (with default color)
            let createdCount = 0;
            newMaterials.forEach(materialName => {
                // Create a default material (white color, 100% alpha)
                const newColor = {
                    name: materialName,
                    r: 255,
                    g: 255,
                    b: 255,
                    alpha: 100
                };
                
                // Check if name already exists (case-insensitive)
                if (!this.colors.some(c => c.name.toLowerCase() === materialName.toLowerCase())) {
                    this.colors.push(newColor);
                    createdCount++;
                }
            });

            if (createdCount > 0) {
                this._saveColorsToStorage();
                this._updateColorList();
                this._updatePartColorSelect();
            }

            // Apply materials to parts
            let appliedCount = 0;
            let notFoundCount = 0;

            this.viewer.scene.traverse((child) => {
                if (child.isMesh && child.name) {
                    const materialName = partMaterialMap.get(child.name);
                    if (materialName) {
                        // Find the color/material
                        const color = this.colors.find(c => c.name.toLowerCase() === materialName.toLowerCase());
                        if (color) {
                            // Apply color to this part
                            this.partColors.set(child.uuid, color.name);
                            this._applyColorToPartMeshByUUID(child.uuid, color);
                            appliedCount++;
                        } else {
                            notFoundCount++;
                        }
                    }
                }
            });

            // Save to storage
            this._saveColorsToStorage();

            // Show result
            let message = `Applied materials to ${appliedCount} part(s)`;
            if (createdCount > 0) {
                message += `\nCreated ${createdCount} new material(s)`;
            }
            if (notFoundCount > 0) {
                message += `\n${notFoundCount} material(s) not found`;
            }
            alert(message);
        }

        _downloadCSV(content, filename) {
            const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        _escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        _escapeCSV(text) {
            if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        }

        _saveColorsToStorage() {
            try {
                localStorage.setItem('materialManager_colors', JSON.stringify(this.colors));
                localStorage.setItem('materialManager_partColors', JSON.stringify(Array.from(this.partColors.entries())));
            } catch (e) {
                console.warn('Failed to save colors to localStorage:', e);
            }
        }

        _loadColorsFromStorage() {
            try {
                const colorsJson = localStorage.getItem('materialManager_colors');
                if (colorsJson) {
                    this.colors = JSON.parse(colorsJson);
                }

                const partColorsJson = localStorage.getItem('materialManager_partColors');
                if (partColorsJson) {
                    this.partColors = new Map(JSON.parse(partColorsJson));
                }
            } catch (e) {
                console.warn('Failed to load colors from localStorage:', e);
            }
        }

        _extractMaterialsFromScene() {
            if (!this.viewer || !this.viewer.scene) return;

            const materialMap = new Map(); // Map of material name -> color info
            const partMaterialMap = new Map(); // Map of part name -> material name

            // Traverse scene to extract materials
            this.viewer.scene.traverse((child) => {
                if (child.isMesh && child.material && child.name) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    
                    materials.forEach((material, index) => {
                        // Get material name - preserve Blender's exact material name format
                        // Try multiple sources in order of priority to match Blender's format
                        let materialName = material.name;
                        
                        // Check userData for Blender-specific material info
                        if (!materialName || materialName === '') {
                            // Blender may store material name in userData
                            materialName = material.userData?.name || 
                                          material.userData?.gltfExtensions?.KHR_materials_pbrSpecularGlossiness?.name ||
                                          material.userData?.gltfExtensions?.KHR_materials_unlit?.name ||
                                          (material.uuid ? `Material_${material.uuid.substring(0, 8)}` : `Material_${index}`);
                        }
                        
                        // Preserve original material name exactly as Blender exports it (don't modify)
                        // Only trim whitespace, but keep the exact format
                        materialName = materialName ? materialName.trim() : '';
                        if (!materialName || materialName === '') {
                            materialName = `Material_${index}`;
                        }

                        // Extract color from material
                        let r = 255, g = 255, b = 255, alpha = 100;
                        
                        if (material.color) {
                            r = Math.round(material.color.r * 255);
                            g = Math.round(material.color.g * 255);
                            b = Math.round(material.color.b * 255);
                        }
                        
                        if (material.opacity !== undefined) {
                            alpha = Math.round(material.opacity * 100);
                        }

                        // Store material info (use material name as key, but allow same color with different names)
                        const materialKey = `${materialName}_${r}_${g}_${b}_${alpha}`;
                        if (!materialMap.has(materialKey)) {
                            materialMap.set(materialKey, { name: materialName, r, g, b, alpha });
                        }

                        // Map part to material (use first material if multiple) - use UUID instead of name
                        if (index === 0 && !partMaterialMap.has(child.uuid)) {
                            const storedMaterial = materialMap.get(materialKey);
                            partMaterialMap.set(child.uuid, storedMaterial.name);
                        }
                    });
                }
            });

            // Add extracted materials to colors list (if not already exists)
            materialMap.forEach((colorInfo) => {
                const exists = this.colors.some(c => c.name.toLowerCase() === colorInfo.name.toLowerCase());
                if (!exists) {
                    this.colors.push(colorInfo);
                }
            });

            // Update part colors mapping - only if not already manually set
            // This preserves user-applied colors while adding new ones from GLTF
            // Use UUID instead of name to handle parts in sub-assemblies
            partMaterialMap.forEach((materialName, partUUID) => {
                if (!this.partColors.has(partUUID)) {
                    this.partColors.set(partUUID, materialName);
                }
            });

            // Only save to storage if we actually have materials (model is loaded)
            // Don't save empty state to prevent loading old colors on next browser open
            if (this.colors.length > 0) {
            this._saveColorsToStorage();
            }
        }

        refreshMaterials() {
            // Clear previous colors before extracting new materials
            // This ensures we start fresh when loading a new model
            // BUT: Keep template colors - reload them after clearing
            const templateColors = this.colors.filter(c => 
                c.name && (c.name.startsWith('MS') || c.name.startsWith('M'))
            );
            
            this.colors = [];
            this.partColors.clear();
            
            // Re-add template colors first
            if (templateColors.length > 0) {
                templateColors.forEach(color => {
                    this.colors.push(color);
                });
            } else {
                // If no template colors found, load default ones
                this._loadDefaultTemplateColors();
            }
            
            this._extractMaterialsFromScene();
            this._updateColorList();
            this._updatePartColorSelect();
        }

        clear() {
            // Clear all colors and part color mappings
            this.colors = [];
            this.partColors.clear();
            this.selectedPart = null;
            this.selectedPartUUID = null;
            this.editingColorIndex = null;
            
            // Clear localStorage
            try {
                localStorage.removeItem('materialManager_colors');
                localStorage.removeItem('materialManager_partColors');
            } catch (e) {
                console.warn('Failed to clear colors from localStorage:', e);
            }
            
            // Update UI
            this._updateColorList();
            this._updatePartColorSelect();
        }
    }

    GLTFViewer.prototype.initMaterialManager = function() {
        if (!this.materialManager) {
            this.materialManager = new MaterialManager(this);
        }
        return this.materialManager;
    };

    // Hook into model loading to extract materials
    const originalLoadGLTF = GLTFViewer.prototype.loadGLTF;
    if (originalLoadGLTF) {
        GLTFViewer.prototype.loadGLTF = function(...args) {
            const result = originalLoadGLTF.apply(this, args);
            
            // Extract materials after model is loaded
            if (this.materialManager && typeof this.materialManager.refreshMaterials === 'function') {
                // Wait a bit for the model to be fully added to scene
                setTimeout(() => {
                    this.materialManager.refreshMaterials();
                }, 1000);
            }
            
            return result;
        };
    }

    const ensureMaterialManager = () => {
        if (window.viewer && typeof window.viewer.initMaterialManager === 'function') {
            window.viewer.initMaterialManager();
        }
    };

    window.toggleMaterialPanel = function() {
        ensureMaterialManager();
        if (window.viewer && window.viewer.materialManager) {
            window.viewer.materialManager.togglePanel();
        }
    };

    // Initialize when viewer is ready
    if (window.viewer) {
        window.viewer.initMaterialManager();
    } else {
        window.addEventListener('viewerReady', () => {
            if (window.viewer) {
                window.viewer.initMaterialManager();
            }
        });
    }
})();

