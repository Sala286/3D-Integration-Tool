// BufferGeometryUtils for GLTFLoader
// Import THREE from global (since three.min.js is loaded as global)
export function toTrianglesDrawMode(geometry, drawMode) {
    const THREE = window.THREE;
    
    if (!THREE) {
        console.warn('THREE not available in BufferGeometryUtils');
        return geometry;
    }
    
    if (drawMode === THREE.TrianglesDrawMode || drawMode === undefined) {
        return geometry;
    }
    
    // For other draw modes, return as-is (GLTFLoader mainly needs this function to exist)
    return geometry;
}

