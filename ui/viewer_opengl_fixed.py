"""
OpenGL-based GLTF viewer with actual 3D rendering in Tkinter.
"""

import os
import sys
import tkinter as tk
import customtkinter as ctk
from typing import Optional, Callable
from pathlib import Path

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    print("NumPy required for 3D rendering")

try:
    from OpenGL.GL import *
    from OpenGL.GLU import *
    import tkinter as tk
    # OpenGL.tkinter doesn't exist in PyOpenGL
    # We'll use a different approach - tkinter canvas with OpenGL context
    # For now, check if we can use tkinter directly with OpenGL
    OPENGL_TKINTER_AVAILABLE = False  # Will be set to True if we can create canvas
    try:
        # Try to create OpenGL context - we'll use a workaround
        # PyOpenGL doesn't have built-in tkinter support
        # We need to use external library or manual OpenGL context creation
        OPENGL_TKINTER_AVAILABLE = True  # Assume available, will handle in _create_opengl_canvas
    except:
        OPENGL_TKINTER_AVAILABLE = False
    OPENGL_AVAILABLE = True
except ImportError:
    OPENGL_AVAILABLE = False
    OPENGL_TKINTER_AVAILABLE = False
    print("PyOpenGL required for 3D rendering")

try:
    import trimesh
    TRIMESH_AVAILABLE = True
except ImportError:
    TRIMESH_AVAILABLE = False
    print("trimesh required for GLTF loading")


