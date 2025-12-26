// Wrapper to make window.THREE (from three.min.js UMD) available as ES module export
// This allows ES modules to import from 'three' even though three.min.js is UMD

// Wait for THREE to be available (from three.min.js loaded via script tag)
if (typeof window !== 'undefined' && window.THREE) {
    // Export everything from window.THREE
    export * from window.THREE;
} else {
    // If THREE not ready, wait for it
    // Note: This approach has limitations - better to use three.module.js
    console.warn('THREE not available yet in module wrapper');
}

// Alternative approach: Create exports manually
// This is a workaround - ideally use three.module.js
export default typeof window !== 'undefined' ? window.THREE : {};

