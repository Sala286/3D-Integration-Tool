/**
 * GLTF Viewer - Image Capture Module
 * Handles capturing images from the viewport, including preview box area
 */

// ImageCapture class for capturing viewport images
window.ImageCapture = class ImageCapture {
    constructor(viewer) {
        this.viewer = viewer;
    }
    
    /**
     * Convert linear RGB value to sRGB
     * @param {number} linear - Linear RGB value (0-1)
     * @returns {number} sRGB value (0-1)
     */
    _linearToSRGB(linear) {
        if (linear <= 0.0031308) {
            return 12.92 * linear;
        } else {
            return 1.055 * Math.pow(linear, 1.0 / 2.4) - 0.055;
        }
    }
    
    /**
     * Convert pixel buffer from linear to sRGB color space
     * @param {Uint8Array} pixelBuffer - Pixel buffer in linear color space
     * @returns {Uint8Array} Pixel buffer in sRGB color space
     */
    _convertLinearToSRGB(pixelBuffer) {
        const converted = new Uint8Array(pixelBuffer.length);
        for (let i = 0; i < pixelBuffer.length; i += 4) {
            // Convert R, G, B from linear to sRGB (alpha channel stays the same)
            const r = pixelBuffer[i] / 255.0;
            const g = pixelBuffer[i + 1] / 255.0;
            const b = pixelBuffer[i + 2] / 255.0;
            const a = pixelBuffer[i + 3] / 255.0;
            
            converted[i] = Math.round(this._linearToSRGB(r) * 255);
            converted[i + 1] = Math.round(this._linearToSRGB(g) * 255);
            converted[i + 2] = Math.round(this._linearToSRGB(b) * 255);
            converted[i + 3] = Math.round(a * 255);
        }
        return converted;
    }
    
    /**
     * Capture preview box area at high quality, or entire canvas if preview is not active
     * @param {number} qualityMultiplier - Resolution multiplier (default: 8 for 8x quality - very high resolution)
     * @returns {string|null} Data URL of the captured image (base64 encoded PNG or JPEG)
     */
    capturePreviewImage(qualityMultiplier = 8) {
        if (!this.viewer || !this.viewer.renderer) {
            console.error('Viewer or renderer not available');
            return null;
        }
        
        const container = document.getElementById('container');
        if (!container) {
            console.error('Container not found');
            return null;
        }
        
        const canvasWidth = container.clientWidth - this.viewer.sidebarWidth;
        const canvasHeight = container.clientHeight;
        
        // Check if preview box is active and has valid dimensions
        if (this.viewer.previewActive && this.viewer.previewBox) {
            // Get preview box dimensions - coordinates are relative to container
            let boxLeft = parseFloat(this.viewer.previewBox.style.left);
            let boxTop = parseFloat(this.viewer.previewBox.style.top);
            let boxWidth = parseFloat(this.viewer.previewBox.style.width);
            let boxHeight = parseFloat(this.viewer.previewBox.style.height);
            
            // If dimensions are not set or invalid, try to get them from computed style
            if (isNaN(boxLeft) || isNaN(boxTop) || isNaN(boxWidth) || isNaN(boxHeight)) {
                const computedStyle = window.getComputedStyle(this.viewer.previewBox);
                boxLeft = parseFloat(computedStyle.left) || 0;
                boxTop = parseFloat(computedStyle.top) || 0;
                boxWidth = parseFloat(computedStyle.width) || canvasWidth;
                boxHeight = parseFloat(computedStyle.height) || canvasHeight;
            }
            
            // Ensure we have valid dimensions
            if (isNaN(boxWidth) || boxWidth <= 0) boxWidth = canvasWidth;
            if (isNaN(boxHeight) || boxHeight <= 0) boxHeight = canvasHeight;
            if (isNaN(boxLeft)) boxLeft = 0;
            if (isNaN(boxTop)) boxTop = 0;
            
            // Clamp coordinates to canvas bounds
            boxLeft = Math.max(0, Math.min(boxLeft, canvasWidth - 1));
            boxTop = Math.max(0, Math.min(boxTop, canvasHeight - 1));
            boxWidth = Math.max(1, Math.min(boxWidth, canvasWidth - boxLeft));
            boxHeight = Math.max(1, Math.min(boxHeight, canvasHeight - boxTop));
            
            // When preview box is active, adjust camera to show only preview box content
            // and capture with 4:3 aspect ratio
            return this._capturePreviewBoxRegion(boxLeft, boxTop, boxWidth, boxHeight, qualityMultiplier);
        }
        
        // Fallback: capture entire canvas at high resolution (only when preview is not active)
        return this._captureHighQualityFullViewport(qualityMultiplier);
    }
    
    /**
     * Capture a specific region of the canvas
     * @param {HTMLCanvasElement} sourceCanvas - Source canvas to capture from
     * @param {number} x - X position of the region
     * @param {number} y - Y position of the region
     * @param {number} width - Width of the region
     * @param {number} height - Height of the region
     * @returns {string} Data URL of the captured region
     */
    _captureRegion(sourceCanvas, x, y, width, height) {
        // Create a temporary canvas for the cropped region
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        const ctx = tempCanvas.getContext('2d');
        
        // Draw the region from the source canvas to the temp canvas
        // Note: We need to account for device pixel ratio for high DPI displays
        const dpr = window.devicePixelRatio || 1;
        
        // The renderer canvas might have a different internal size due to device pixel ratio
        // Get the actual canvas size
        const sourceWidth = sourceCanvas.width;
        const sourceHeight = sourceCanvas.height;
        
        // Calculate scale factors
        const scaleX = sourceWidth / (this.viewer.renderer.domElement.clientWidth || sourceWidth);
        const scaleY = sourceHeight / (this.viewer.renderer.domElement.clientHeight || sourceHeight);
        
        // Scale the coordinates and dimensions
        const sx = x * scaleX;
        const sy = y * scaleY;
        const sw = width * scaleX;
        const sh = height * scaleY;
        
        // Draw the cropped region
        ctx.drawImage(
            sourceCanvas,
            sx, sy, sw, sh,  // Source region
            0, 0, width, height  // Destination (full temp canvas)
        );
        
        // Return as high-quality PNG
        return tempCanvas.toDataURL('image/png', 1.0);
    }
    
    /**
     * Capture the entire viewport at high quality
     * @param {string} format - Image format ('image/png' or 'image/jpeg')
     * @param {number} quality - Quality for JPEG (0.0 to 1.0), ignored for PNG
     * @param {number} qualityMultiplier - Resolution multiplier (default: 8 for 8x quality - very high resolution)
     * @returns {string} Data URL of the captured image
     */
    captureFullViewport(format = 'image/png', quality = 1.0, qualityMultiplier = 8) {
        return this._captureHighQualityFullViewport(qualityMultiplier, format, quality);
    }
    
    /**
     * Capture preview box region - adjusts camera to show only preview box content and maintains 4:3 ratio
     * @param {number} boxLeft - Preview box left position
     * @param {number} boxTop - Preview box top position
     * @param {number} boxWidth - Preview box width
     * @param {number} boxHeight - Preview box height
     * @param {number} qualityMultiplier - Resolution multiplier (default: 8 for very high resolution)
     * @returns {string} Data URL
     */
    _capturePreviewBoxRegion(boxLeft, boxTop, boxWidth, boxHeight, qualityMultiplier = 8) {
        if (!this.viewer || !this.viewer.renderer || !this.viewer.scene || !this.viewer.camera) {
            console.error('Viewer, renderer, scene, or camera not available');
            return null;
        }
        
        const container = document.getElementById('container');
        if (!container) {
            console.error('Container not found');
            return null;
        }
        
        const canvasWidth = container.clientWidth - this.viewer.sidebarWidth;
        const canvasHeight = container.clientHeight;
        
        // Store original camera and controls state BEFORE any modifications
        const camera = this.viewer.camera;
        const cameraOriginalPosition = camera.position.clone();
        const cameraOriginalQuaternion = camera.quaternion.clone();
        const cameraOriginalUp = camera.up.clone();
        const cameraOriginalAspect = camera.aspect;
        const cameraOriginalZoom = camera.zoom || 1;
        
        // Store orthographic camera settings
        let cameraOriginalLeft, cameraOriginalRight, cameraOriginalTop, cameraOriginalBottom;
        let originalOrthoFrustumHeight = null;
        let originalOrthoFrustumDistance = null;
        
        if (camera.isOrthographicCamera) {
            cameraOriginalLeft = camera.left;
            cameraOriginalRight = camera.right;
            cameraOriginalTop = camera.top;
            cameraOriginalBottom = camera.bottom;
            originalOrthoFrustumHeight = this.viewer._orthoFrustumHeight;
            originalOrthoFrustumDistance = this.viewer._orthoFrustumDistance;
        }
        
        // Store controls state
        let controlsOriginalTarget = null;
        if (this.viewer.controls && this.viewer.controls.target) {
            controlsOriginalTarget = this.viewer.controls.target.clone();
        }
        
        // Store rotation pivot state (may be modified by _applyCameraFit)
        const originalRotationPivot = this.viewer.rotationPivot ? this.viewer.rotationPivot.clone() : null;
        const originalRotationPivotOffset = this.viewer.rotationPivotOffset ? this.viewer.rotationPivotOffset.clone() : null;
        const originalRotationPivotDistance = this.viewer.rotationPivotDistance;
        const originalRotationViewDirection = this.viewer.rotationViewDirection ? this.viewer.rotationViewDirection.clone() : null;
        const originalRotationUp = this.viewer.rotationUp ? this.viewer.rotationUp.clone() : null;
        const originalBoundaryBoxCenter = this.viewer.boundaryBoxCenter ? this.viewer.boundaryBoxCenter.clone() : null;
        
        try {
            // Don't adjust camera - the preview box already shows the correct content
            // We just need to capture the preview box region from the current view
            
            // Capture with 4:3 aspect ratio (preview box is 4:3)
            const aspectRatio = 4 / 3;
            
            // Calculate capture dimensions maintaining 4:3 ratio
            // Use the larger dimension to ensure we capture the full preview box content
            let captureWidth, captureHeight;
            if (boxWidth / boxHeight > aspectRatio) {
                // Box is wider than 4:3, use height as base to capture full height
                captureHeight = Math.floor(boxHeight * qualityMultiplier);
                captureWidth = Math.floor(captureHeight * aspectRatio);
            } else {
                // Box is taller or equal to 4:3, use width as base to capture full width
                captureWidth = Math.floor(boxWidth * qualityMultiplier);
                captureHeight = Math.floor(captureWidth / aspectRatio);
            }
            
            // Render full viewport at high resolution, then crop to preview box region
            // This ensures we capture exactly what's visible in the preview box
            const container = document.getElementById('container');
            const fullCanvasWidth = container.clientWidth - this.viewer.sidebarWidth;
            const fullCanvasHeight = container.clientHeight;
            
            // Render full viewport at high resolution
            const fullHighResWidth = Math.floor(fullCanvasWidth * qualityMultiplier);
            const fullHighResHeight = Math.floor(fullCanvasHeight * qualityMultiplier);
            
            // Calculate preview box region in high-res coordinates
            const scaleX = fullHighResWidth / fullCanvasWidth;
            const scaleY = fullHighResHeight / fullCanvasHeight;
            const boxLeftHighRes = Math.floor(boxLeft * scaleX);
            const boxTopHighRes = Math.floor(boxTop * scaleY);
            const boxWidthHighRes = Math.floor(boxWidth * scaleX);
            const boxHeightHighRes = Math.floor(boxHeight * scaleY);
            
            // Render full viewport and crop to preview box
            return this._captureHighQualityRegionWithCrop(
                0, 0, fullCanvasWidth, fullCanvasHeight,  // Render full viewport
                boxLeftHighRes, boxTopHighRes, boxWidthHighRes, boxHeightHighRes,  // Crop to preview box
                captureWidth, captureHeight,  // Output at 4:3
                qualityMultiplier
            );
        } finally {
            // Restore camera position and orientation
            camera.position.copy(cameraOriginalPosition);
            camera.quaternion.copy(cameraOriginalQuaternion);
            camera.up.copy(cameraOriginalUp);
            camera.aspect = cameraOriginalAspect;
            
            // Restore orthographic camera settings
            if (camera.isOrthographicCamera) {
                camera.left = cameraOriginalLeft;
                camera.right = cameraOriginalRight;
                camera.top = cameraOriginalTop;
                camera.bottom = cameraOriginalBottom;
                camera.zoom = cameraOriginalZoom;
                
                // Restore orthographic frustum properties
                if (originalOrthoFrustumHeight !== null) {
                    this.viewer._orthoFrustumHeight = originalOrthoFrustumHeight;
                }
                if (originalOrthoFrustumDistance !== null) {
                    this.viewer._orthoFrustumDistance = originalOrthoFrustumDistance;
                }
            }
            
            camera.updateProjectionMatrix();
            
            // Restore controls
            if (this.viewer.controls && controlsOriginalTarget) {
                this.viewer.controls.target.copy(controlsOriginalTarget);
                this.viewer.controls.update();
            }
            
            // Restore rotation pivot state
            if (originalRotationPivot) {
                this.viewer.rotationPivot = originalRotationPivot;
            }
            if (originalRotationPivotOffset) {
                this.viewer.rotationPivotOffset = originalRotationPivotOffset;
            }
            if (originalRotationPivotDistance !== undefined) {
                this.viewer.rotationPivotDistance = originalRotationPivotDistance;
            }
            if (originalRotationViewDirection) {
                this.viewer.rotationViewDirection = originalRotationViewDirection;
            }
            if (originalRotationUp) {
                this.viewer.rotationUp = originalRotationUp;
            }
            if (originalBoundaryBoxCenter) {
                this.viewer.boundaryBoxCenter = originalBoundaryBoxCenter;
            }
        }
    }
    
    /**
     * Capture a region with cropping - renders full viewport then crops to specific region
     * @param {number} renderX - X position to render from
     * @param {number} renderY - Y position to render from
     * @param {number} renderWidth - Width to render
     * @param {number} renderHeight - Height to render
     * @param {number} cropX - X position to crop from (in high-res coordinates)
     * @param {number} cropY - Y position to crop from (in high-res coordinates)
     * @param {number} cropWidth - Width to crop (in high-res coordinates)
     * @param {number} cropHeight - Height to crop (in high-res coordinates)
     * @param {number} outputWidth - Output width
     * @param {number} outputHeight - Output height
     * @param {number} qualityMultiplier - Resolution multiplier (default: 8 for very high resolution)
     * @returns {string} Data URL
     */
    _captureHighQualityRegionWithCrop(renderX, renderY, renderWidth, renderHeight, cropX, cropY, cropWidth, cropHeight, outputWidth, outputHeight, qualityMultiplier = 8) {
        if (!this.viewer || !this.viewer.renderer || !this.viewer.scene || !this.viewer.camera) {
            console.error('Viewer, renderer, scene, or camera not available');
            return null;
        }
        
        const renderer = this.viewer.renderer;
        const scene = this.viewer.scene;
        const camera = this.viewer.camera;
        
        // Calculate high-resolution dimensions for full render
        const highResWidth = Math.floor(renderWidth * qualityMultiplier);
        const highResHeight = Math.floor(renderHeight * qualityMultiplier);
        
        // Store original renderer settings
        const originalViewport = renderer.getViewport(new THREE.Vector4());
        const previousRenderTarget = renderer.getRenderTarget();
        
        // Store original camera settings
        const cameraOriginalAspect = camera.aspect;
        const cameraOriginalZoom = camera.zoom || 1;
        let cameraOriginalLeft, cameraOriginalRight, cameraOriginalTop, cameraOriginalBottom;
        
        if (camera.isOrthographicCamera) {
            cameraOriginalLeft = camera.left;
            cameraOriginalRight = camera.right;
            cameraOriginalTop = camera.top;
            cameraOriginalBottom = camera.bottom;
        }
        
        // Create render target for high-quality capture
        const renderTarget = new THREE.WebGLRenderTarget(highResWidth, highResHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        });
        
        try {
            // Hide axes, cursor, and rotation pivot indicator during capture
            const worldAxesVisible = this.viewer.worldAxesGroup ? this.viewer.worldAxesGroup.visible : false;
            const cursor3DVisible = this.viewer.cursor3DGroup ? this.viewer.cursor3DGroup.visible : false;
            const rotationPivotVisible = this.viewer.rotationPivotIndicatorGroup ? this.viewer.rotationPivotIndicatorGroup.visible : false;
            
            if (this.viewer.worldAxesGroup) {
                this.viewer.worldAxesGroup.visible = false;
            }
            if (this.viewer.cursor3DGroup) {
                this.viewer.cursor3DGroup.visible = false;
            }
            if (this.viewer.rotationPivotIndicatorGroup) {
                this.viewer.rotationPivotIndicatorGroup.visible = false;
            }
            
            // Adjust camera aspect ratio to match render target (preserves camera type)
            const renderAspect = highResWidth / highResHeight;
            const originalAspect = camera.aspect;
            
            if (camera.isPerspectiveCamera) {
                camera.aspect = renderAspect;
                camera.updateProjectionMatrix();
            } else if (camera.isOrthographicCamera) {
                // For orthographic, adjust frustum to match render target aspect
                // Preserve frustum height and zoom, only adjust width
                const originalFrustumHeight = cameraOriginalTop - cameraOriginalBottom;
                const halfHeight = originalFrustumHeight / 2;
                const halfWidth = halfHeight * renderAspect;
                camera.left = -halfWidth;
                camera.right = halfWidth;
                camera.top = cameraOriginalTop;
                camera.bottom = cameraOriginalBottom;
                camera.zoom = cameraOriginalZoom;
                camera.updateProjectionMatrix();
            }
            
            // Render full viewport to render target
            renderer.setRenderTarget(renderTarget);
            renderer.setViewport(0, 0, highResWidth, highResHeight);
            renderer.render(scene, camera);
            
            // Restore visibility of axes, cursor, and rotation pivot indicator
            if (this.viewer.worldAxesGroup) {
                this.viewer.worldAxesGroup.visible = worldAxesVisible;
            }
            if (this.viewer.cursor3DGroup) {
                this.viewer.cursor3DGroup.visible = cursor3DVisible;
            }
            if (this.viewer.rotationPivotIndicatorGroup) {
                this.viewer.rotationPivotIndicatorGroup.visible = rotationPivotVisible;
            }
            
            // Restore camera aspect ratio immediately after rendering
            camera.aspect = originalAspect;
            if (camera.isOrthographicCamera) {
                camera.left = cameraOriginalLeft;
                camera.right = cameraOriginalRight;
                camera.top = cameraOriginalTop;
                camera.bottom = cameraOriginalBottom;
                camera.zoom = cameraOriginalZoom;
            }
            camera.updateProjectionMatrix();
            
            // Read pixels from the cropped region only
            const pixelBuffer = new Uint8Array(cropWidth * cropHeight * 4);
            renderer.readRenderTargetPixels(renderTarget, cropX, cropY, cropWidth, cropHeight, pixelBuffer);
            
            // Convert from linear to sRGB color space to match renderer output
            const sRGBPixelBuffer = this._convertLinearToSRGB(pixelBuffer);
            
            // Immediately restore render target and viewport
            renderer.setRenderTarget(previousRenderTarget);
            renderer.setViewport(originalViewport.x, originalViewport.y, originalViewport.z, originalViewport.w);
            
            // Create canvas from cropped pixel data
            const canvas = document.createElement('canvas');
            canvas.width = outputWidth;
            canvas.height = outputHeight;
            const ctx = canvas.getContext('2d');
            
            // Create temporary canvas for the flipped cropped image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cropWidth;
            tempCanvas.height = cropHeight;
            const tempCtx = tempCanvas.getContext('2d');
            const imageData = tempCtx.createImageData(cropWidth, cropHeight);
            
            // Flip the pixel buffer vertically (WebGL reads bottom-to-top)
            const bytesPerPixel = 4;
            const rowBytes = cropWidth * bytesPerPixel;
            for (let y = 0; y < cropHeight; y++) {
                const srcRow = y;
                const dstRow = cropHeight - 1 - y;
                const srcOffset = srcRow * rowBytes;
                const dstOffset = dstRow * rowBytes;
                for (let x = 0; x < rowBytes; x++) {
                    imageData.data[dstOffset + x] = sRGBPixelBuffer[srcOffset + x];
                }
            }
            
            tempCtx.putImageData(imageData, 0, 0);
            
            // Scale to output dimensions (4:3)
            ctx.drawImage(tempCanvas, 0, 0, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight);
            
            // Clean up
            renderTarget.dispose();
            
            return canvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.error('Error capturing cropped region:', error);
            renderTarget.dispose();
            renderer.setRenderTarget(previousRenderTarget);
            renderer.setViewport(originalViewport.x, originalViewport.y, originalViewport.z, originalViewport.w);
            return null;
        }
    }
    
    /**
     * Capture full viewport at high resolution using render target
     * @param {number} qualityMultiplier - Resolution multiplier (default: 8 for very high resolution)
     * @param {string} format - Image format
     * @param {number} quality - JPEG quality
     * @returns {string} Data URL
     */
    _captureHighQualityFullViewport(qualityMultiplier = 8, format = 'image/png', quality = 1.0) {
        if (!this.viewer || !this.viewer.renderer || !this.viewer.scene || !this.viewer.camera) {
            console.error('Viewer, renderer, scene, or camera not available');
            return null;
        }
        
        const container = document.getElementById('container');
        if (!container) {
            console.error('Container not found');
            return null;
        }
        
        const canvasWidth = container.clientWidth - this.viewer.sidebarWidth;
        const canvasHeight = container.clientHeight;
        
        return this._captureHighQualityRegion(0, 0, canvasWidth, canvasHeight, qualityMultiplier, format, quality);
    }
    
    /**
     * Capture a region at high resolution using render target
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {number} qualityMultiplier - Resolution multiplier (default: 8 for very high resolution)
     * @param {string} format - Image format
     * @param {number} quality - JPEG quality
     * @param {number} outputWidth - Optional output width (for aspect ratio control)
     * @param {number} outputHeight - Optional output height (for aspect ratio control)
     * @returns {string} Data URL
     */
    _captureHighQualityRegion(x, y, width, height, qualityMultiplier = 8, format = 'image/png', quality = 1.0, outputWidth = null, outputHeight = null) {
        if (!this.viewer || !this.viewer.renderer || !this.viewer.scene || !this.viewer.camera) {
            console.error('Viewer, renderer, scene, or camera not available');
            return null;
        }
        
        const renderer = this.viewer.renderer;
        const scene = this.viewer.scene;
        const camera = this.viewer.camera;
        
        // Verify we're using the correct camera type based on viewer's camera mode
        // This ensures we capture with the same projection as the viewport
        const expectedCameraMode = this.viewer.cameraMode || (camera.isPerspectiveCamera ? 'perspective' : 'orthographic');
        const isOrthographic = expectedCameraMode === 'orthographic';
        
        // Ensure we're using the correct camera
        if (isOrthographic && !camera.isOrthographicCamera) {
            console.warn('Viewer is in orthographic mode but camera is perspective. Using current camera.');
        } else if (!isOrthographic && !camera.isPerspectiveCamera) {
            console.warn('Viewer is in perspective mode but camera is orthographic. Using current camera.');
        }
        
        // Calculate high-resolution dimensions
        // Use output dimensions if provided (for aspect ratio control), otherwise use calculated dimensions
        const highResWidth = outputWidth ? Math.floor(outputWidth) : Math.floor(width * qualityMultiplier);
        const highResHeight = outputHeight ? Math.floor(outputHeight) : Math.floor(height * qualityMultiplier);
        
        // Store original renderer settings
        const originalSize = renderer.getSize(new THREE.Vector2());
        const originalViewport = renderer.getViewport(new THREE.Vector4());
        const originalPixelRatio = renderer.getPixelRatio();
        
        // Get container dimensions for aspect calculation
        const container = document.getElementById('container');
        const containerWidth = container ? (container.clientWidth - this.viewer.sidebarWidth) : width;
        const containerHeight = container ? container.clientHeight : height;
        const originalAspect = containerWidth / containerHeight;
        const regionAspect = width / height;
        
        // Store original camera settings
        const cameraOriginalAspect = camera.aspect;
        const cameraOriginalZoom = camera.zoom || 1;
        let cameraOriginalLeft, cameraOriginalRight, cameraOriginalTop, cameraOriginalBottom;
        
        if (camera.isOrthographicCamera) {
            cameraOriginalLeft = camera.left;
            cameraOriginalRight = camera.right;
            cameraOriginalTop = camera.top;
            cameraOriginalBottom = camera.bottom;
        }
        
        // Create render target for high-quality capture with maximum quality settings
        const renderTarget = new THREE.WebGLRenderTarget(highResWidth, highResHeight, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            generateMipmaps: false, // Disable mipmaps for maximum quality
            samples: 0 // No multisampling to ensure pixel-perfect capture
        });
        
        try {
            // Hide axes, cursor, and rotation pivot indicator during capture
            const worldAxesVisible = this.viewer.worldAxesGroup ? this.viewer.worldAxesGroup.visible : false;
            const cursor3DVisible = this.viewer.cursor3DGroup ? this.viewer.cursor3DGroup.visible : false;
            const rotationPivotVisible = this.viewer.rotationPivotIndicatorGroup ? this.viewer.rotationPivotIndicatorGroup.visible : false;
            
            if (this.viewer.worldAxesGroup) {
                this.viewer.worldAxesGroup.visible = false;
            }
            if (this.viewer.cursor3DGroup) {
                this.viewer.cursor3DGroup.visible = false;
            }
            if (this.viewer.rotationPivotIndicatorGroup) {
                this.viewer.rotationPivotIndicatorGroup.visible = false;
            }
            
            // Store current render target to restore later
            const previousRenderTarget = renderer.getRenderTarget();
            
            // Adjust camera aspect ratio for the region
            // IMPORTANT: Preserve the camera type (perspective vs orthographic)
            if (camera.isPerspectiveCamera) {
                camera.aspect = regionAspect;
                camera.updateProjectionMatrix();
            } else if (camera.isOrthographicCamera) {
                // Adjust orthographic camera to match region aspect
                // Preserve the frustum height (top and bottom) and zoom, only adjust width
                const originalFrustumHeight = cameraOriginalTop - cameraOriginalBottom;
                const halfHeight = originalFrustumHeight / 2;
                const halfWidth = halfHeight * regionAspect;
                camera.left = -halfWidth;
                camera.right = halfWidth;
                camera.top = cameraOriginalTop; // Preserve original top
                camera.bottom = cameraOriginalBottom; // Preserve original bottom
                camera.zoom = cameraOriginalZoom; // Preserve original zoom
                camera.updateProjectionMatrix();
            }
            
            // Render to render target at high resolution WITHOUT changing main renderer size
            // This prevents the viewport from being affected
            renderer.setRenderTarget(renderTarget);
            renderer.setViewport(0, 0, highResWidth, highResHeight);
            renderer.render(scene, camera);
            
            // Restore visibility of axes, cursor, and rotation pivot indicator
            if (this.viewer.worldAxesGroup) {
                this.viewer.worldAxesGroup.visible = worldAxesVisible;
            }
            if (this.viewer.cursor3DGroup) {
                this.viewer.cursor3DGroup.visible = cursor3DVisible;
            }
            if (this.viewer.rotationPivotIndicatorGroup) {
                this.viewer.rotationPivotIndicatorGroup.visible = rotationPivotVisible;
            }
            
            // Read pixels from render target immediately (while it's still active)
            const pixelBuffer = new Uint8Array(highResWidth * highResHeight * 4);
            renderer.readRenderTargetPixels(renderTarget, 0, 0, highResWidth, highResHeight, pixelBuffer);
            
            // Convert from linear to sRGB color space to match renderer output
            const sRGBPixelBuffer = this._convertLinearToSRGB(pixelBuffer);
            
            // Immediately restore render target and viewport to prevent viewport changes
            renderer.setRenderTarget(previousRenderTarget);
            renderer.setViewport(originalViewport.x, originalViewport.y, originalViewport.z, originalViewport.w);
            
            // Restore camera settings immediately after restoring viewport
            camera.aspect = cameraOriginalAspect;
            if (camera.isOrthographicCamera) {
                camera.left = cameraOriginalLeft;
                camera.right = cameraOriginalRight;
                camera.top = cameraOriginalTop;
                camera.bottom = cameraOriginalBottom;
                camera.zoom = cameraOriginalZoom; // Restore zoom
            }
            camera.updateProjectionMatrix();
            
            // Create canvas from pixel data
            // WebGL reads pixels bottom-to-top, but canvas expects top-to-bottom
            // So we need to flip the image vertically
            // If output dimensions are specified, use them (for aspect ratio control)
            const finalWidth = outputWidth ? Math.floor(outputWidth) : highResWidth;
            const finalHeight = outputHeight ? Math.floor(outputHeight) : highResHeight;
            
            const canvas = document.createElement('canvas');
            canvas.width = finalWidth;
            canvas.height = finalHeight;
            const ctx = canvas.getContext('2d');
            
            // Create temporary canvas for the flipped render target image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = highResWidth;
            tempCanvas.height = highResHeight;
            const tempCtx = tempCanvas.getContext('2d');
            const imageData = tempCtx.createImageData(highResWidth, highResHeight);
            
            // Flip the pixel buffer vertically
            const bytesPerPixel = 4;
            const rowBytes = highResWidth * bytesPerPixel;
            for (let y = 0; y < highResHeight; y++) {
                const srcRow = y;
                const dstRow = highResHeight - 1 - y;
                const srcOffset = srcRow * rowBytes;
                const dstOffset = dstRow * rowBytes;
                for (let x = 0; x < rowBytes; x++) {
                    imageData.data[dstOffset + x] = sRGBPixelBuffer[srcOffset + x];
                }
            }
            
            tempCtx.putImageData(imageData, 0, 0);
            
            // If output dimensions differ, scale the image to maintain aspect ratio
            if (finalWidth !== highResWidth || finalHeight !== highResHeight) {
                ctx.drawImage(tempCanvas, 0, 0, highResWidth, highResHeight, 0, 0, finalWidth, finalHeight);
            } else {
                ctx.drawImage(tempCanvas, 0, 0);
            }
            
            // Clean up render target
            renderTarget.dispose();
            
            // Renderer settings are already restored above, just ensure display is updated
            // The viewport and render target are already restored, so the display should be unaffected
            
            // Return as data URL
        return canvas.toDataURL(format, quality);
        } catch (error) {
            console.error('Error capturing high-quality image:', error);
            
            // Clean up on error
            renderTarget.dispose();
            
            // Restore render target and viewport
            renderer.setRenderTarget(null);
            renderer.setViewport(originalViewport.x, originalViewport.y, originalViewport.z, originalViewport.w);
            
            // Restore camera on error
            camera.aspect = cameraOriginalAspect;
            if (camera.isOrthographicCamera) {
                camera.left = cameraOriginalLeft;
                camera.right = cameraOriginalRight;
                camera.top = cameraOriginalTop;
                camera.bottom = cameraOriginalBottom;
                camera.zoom = cameraOriginalZoom; // Restore zoom
            }
            camera.updateProjectionMatrix();
            
            // Fallback to regular capture
            return this._captureRegion(this.viewer.renderer.domElement, x, y, width, height);
        }
    }
};