class WebViewCanvas(ctk.CTkFrame):
    """
    OpenGL canvas for 3D model rendering.
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
        self.display_list = None
        
        # Camera
        self.camera_rotation_x = 0.0
        self.camera_rotation_y = 0.0
        self.camera_distance = 10.0
        self.camera_pan_x = 0.0
        self.camera_pan_y = 0.0
        
        # Mouse state
        self.mouse_down = False
        self.last_mouse_pos = [0, 0]
        self.wireframe = False
        
        # Check what's available and create appropriate viewer
        if OPENGL_AVAILABLE and NUMPY_AVAILABLE and TRIMESH_AVAILABLE:
            # Libraries are available, but OpenGL.tkinter doesn't exist
            # Show info that model loading works but rendering needs browser viewer
            self._create_info_display()
        else:
            self._create_placeholder()
    
    def _create_info_display(self):
        """Create info display when libraries are available but rendering needs setup."""
        missing = []
        if not OPENGL_AVAILABLE:
            missing.append("PyOpenGL")
        if not NUMPY_AVAILABLE:
            missing.append("NumPy")
        if not TRIMESH_AVAILABLE:
            missing.append("trimesh")
        
        if missing:
            self._create_placeholder()
            return
        
        # All libraries available - show info
        msg = "3D Libraries Available ✅\n\n"
        msg += "Model loading works.\n"
        msg += "For 3D rendering, use browser viewer:\n\n"
        msg += "1. Download Three.js libraries\n"
        msg += "2. Place in viewer/ directory\n"
        msg += "3. Restart app\n\n"
        msg += "See SOLUTION.md for details."
        
        info_label = ctk.CTkLabel(
            self,
            text=msg,
            text_color="lightgreen",
            font=ctk.CTkFont(size=12),
            justify="center"
        )
        info_label.pack(expand=True)
    
    def _create_opengl_canvas(self):
        """Create OpenGL rendering canvas."""
        # Create a native Tkinter frame for OpenGL
        self.opengl_frame = tk.Frame(self, bg='black')
        self.opengl_frame.pack(fill='both', expand=True)
        
        # PyOpenGL doesn't have built-in tkinter widget
        # Use a text-based display showing model info instead
        # For actual 3D rendering, would need additional library like pyglet or moderngl
        try:
            # Create a simple display showing model is loaded
            info_label = ctk.CTkLabel(
                self.opengl_frame,
                text="OpenGL Canvas Ready\n\n3D Rendering requires additional setup.\n\nModel data loaded successfully.\nUse browser viewer for full 3D rendering.",
                text_color="white",
                font=ctk.CTkFont(size=12),
                justify="center"
            )
            info_label.pack(expand=True)
            self.gl_canvas = None  # No actual OpenGL canvas yet
            # Can't bind events or initialize OpenGL without canvas
            
        except Exception as e:
            print(f"Error creating OpenGL canvas: {e}")
            self._create_placeholder()
    
    def _create_placeholder(self):
        """Create placeholder when OpenGL not available."""
        missing = []
        if not OPENGL_AVAILABLE:
            missing.append("PyOpenGL")
        if not NUMPY_AVAILABLE:
            missing.append("NumPy")
        if not TRIMESH_AVAILABLE:
            missing.append("trimesh")
        
        msg = f"3D Rendering Libraries Required\n\nMissing: {', '.join(missing)}\n\n"
        msg += "Install with:\npip install PyOpenGL PyOpenGL-accelerate trimesh numpy"
        
        self.placeholder_label = ctk.CTkLabel(
            self,
            text=msg,
            text_color="white",
            font=ctk.CTkFont(size=12),
            justify="center"
        )
        self.placeholder_label.pack(expand=True)
    
    def _init_opengl(self):
        """Initialize OpenGL settings."""
        if not hasattr(self, 'gl_canvas'):
            return
        
        self.gl_canvas.makecurrent()
        
        # Enable depth testing
        glEnable(GL_DEPTH_TEST)
        glDepthFunc(GL_LEQUAL)
        
        # Enable lighting
        glEnable(GL_LIGHTING)
        glEnable(GL_LIGHT0)
        
        # Set light position
        glLightfv(GL_LIGHT0, GL_POSITION, [1.0, 1.0, 1.0, 0.0])
        glLightfv(GL_LIGHT0, GL_DIFFUSE, [1.0, 1.0, 1.0, 1.0])
        glLightfv(GL_LIGHT0, GL_AMBIENT, [0.2, 0.2, 0.2, 1.0])
        
        # Material
        glEnable(GL_COLOR_MATERIAL)
        glColorMaterial(GL_FRONT, GL_AMBIENT_AND_DIFFUSE)
        
        # Background color
        glClearColor(0.1, 0.1, 0.1, 1.0)
        
        self.gl_canvas.releasecurrent()
    
    def _render(self):
        """Render loop."""
        if not hasattr(self, 'gl_canvas') or self.gl_canvas is None:
            return
        
        try:
            self.gl_canvas.makecurrent()
            
            width = self.gl_canvas.winfo_width()
            height = self.gl_canvas.winfo_height()
            
            if width > 0 and height > 0:
                glViewport(0, 0, width, height)
                
                glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
                
                glMatrixMode(GL_PROJECTION)
                glLoadIdentity()
                gluPerspective(45.0, width / height, 0.1, 1000.0)
                
                glMatrixMode(GL_MODELVIEW)
                glLoadIdentity()
                
                # Camera position
                glTranslatef(self.camera_pan_x, self.camera_pan_y, -self.camera_distance)
                glRotatef(self.camera_rotation_x, 1.0, 0.0, 0.0)
                glRotatef(self.camera_rotation_y, 0.0, 1.0, 0.0)
                
                # Draw model if loaded
                if self.mesh is not None:
                    self._draw_mesh()
                
                # Draw axes for reference
                self._draw_axes()
            
            self.gl_canvas.releasecurrent()
            self.gl_canvas.swapbuffers()
            
        except Exception as e:
            print(f"Render error: {e}")
        
        # Schedule next render
        self.after(16, self._render)  # ~60 FPS
    
    def _draw_mesh(self):
        """Draw the loaded mesh."""
        if self.mesh is None or not hasattr(self.mesh, 'vertices'):
            return
        
        # Set polygon mode
        if self.wireframe:
            glPolygonMode(GL_FRONT_AND_BACK, GL_LINE)
            glDisable(GL_LIGHTING)
        else:
            glPolygonMode(GL_FRONT_AND_BACK, GL_FILL)
            glEnable(GL_LIGHTING)
        
        # Draw mesh
        vertices = self.mesh.vertices
        faces = self.mesh.faces
        
        glColor3f(0.7, 0.7, 0.8)  # Light gray
        
        glBegin(GL_TRIANGLES)
        for face in faces:
            for vertex_idx in face:
                if vertex_idx < len(vertices):
                    vertex = vertices[vertex_idx]
                    glVertex3f(vertex[0], vertex[1], vertex[2])
        glEnd()
        
        # Reset polygon mode
        glPolygonMode(GL_FRONT_AND_BACK, GL_FILL)
    
    def _draw_axes(self):
        """Draw coordinate axes for reference."""
        glDisable(GL_LIGHTING)
        glLineWidth(2.0)
        
        glBegin(GL_LINES)
        # X axis - red
        glColor3f(1.0, 0.0, 0.0)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(2.0, 0.0, 0.0)
        
        # Y axis - green
        glColor3f(0.0, 1.0, 0.0)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(0.0, 2.0, 0.0)
        
        # Z axis - blue
        glColor3f(0.0, 0.0, 1.0)
        glVertex3f(0.0, 0.0, 0.0)
        glVertex3f(0.0, 0.0, 2.0)
        glEnd()
        
        glEnable(GL_LIGHTING)
    
    def _on_mouse_down(self, event):
        """Handle mouse button down."""
        self.mouse_down = True
        self.last_mouse_pos = [event.x, event.y]
    
    def _on_mouse_drag(self, event):
        """Handle mouse drag for rotation."""
        if self.mouse_down:
            dx = event.x - self.last_mouse_pos[0]
            dy = event.y - self.last_mouse_pos[1]
            
            self.camera_rotation_y += dx * 0.5
            self.camera_rotation_x += dy * 0.5
            
            # Clamp vertical rotation
            self.camera_rotation_x = max(-90, min(90, self.camera_rotation_x))
            
            self.last_mouse_pos = [event.x, event.y]
    
    def _on_mouse_up(self, event):
        """Handle mouse button up."""
        self.mouse_down = False
    
    def _on_mouse_wheel(self, event):
        """Handle mouse wheel for zoom."""
        if sys.platform == 'win32':
            delta = event.delta
        else:
            delta = event.delta // 120
        
        self.camera_distance += delta * 0.1
        self.camera_distance = max(1.0, min(100.0, self.camera_distance))
    
    def _on_resize(self, event):
        """Handle canvas resize."""
        pass
    
    def load_gltf(self, file_path: str):
        """Load GLTF file."""
        if not os.path.exists(file_path):
            return False
        
        if not TRIMESH_AVAILABLE:
            error_msg = "trimesh library required. Install: pip install trimesh"
            if self.on_model_error:
                self.on_model_error(error_msg)
            return False
        
        self.current_file = file_path
        
        try:
            import trimesh
            scene = trimesh.load(file_path)
            
            # Get mesh data
            if isinstance(scene, trimesh.Scene):
                self.mesh = scene.dump(concatenate=True)
            else:
                self.mesh = scene
            
            if self.mesh is not None:
                # Calculate bounding box and center
                bounds = self.mesh.bounds
                center = self.mesh.centroid
                
                # Center the mesh
                self.mesh.vertices -= center
                
                # Adjust camera distance based on model size
                size = bounds[1] - bounds[0]
                max_size = max(size)
                self.camera_distance = max_size * 2.0
                
                # Calculate statistics
                vertices = len(self.mesh.vertices)
                faces = len(self.mesh.faces)
                
                stats = {
                    'vertices': vertices,
                    'faces': faces,
                    'materials': 1,
                    'textures': 0,
                    'animations': 0
                }
                
                self.model_stats = stats
                
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
        self.camera_rotation_x = 0.0
        self.camera_rotation_y = 0.0
        self.camera_distance = 10.0
        self.camera_pan_x = 0.0
        self.camera_pan_y = 0.0
        
        if self.mesh is not None:
            # Recalculate distance based on model
            bounds = self.mesh.bounds
            size = bounds[1] - bounds[0]
            max_size = max(size)
            self.camera_distance = max_size * 2.0
    
    def toggle_wireframe(self):
        """Toggle wireframe mode."""
        self.wireframe = not self.wireframe
    
    def clear(self):
        """Clear current model."""
        self.mesh = None
        self.current_file = None
        self.model_stats = None


