# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files

# Collect essential data files
pil_datas = collect_data_files('PIL')
ctk_datas = collect_data_files('customtkinter')
datas = pil_datas + ctk_datas

# Collect viewer directory (HTML, JS, CSS files)
project_root = os.path.abspath('.')
viewer_dir = os.path.join(project_root, 'viewer')
if os.path.exists(viewer_dir):
    # Add all files from viewer directory - preserve subdirectory structure
    viewer_files = []
    for root, dirs, files in os.walk(viewer_dir):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ['__pycache__', 'node_modules']]
        for file in files:
            # Skip hidden files
            if file.startswith('.') or file.endswith('.pyc'):
                continue
            src_path = os.path.join(root, file)
            # Calculate relative path from viewer directory to preserve subdirectories
            rel_path = os.path.relpath(src_path, viewer_dir)
            # Put files in 'viewer' directory preserving subdirectory structure
            dest_dir = os.path.join('viewer', os.path.dirname(rel_path)) if os.path.dirname(rel_path) else 'viewer'
            viewer_files.append((src_path, dest_dir))
    datas.extend(viewer_files)

# Project root and main script
main_script = os.path.join(project_root, 'main.py')

a = Analysis(
    [main_script],
    pathex=[project_root],
    binaries=[],
    datas=datas,
    hiddenimports=[
        # Core application modules
        'models.scene',
        'models',
        'ui.toolbar',
        'ui.sidebar',
        'ui.viewer_browser',
        'ui.viewer_embedded',
        'ui.viewer_opengl',
        'ui.viewer_opengl_fixed',
        'ui.viewer_tkinter',
        'ui.viewer',
        'ui.viewer_simple',
        'ui',

        # Essential third-party libraries
        'customtkinter',
        'PIL',
        'PIL.Image',
        'PIL.ImageTk',
        'webview',
        'webview.platforms',
        
        # Standard library - only include what might be missed
        'tkinter',
        'tkinter.filedialog',
        'tkinter.messagebox',
        'tkinter.simpledialog',
        'tkinter.ttk',
        'threading',
        'pathlib',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy modules
        'matplotlib',
        'scipy', 
        'pandas',
        'jupyter',
        'notebook',
        'IPython',
        'unittest',
        'test',
        'pydoc',
        'doctest',
        'pdb',
        'profile',
        'pstats',
        'cProfile',
        'trace',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False,
    optimize=2,  # Higher optimization for better performance
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="3D-Integration-Tool",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Hide console for better performance (set to True for debugging)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

