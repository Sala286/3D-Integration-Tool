"""
Toolbar widget for the GLTF Viewer application.
Contains action buttons for GLTF operations.
"""

import customtkinter as ctk
from typing import Callable, Optional


class Toolbar(ctk.CTkFrame):
    """
    Toolbar containing action buttons for the GLTF viewer application.
    """
    
    def __init__(self, parent, **kwargs):
        """
        Initialize the toolbar.
        
        Args:
            parent: Parent widget
            **kwargs: Additional arguments for CTkFrame
        """
        super().__init__(parent, **kwargs)
        
        # Callback functions (set by parent)
        self.on_open_browser: Optional[Callable] = None
        self.on_stop_server: Optional[Callable] = None
        self.on_clear: Optional[Callable] = None
        self.on_select_export_folder: Optional[Callable] = None
        
        # Export folder state
        self.export_folder_path: Optional[str] = None
        
        self._create_widgets()
        self._setup_layout()
    
    def _create_widgets(self):
        """Create toolbar widgets."""
        # Export folder heading
        self.export_folder_heading = ctk.CTkLabel(
            self,
            text="Export folder",
            font=ctk.CTkFont(size=14, weight="bold")
        )
        
        # Tick indicator for export folder (hidden by default)
        self.export_folder_tick = ctk.CTkLabel(
            self,
            text="✓",
            font=ctk.CTkFont(size=16, weight="bold"),
            text_color="#00AA00",
            width=25
        )
        self.export_folder_tick.grid_remove()  # Hide by default
        
        self.export_folder_entry = ctk.CTkEntry(
            self,
            placeholder_text="Not selected",
            font=ctk.CTkFont(size=11),
            height=32
        )
        
        self.select_export_folder_btn = ctk.CTkButton(
            self,
            text="Select",
            command=self._on_select_export_folder_clicked,
            width=80,
            height=32,
            fg_color="#6C63FF",
            hover_color="#5B54E6",
            font=ctk.CTkFont(size=11, weight="bold")
        )
        
        # Open Browser button
        self.open_browser_btn = ctk.CTkButton(
            self,
            text="Open Browser",
            command=self._on_open_browser_clicked,
            width=200,
            height=32,
            fg_color="#6C63FF",
            hover_color="#5B54E6",
            font=ctk.CTkFont(size=11, weight="bold")
        )
        
        # Stop Server button
        self.stop_server_btn = ctk.CTkButton(
            self,
            text="Stop Server",
            command=self._on_stop_server_clicked,
            width=200,
            height=32,
            state="disabled",
            fg_color="#6C63FF",
            hover_color="#5B54E6",
            font=ctk.CTkFont(size=11, weight="bold")
        )
        
        # Clear button
        self.clear_btn = ctk.CTkButton(
            self,
            text="Clear",
            command=self._on_clear_clicked,
            width=200,
            height=32,
            fg_color="#6C63FF",
            hover_color="#5B54E6",
            font=ctk.CTkFont(size=11, weight="bold")
        )
    
    def _setup_layout(self):
        """Setup toolbar layout - vertical layout."""
        # Configure grid
        self.grid_columnconfigure(0, weight=0)  # Tick column (fixed width)
        self.grid_columnconfigure(1, weight=1)  # Entry column (expands)
        self.grid_columnconfigure(2, weight=0)  # Button column (fixed width)
        
        # Export folder section
        self.export_folder_heading.grid(row=0, column=0, columnspan=3, sticky="w", pady=(10, 5))
        self.export_folder_entry.grid(row=1, column=1, sticky="ew", padx=(5, 10), pady=(0, 15))
        self.select_export_folder_btn.grid(row=1, column=2, sticky="e", pady=(0, 15))
        
        # Open Browser button
        self.open_browser_btn.grid(row=2, column=0, columnspan=3, pady=(0, 10))
        
        # Stop Server button
        self.stop_server_btn.grid(row=3, column=0, columnspan=3, pady=(0, 10))
        
        # Clear button
        self.clear_btn.grid(row=4, column=0, columnspan=3, pady=(0, 10))
    
    def _on_clear_clicked(self):
        """Handle clear button click."""
        if self.on_clear:
            self.on_clear()
    
    def _on_open_browser_clicked(self):
        """Handle open browser button click."""
        if self.on_open_browser:
            self.on_open_browser()
    
    def _on_stop_server_clicked(self):
        """Handle stop server button click."""
        if self.on_stop_server:
            self.on_stop_server()
    
    def _on_select_export_folder_clicked(self):
        """Handle select export folder button click."""
        if self.on_select_export_folder:
            self.on_select_export_folder()
    
    def set_export_folder(self, folder_path: str):
        """Update export folder display."""
        import os
        self.export_folder_path = folder_path
        if folder_path:
            self.export_folder_entry.delete(0, "end")
            self.export_folder_entry.insert(0, folder_path)
            # Check if folder exists and show/hide tick
            if os.path.exists(folder_path) and os.path.isdir(folder_path):
                self.export_folder_tick.grid(row=1, column=0, padx=(0, 5), sticky="w", pady=(0, 15))
            else:
                self.export_folder_tick.grid_remove()
        else:
            self.export_folder_entry.delete(0, "end")
            self.export_folder_entry.insert(0, "")
            self.export_folder_tick.grid_remove()
    
    def _check_export_folder_exists(self, folder_path: str) -> bool:
        """Check if export folder exists and is accessible."""
        import os
        if not folder_path:
            return False
        return os.path.exists(folder_path) and os.path.isdir(folder_path)
    
    def get_export_folder(self) -> Optional[str]:
        """Get the selected export folder path."""
        return self.export_folder_path
    
    def set_server_running(self, running: bool):
        """Update server running state."""
        # Open Browser button stays enabled always - user can open browser multiple times
        # Only update Stop Server button state
        if running:
            self.stop_server_btn.configure(state="normal")
        else:
            self.stop_server_btn.configure(state="disabled")
    
    def set_clear_enabled(self, enabled: bool):
        """
        Enable or disable clear button.
        
        Args:
            enabled: Whether clear button should be enabled
        """
        if enabled:
            self.clear_btn.configure(state="normal")
        else:
            self.clear_btn.configure(state="disabled")
    

