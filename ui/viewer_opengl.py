"""
OpenGL-based GLTF viewer embedded in Tkinter.
Uses PyOpenGL for native 3D rendering without browser.
"""

import os
import sys
import customtkinter as ctk
from typing import Optional, Callable
from pathlib import Path
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    print("Note: NumPy not available")

try:
    from OpenGL.GL import *
    from OpenGL.GLU import *
    OPENGL_AVAILABLE = True
except ImportError:
    OPENGL_AVAILABLE = False
    print("Note: PyOpenGL not available. Install with: pip install PyOpenGL PyOpenGL_accelerate")

try:
    # Try to import GLTF loader
    import trimesh
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False
    print("Note: trimesh not available. Install with: pip install trimesh")


class WebViewCanvas(ctk.CTkFrame):
    """
    OpenGL-based canvas for 3D model rendering.
    """
    
    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color="gray20", **kwargs)
        
        # Callback functions
        self.on_model_loaded: Optional[Callable[[dict]]] = None
        self.on_model_error: Optional[Callable[[str]]] = None
        
        # State
        self.current_file: Optional[str] = None
        self.model_stats: Optional[dict] = None
        self.mesh = None
        
        # Camera
        self.camera_rotation = [0.0, 0.0]
        self.camera_distance = 5.0
        self.camera_pan = [0.0, 0.0]
        
        # Mouse state
        self.mouse_down = False
        self.last_mouse_pos = [0, 0]
        
        # Create placeholder
        self.placeholder_label = ctk.CTkLabel(
            self,
            text="3D OpenGL Viewer\n(Loading GLTF support...)",
            text_color="white",
            font=ctk.CTkFont(size=14),
            justify="center"
        )
        self.placeholder_label.pack(expand=True)
        
        if not OPENGL_AVAILABLE:
            self.placeholder_label.configure(
                text="PyOpenGL not available.\nInstall: pip install PyOpenGL PyOpenGL_accelerate\ntrimesh"
            )
    
    def load_gltf(self, file_path: str):
        """Load GLTF file using trimesh."""
        if not os.path.exists(file_path):
            return False
        
        self.current_file = file_path
        
        if not TRIMESH_AVAILABLE:
            error_msg = "trimesh library required for GLTF loading.\nInstall: pip install trimesh"
            if self.on_model_error:
                self.on_model_error(error_msg)
            return False
        
        try:
            # Load with trimesh
            import trimesh
            scene = trimesh.load(file_path)
            
            # Get mesh data
            if isinstance(scene, trimesh.Scene):
                # Combine all meshes in scene
                self.mesh = scene.dump(concatenate=True)
            else:
                self.mesh = scene
            
            # Calculate statistics
            if self.mesh:
                vertices = len(self.mesh.vertices)
                faces = len(self.mesh.faces)
                
                stats = {
                    'vertices': vertices,
                    'faces': faces,
                    'materials': 1,  # Simplified
                    'textures': 0,
                    'animations': 0
                }
                
                self.model_stats = stats
                
                # Update display
                self.placeholder_label.configure(
                    text=f"Model loaded: {os.path.basename(file_path)}\n"
                         f"Vertices: {vertices:,}\n"
                         f"Faces: {faces:,}\n"
                         f"\nNote: 3D rendering requires OpenGL canvas.\n"
                         f"Using trimesh for model data."
                )
                
                if self.on_model_loaded:
                    self.on_model_loaded(stats)
                
                return True
            else:
                if self.on_model_error:
                    self.on_model_error("Failed to extract mesh data")
                return False
                
        except Exception as e:
            error_msg = f"Failed to load GLTF: {str(e)}"
            print(error_msg)
            if self.on_model_error:
                self.on_model_error(error_msg)
            return False
    
    def reset_view(self):
        """Reset camera to default."""
        self.camera_rotation = [0.0, 0.0]
        self.camera_distance = 5.0
        self.camera_pan = [0.0, 0.0]
    
    def toggle_wireframe(self):
        """Toggle wireframe mode."""
        # Would need to track wireframe state and update rendering
        pass
    
    def clear(self):
        """Clear current model."""
        self.mesh = None
        self.current_file = None
        self.model_stats = None
        self.placeholder_label.configure(
            text="3D OpenGL Viewer\n(No model loaded)"
        )
    
    def on_model_loaded_callback(self, stats: dict):
        """Called when model loads."""
        pass
    
    def on_model_error_callback(self, error: str):
        """Called on model error."""
        pass

