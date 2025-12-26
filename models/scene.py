"""
Scene data models for GLTF viewer.
"""

from typing import Optional
from enum import Enum


class FileFormat(Enum):
    """GLTF file format types."""
    GLTF = "gltf"
    GLB = "glb"


class Scene:
    """
    Represents a loaded GLTF scene with metadata.
    """
    
    def __init__(self, file_path: str):
        """
        Initialize scene from file path.
        
        Args:
            file_path: Path to GLTF/GLB file
        """
        self.file_path = file_path
        self.file_name: str = ""
        self.file_format: Optional[FileFormat] = None
        self.file_size: int = 0
        self.is_draco: bool = False
        self.is_loaded: bool = False
        
        # Model statistics (populated after loading)
        self.vertex_count: Optional[int] = None
        self.face_count: Optional[int] = None
        self.material_count: Optional[int] = None
        self.texture_count: Optional[int] = None
        
        # Extract basic info from file path
        if file_path:
            import os
            self.file_name = os.path.basename(file_path)
            ext = os.path.splitext(file_path)[1].lower()
            if ext == '.gltf':
                self.file_format = FileFormat.GLTF
            elif ext == '.glb':
                self.file_format = FileFormat.GLB
            
            try:
                self.file_size = os.path.getsize(file_path)
            except OSError:
                self.file_size = 0
    
    def format_file_size(self) -> str:
        """Format file size in human-readable format."""
        if self.file_size < 1024:
            return f"{self.file_size} B"
        elif self.file_size < 1024 * 1024:
            return f"{self.file_size / 1024:.2f} KB"
        else:
            return f"{self.file_size / (1024 * 1024):.2f} MB"
    
    def reset(self):
        """Reset scene to unloaded state."""
        self.is_loaded = False
        self.vertex_count = None
        self.face_count = None
        self.material_count = None
        self.texture_count = None

