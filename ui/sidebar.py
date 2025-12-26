"""
Sidebar widget for displaying GLTF file information and model statistics.
"""

import customtkinter as ctk
from typing import Optional, Dict
from models.scene import Scene


class InfoSidebar(ctk.CTkFrame):
    """
    Sidebar widget displaying GLTF file information and model statistics.
    """
    
    def __init__(self, parent, **kwargs):
        """
        Initialize the sidebar.
        
        Args:
            parent: Parent widget
            **kwargs: Additional arguments for CTkFrame
        """
        super().__init__(parent, **kwargs)
        
        # Data storage
        self.current_scene: Optional[Scene] = None
        self.model_stats: Optional[Dict] = None
        
        self._create_widgets()
        self._setup_layout()
    
    def _create_widgets(self):
        """Create sidebar widgets."""
        # Title
        self.title_label = ctk.CTkLabel(
            self,
            text="File Information",
            font=ctk.CTkFont(size=16, weight="bold")
        )
        
        # File info frame
        self.file_frame = ctk.CTkFrame(self, fg_color="white")
        
        # File name label
        self.file_name_label = ctk.CTkLabel(
            self.file_frame,
            text="File: -",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="black",
            anchor="w"
        )
        
        # File format label
        self.format_label = ctk.CTkLabel(
            self.file_frame,
            text="Format: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # File size label
        self.size_label = ctk.CTkLabel(
            self.file_frame,
            text="Size: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # Draco compression label
        self.draco_label = ctk.CTkLabel(
            self.file_frame,
            text="Draco: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # Separator
        self.separator1 = ctk.CTkFrame(self.file_frame, height=1, fg_color="gray")
        
        # Model stats title
        self.stats_title = ctk.CTkLabel(
            self.file_frame,
            text="Model Statistics",
            font=ctk.CTkFont(size=12, weight="bold"),
            text_color="black",
            anchor="w"
        )
        
        # Vertices label
        self.vertices_label = ctk.CTkLabel(
            self.file_frame,
            text="Vertices: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # Faces label
        self.faces_label = ctk.CTkLabel(
            self.file_frame,
            text="Faces: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # Materials label
        self.materials_label = ctk.CTkLabel(
            self.file_frame,
            text="Materials: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # Textures label
        self.textures_label = ctk.CTkLabel(
            self.file_frame,
            text="Textures: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
        
        # Animations label
        self.animations_label = ctk.CTkLabel(
            self.file_frame,
            text="Animations: -",
            font=ctk.CTkFont(size=11),
            text_color="black",
            anchor="w"
        )
    
    def _setup_layout(self):
        """Setup sidebar layout."""
        # Configure grid
        self.grid_rowconfigure(1, weight=1)
        self.grid_columnconfigure(0, weight=1)
        
        # Place title
        self.title_label.grid(row=0, column=0, padx=10, pady=(10, 5), sticky="w")
        
        # Place file frame
        self.file_frame.grid(row=1, column=0, padx=10, pady=(0, 10), sticky="nsew")
        self.file_frame.grid_columnconfigure(0, weight=1)
        
        # Place widgets in file frame
        row = 0
        self.file_name_label.grid(row=row, column=0, padx=10, pady=(10, 5), sticky="ew")
        row += 1
        self.format_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.size_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.draco_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.separator1.grid(row=row, column=0, padx=10, pady=10, sticky="ew")
        row += 1
        self.stats_title.grid(row=row, column=0, padx=10, pady=(5, 5), sticky="ew")
        row += 1
        self.vertices_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.faces_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.materials_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.textures_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
        row += 1
        self.animations_label.grid(row=row, column=0, padx=10, pady=2, sticky="ew")
    
    def update_scene(self, scene: Optional[Scene]):
        """
        Update sidebar with scene information.
        
        Args:
            scene: Scene object or None
        """
        self.current_scene = scene
        
        if scene:
            # Update file info
            self.file_name_label.configure(text=f"File: {scene.file_name}")
            
            if scene.file_format:
                self.format_label.configure(text=f"Format: {scene.file_format.value.upper()}")
            else:
                self.format_label.configure(text="Format: -")
            
            self.size_label.configure(text=f"Size: {scene.format_file_size()}")
            self.draco_label.configure(
                text=f"Draco: {'Yes' if scene.is_draco else 'No'}"
            )
        else:
            # Clear file info
            self.file_name_label.configure(text="File: -")
            self.format_label.configure(text="Format: -")
            self.size_label.configure(text="Size: -")
            self.draco_label.configure(text="Draco: -")
            self.model_stats = None
        
        self._update_stats_display()
    
    def update_stats(self, stats: Optional[Dict]):
        """
        Update model statistics.
        
        Args:
            stats: Dictionary with model statistics or None
        """
        self.model_stats = stats
        self._update_stats_display()
    
    def _update_stats_display(self):
        """Update statistics display labels."""
        if self.model_stats:
            vertices = self.model_stats.get('vertices', 0)
            faces = self.model_stats.get('faces', 0)
            materials = self.model_stats.get('materials', 0)
            textures = self.model_stats.get('textures', 0)
            animations = self.model_stats.get('animations', 0)
            
            self.vertices_label.configure(text=f"Vertices: {vertices:,}" if vertices else "Vertices: -")
            self.faces_label.configure(text=f"Faces: {faces:,}" if faces else "Faces: -")
            self.materials_label.configure(text=f"Materials: {materials}" if materials else "Materials: -")
            self.textures_label.configure(text=f"Textures: {textures}" if textures else "Textures: -")
            self.animations_label.configure(text=f"Animations: {animations}" if animations else "Animations: -")
        else:
            self.vertices_label.configure(text="Vertices: -")
            self.faces_label.configure(text="Faces: -")
            self.materials_label.configure(text="Materials: -")
            self.textures_label.configure(text="Textures: -")
            self.animations_label.configure(text="Animations: -")

