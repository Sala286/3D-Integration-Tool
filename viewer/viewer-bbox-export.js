/**
 * GLTF Viewer - Boundary Box CSV Export Module
 * Generates a CSV file containing axis-aligned bounding box sizes per mesh.
 */

(function () {
    if (typeof GLTFViewer === 'undefined') {
        return;
    }

    const formatNumber = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return '0.000';
        }
        return num.toFixed(3);
    };

    const escapeCsv = (value) => {
        const safe = String(value ?? '').replace(/"/g, '""');
        return `"${safe}"`;
    };

    GLTFViewer.prototype.exportBoundaryBoxCSV = function () {
        if (!this.loadedModels || this.loadedModels.length === 0) {
            alert('Please load a model before exporting boundary box sizes.');
            return;
        }

        const entries = [];
        const tempBox = new THREE.Box3();
        const size = new THREE.Vector3();

        const scaleFactor = 1000;

        this.loadedModels.forEach((modelData) => {
            if (!modelData || !modelData.model) {
                return;
            }

            modelData.model.traverse((child) => {
                if (!child || !child.isMesh) {
                    return;
                }

                tempBox.setFromObject(child);
                if (tempBox.isEmpty()) {
                    return;
                }

                tempBox.getSize(size);
                const name = this._getOriginalObjectName
                    ? this._getOriginalObjectName(child, child.name || 'Unnamed Part')
                    : (child.userData && child.userData.name) || child.name || 'Unnamed Part';

                entries.push({
                    name,
                    length: size.x * scaleFactor,
                    width: size.y * scaleFactor,
                    height: size.z * scaleFactor
                });
            });
        });

        if (entries.length === 0) {
            alert('No mesh parts found for boundary export.');
            return;
        }

        const rows = [['Name', 'Length', 'Width', 'Height']];
        entries.forEach((entry) => {
            rows.push([
                entry.name,
                formatNumber(entry.length),
                formatNumber(entry.width),
                formatNumber(entry.height)
            ]);
        });

        const csvContent = rows
            .map((row) => row.map(escapeCsv).join(','))
            .join('\r\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultName = this.loadedModels.length === 1
            ? (this.loadedModels[0].name || 'model')
            : 'models';
        link.href = URL.createObjectURL(blob);
        link.download = `${defaultName}-bbox-${timestamp}.csv`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };

    window.exportBoundaryBoxCSV = function () {
        if (typeof viewer !== 'undefined' && viewer && typeof viewer.exportBoundaryBoxCSV === 'function') {
            viewer.exportBoundaryBoxCSV();
        } else {
            alert('Viewer not ready. Please wait for initialization.');
        }
    };
})();

