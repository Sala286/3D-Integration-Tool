"""
Quick script to check if Three.js libraries are present.
"""

import os
from pathlib import Path

viewer_dir = Path(__file__).parent / "viewer"

required_files = [
    "three.min.js",
    "GLTFLoader.js",
    "DRACOLoader.js",
    "OrbitControls.js",
    "draco_decoder_gltf.js"
]

optional_files = [
    "draco_decoder_gltf.wasm"
]

print("Checking Three.js libraries...")
print(f"Viewer directory: {viewer_dir}\n")

missing_required = []
missing_optional = []

for file in required_files:
    file_path = viewer_dir / file
    if file_path.exists():
        size = file_path.stat().st_size
        print(f"[OK] {file} ({size:,} bytes)")
    else:
        print(f"[MISSING] {file} - MISSING")
        missing_required.append(file)

print("\nOptional files:")
for file in optional_files:
    file_path = viewer_dir / file
    if file_path.exists():
        size = file_path.stat().st_size
        print(f"[OK] {file} ({size:,} bytes)")
    else:
        print(f"[OPTIONAL] {file} - Not found (optional)")

if missing_required:
    print(f"\n[MISSING] Missing {len(missing_required)} required file(s)!")
    print("Download instructions: See viewer/README_LIBRARIES.md")
    print("\nQuick download links:")
    print("1. three.min.js: https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js")
    print("2. GLTFLoader.js: https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/GLTFLoader.js")
    print("   (Note: This is ES module, you may need browser-compatible version)")
else:
    print("\n[OK] All required libraries found!")

