/**
 * THREE.STLLoader
 * Adapted from three.js examples (https://threejs.org/)
 */

(function () {
    if (typeof THREE === 'undefined') {
        console.error('THREE.STLLoader requires THREE to be available globally.');
        return;
    }

    THREE.STLLoader = function (manager) {
        this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
    };

    THREE.STLLoader.prototype = {
        constructor: THREE.STLLoader,

        load: function (url, onLoad, onProgress, onError) {
            const scope = this;
            const loader = new THREE.FileLoader(scope.manager);
            loader.setResponseType('arraybuffer');
            loader.load(
                url,
                function (data) {
                    try {
                        onLoad(scope.parse(data));
                    } catch (e) {
                        if (onError) {
                            onError(e);
                        } else {
                            throw e;
                        }
                    }
                },
                onProgress,
                onError
            );
        },

        parse: function (data) {
            const isBinary = this.isBinary(data);
            return isBinary ? this.parseBinary(data) : this.parseASCII(this.ensureString(data));
        },

        parseASCII: function (data) {
            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const normals = [];
            const patternFace = /facet([\s\S]*?)endfacet/g;
            let faceCounter = 0;

            let result;
            while ((result = patternFace.exec(data)) !== null) {
                const face = result[0];
                const patternNormal = /facet\s+normal\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;
                let normalResult;
                while ((normalResult = patternNormal.exec(face)) !== null) {
                    normals.push(parseFloat(normalResult[1]), parseFloat(normalResult[2]), parseFloat(normalResult[3]));
                }

                const vertexPattern = /vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;
                let vertexResult;
                while ((vertexResult = vertexPattern.exec(face)) !== null) {
                    vertices.push(parseFloat(vertexResult[1]), parseFloat(vertexResult[2]), parseFloat(vertexResult[3]));
                }

                faceCounter++;
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

            if (normals.length === vertices.length) {
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            } else {
                geometry.computeVertexNormals();
            }

            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            return geometry;
        },

        parseBinary: function (data) {
            const reader = new DataView(data);
            const faces = reader.getUint32(80, true);
            let offset = 84;

            const geometry = new THREE.BufferGeometry();
            const vertices = new Float32Array(faces * 9);
            const normals = new Float32Array(faces * 9);

            for (let face = 0; face < faces; face++) {
                const start = offset;
                const normalX = reader.getFloat32(offset, true); offset += 4;
                const normalY = reader.getFloat32(offset, true); offset += 4;
                const normalZ = reader.getFloat32(offset, true); offset += 4;

                for (let i = 0; i < 3; i++) {
                    const vx = reader.getFloat32(offset, true); offset += 4;
                    const vy = reader.getFloat32(offset, true); offset += 4;
                    const vz = reader.getFloat32(offset, true); offset += 4;

                    vertices[face * 9 + i * 3 + 0] = vx;
                    vertices[face * 9 + i * 3 + 1] = vy;
                    vertices[face * 9 + i * 3 + 2] = vz;

                    normals[face * 9 + i * 3 + 0] = normalX;
                    normals[face * 9 + i * 3 + 1] = normalY;
                    normals[face * 9 + i * 3 + 2] = normalZ;
                }

                offset = start + 50;
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();

            return geometry;
        },

        ensureString: function (buffer) {
            if (typeof buffer !== 'string') {
                const arrayBuffer = buffer;
                const enc = new TextDecoder('utf-8');
                buffer = enc.decode(new Uint8Array(arrayBuffer));
            }
            return buffer;
        },

        ensureBinary: function (buffer) {
            if (typeof buffer === 'string') {
                const arrayBuffer = new Uint8Array(buffer.length);
                for (let i = 0; i < buffer.length; i++) {
                    arrayBuffer[i] = buffer.charCodeAt(i) & 0xff;
                }
                return arrayBuffer.buffer || arrayBuffer;
            } else {
                return buffer;
            }
        },

        isBinary: function (data) {
            const reader = new DataView(data);
            // Binary STL files start with an 80 byte header.
            // An ASCII STL file begins with the string 'solid '.
            const faceSize = 50;
            const nFaces = reader.getUint32(80, true);
            const expectedSize = 80 + 4 + nFaces * faceSize;
            if (expectedSize === reader.byteLength) {
                return true;
            }

            const header = this.ensureString(data).substr(0, 5);
            return header !== 'solid';
        }
    };
})();

