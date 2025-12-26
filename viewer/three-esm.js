// ES Module wrapper for three.min.js
// This file exports THREE from window.THREE as ES module
// Note: three.min.js must be loaded first via script tag

// Re-export everything from window.THREE as named exports
// Since three.min.js sets window.THREE, we access it here

// Wait for THREE to be available
if (typeof window !== 'undefined' && window.THREE) {
    // Export all THREE exports
    export * from window.THREE;
    export default window.THREE;
} else {
    // Dynamic import approach - but this is tricky
    // Better to use three.module.js
    throw new Error('THREE not available. Load three.min.js first via script tag.');
}

