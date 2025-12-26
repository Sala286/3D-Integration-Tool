"""
GLTF Viewer Desktop Application
Main application window that coordinates all components.
"""

try:
    import customtkinter as ctk
    import tkinter as tk
    from tkinter import messagebox, filedialog, simpledialog
    import os
    import sys
    import queue
    from typing import Optional
    
    # Add current directory to path for imports
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
except ImportError as e:
    print(f"Import error: {e}")
    print("Please install required packages:")
    print("pip install customtkinter pywebview Pillow")
    input("Press Enter to exit...")
    exit(1)

try:
    from models.scene import Scene
    from ui.toolbar import Toolbar
    # Check if Three.js libraries are available
    import os
    import sys
    from pathlib import Path
    
    # Handle PyInstaller bundle path
    if getattr(sys, 'frozen', False):
        # Running as compiled exe
        base_path = Path(sys._MEIPASS)
    else:
        # Running as script
        base_path = Path(__file__).parent
    
    viewer_dir = base_path / "viewer"
    three_js_available = (viewer_dir / "three.min.js").exists() and (viewer_dir / "GLTFLoader.js").exists()
    
    if three_js_available:
        # Three.js available - use browser viewer (works reliably)
        try:
            from ui.viewer_browser import WebViewCanvas
            print("Using browser-based viewer (opens in external browser)")
        except (ImportError, Exception):
            # Fallback to other viewers if browser viewer fails
            try:
                from ui.viewer import WebViewCanvas
                print("Using pywebview embedded viewer (Three.js libraries found)")
            except (ImportError, Exception):
                try:
                    from ui.viewer_opengl_fixed import WebViewCanvas
                    print("Using OpenGL viewer (embedded viewer failed)")
                except (ImportError, Exception):
                    from ui.viewer_tkinter import WebViewCanvas
                    print("Using text info viewer")
    else:
        # No Three.js - try OpenGL or text viewer
        try:
            from ui.viewer_opengl_fixed import WebViewCanvas
            print("Using OpenGL-based native 3D renderer (no Three.js libraries)")
        except ImportError:
            try:
                from ui.viewer_opengl import WebViewCanvas
                print("Using basic OpenGL renderer")
            except ImportError:
                try:
                    from ui.viewer_tkinter import WebViewCanvas
                    print("Using Tkinter-native embedded viewer (no browser window)")
                except ImportError:
                    try:
                        from ui.viewer import WebViewCanvas
                        print("Using embedded viewer (no Three.js libraries)")
                    except ImportError:
                        from ui.viewer_browser import WebViewCanvas
                        print("Using browser-based viewer (fallback)")
except ImportError as e:
    print(f"Module import error: {e}")
    print("Please ensure all modules are in the correct location")
    input("Press Enter to exit...")
    exit(1)


class GLTFViewerApp(ctk.CTk):
    """
    Main application class for the GLTF Viewer desktop application.
    """
    
    def __init__(self):
        """Initialize the application."""
        super().__init__()
        
        # Application settings
        self.title("3D Integration Tool - Desktop Controller")
        self.geometry("600x500")
        self.minsize(500, 400)
        
        # Set background to white
        self.configure(fg_color="white")
        
        # Set appearance mode and color theme
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        
        # Application state
        self.current_scene: Optional[Scene] = None
        
        # Thread-safe file selection
        self._file_selection_queue = queue.Queue()
        self._external_update_queue = queue.Queue()
        self._file_selection_pending = False
        self.loaded_files = []
        
        # Export folder for images
        self.export_folder: Optional[str] = None
        
        # Initialize components
        self._create_widgets()
        self._setup_layout()
        self._bind_events()
        
        # Set app reference in viewer for file selection
        if hasattr(self.viewer, 'set_app_reference'):
            self.viewer.set_app_reference(self)
        
        # Set export folder in viewer if available
        if self.export_folder and hasattr(self.viewer, 'set_export_folder'):
            self.viewer.set_export_folder(self.export_folder)
        
        # Start polling for file selection requests
        self._poll_file_selection_queue()
        
        # Update UI state
        self._update_ui_state()
        
        # Don't initialize webview here - will be done when first file is loaded
        self.set_status("Ready. Select export folder and click 'Open Browser' to start server.")
    
    def _create_widgets(self):
        """Create application widgets."""
        # Toolbar (contains all controls)
        self.toolbar = Toolbar(self)
        
        # Viewer canvas (headless - used only to control browser viewer)
        self.viewer = WebViewCanvas(self)
        self.viewer.grid_remove()  # Hide embedded frame - desktop acts as controller only
        
        # Status label
        self.status_label = ctk.CTkLabel(
            self,
            text="Ready. Select export folder and click 'Open Browser' to start server.",
            font=ctk.CTkFont(size=11),
            text_color="gray"
        )
    
    def _setup_layout(self):
        """Setup application layout."""
        # Configure grid weights
        self.grid_rowconfigure(0, weight=1)
        self.grid_columnconfigure(0, weight=1)
        
        # Place main widgets
        self.toolbar.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        
        # Status label
        self.status_label.grid(row=1, column=0, pady=(0, 10))
        
    
    def _bind_events(self):
        """Bind events and callbacks."""
        # Toolbar callbacks
        self.toolbar.on_clear = self._on_clear
        self.toolbar.on_open_browser = self._on_open_browser
        self.toolbar.on_stop_server = self._on_stop_server
        self.toolbar.on_select_export_folder = self._on_select_export_folder
        
        # Viewer callbacks
        self.viewer.on_model_loaded = self._on_model_loaded
        self.viewer.on_model_error = self._on_model_error
        
        # Window events
        self.protocol("WM_DELETE_WINDOW", self._on_closing)
        
        # Bind keyboard shortcuts
        self.bind("<Control-n>", lambda e: self._on_clear())
        self.focus_set()  # Enable keyboard focus
    
    def _open_file_dialog(self, add_mode=False, filetypes=None, title=None):
        """Open file dialog and return selected file path."""
        if filetypes is None:
            filetypes = [
                ("GLTF files", "*.gltf *.glb"),
                ("GLTF files", "*.gltf"),
                ("GLB files", "*.glb"),
                ("All files", "*.*")
            ]
        
        if title is None:
            title = "Add GLTF/GLB File" if add_mode else "Open GLTF/GLB File"
        
        file_path = filedialog.askopenfilename(
            title=title,
            filetypes=filetypes
        )
        
        if file_path and os.path.exists(file_path):
            # Check file size and warn for very large files (>500MB)
            file_size = os.path.getsize(file_path)
            size_mb = file_size / (1024 * 1024)
            
            if size_mb > 500:
                # Show warning but allow loading
                response = messagebox.askyesno(
                    "Large File Warning",
                    f"File size: {size_mb:.1f} MB\n\n"
                    f"This is a very large file. Loading may take some time.\n"
                    f"Do you want to continue?",
                    icon="warning"
                )
                if not response:
                    return None
            
            return file_path
        
        return None
    
    def _on_open_browser(self):
        """Handle open browser action - starts server and opens browser."""
        # Ensure server is running
        if not self.viewer.is_server_running():
            self.viewer._start_local_server()
        
        if self.viewer.open_browser_viewer():
            # Update stop server button state but keep open browser enabled
            if self.viewer.is_server_running():
                self.toolbar.stop_server_btn.configure(state="normal")
            self.set_status("Browser opened - Server running")
        else:
            messagebox.showerror("Error", "Unable to open browser viewer.")
    
    def _on_stop_server(self):
        """Handle stop server action."""
        if self.viewer.is_server_running():
            self.viewer.stop_server()
            self.toolbar.stop_server_btn.configure(state="disabled")
            self.set_status("Server stopped")
        else:
            self.set_status("Server is not running")
    
    def _on_select_export_folder(self):
        """Handle select export folder action."""
        folder_path = filedialog.askdirectory(
            title="Select Export Folder for Images"
        )
        
        if folder_path and os.path.exists(folder_path):
            self.export_folder = folder_path
            self.toolbar.set_export_folder(folder_path)
            # Update viewer with export folder
            if hasattr(self.viewer, 'set_export_folder'):
                self.viewer.set_export_folder(folder_path)
            self.set_status(f"Export folder set: {folder_path}")
        elif folder_path:
            messagebox.showerror("Error", "Selected folder does not exist.")
    
    def request_file_selection(self, add_mode=False, filetypes=None, title=None):
        """
        Request file selection from HTTP handler thread.
        This queues the request for the main thread to process.
        Can be called from any thread.
        
        Args:
            add_mode: If True, opens "Add Model" dialog, else "Load Model" dialog
            
        Returns:
            Selected file path or None if cancelled
        """
        import threading
        
        # Create event for thread communication
        result_event = threading.Event()
        result_container = {'file_path': None}
        
        # Queue the request for main thread (thread-safe operation)
        self._file_selection_queue.put({
            'add_mode': add_mode,
            'filetypes': filetypes,
            'title': title,
            'event': result_event,
            'result': result_container
        })
        self._file_selection_pending = True
        
        # Wait for result (with timeout)
        # Main thread will process the queue via polling
        if result_event.wait(timeout=60):  # 60 second timeout
            return result_container['file_path']
        else:
            return None
    
    def _poll_file_selection_queue(self):
        """Poll file selection queue and process requests (called periodically on main thread)."""
        try:
            if not self._file_selection_queue.empty():
                request = self._file_selection_queue.get_nowait()
                add_mode = request.get('add_mode', False)
                filetypes = request.get('filetypes')
                title = request.get('title')
                result_event = request['event']
                result_container = request['result']
                
                # Open file dialog (on main thread)
                file_path = self._open_file_dialog(
                    add_mode=add_mode,
                    filetypes=filetypes,
                    title=title
                )
                result_container['file_path'] = file_path
                result_event.set()
                
                self._file_selection_pending = False
            
            # Process any pending external updates (from browser add-model requests)
            while not self._external_update_queue.empty():
                file_path = self._external_update_queue.get_nowait()
                if file_path:
                    self._handle_new_scene(file_path, from_browser=True)
        except queue.Empty:
            pass
        except Exception as e:
            print(f"Error processing queues: {e}")
            self._file_selection_pending = False
        
        # Schedule next poll (every 100ms)
        self.after(100, self._poll_file_selection_queue)
    
    def _on_clear(self):
        """Handle clear action - clears both app and browser cache."""
        if self.current_scene or self.loaded_files:
            # Clear viewer (this also clears browser localStorage)
            self.viewer.clear()
            
            # Clear scene
            self.current_scene = None
            
            # Update UI
            self.loaded_files.clear()
            self._update_ui_state()
            self.set_status("Cleared - App and browser cache cleared")
            
            # Reset window title
            self.title("3D Integration Tool - Desktop Application")
        else:
            # Even if no scene, clear browser cache if webview is open
            if hasattr(self.viewer, 'webview_window') and self.viewer.webview_window:
                try:
                    clear_cache_js = """
                    try {
                        localStorage.removeItem('materialManager_colors');
                        localStorage.removeItem('materialManager_partColors');
                        if (typeof viewer !== 'undefined' && viewer && typeof viewer.clear === 'function') {
                            viewer.clear();
                        }
                        console.log('Browser cache cleared');
                    } catch (e) {
                        console.warn('Failed to clear browser cache:', e);
                    }
                    """
                    self.viewer.webview_window.evaluate_js(clear_cache_js)
                    self.set_status("Browser cache cleared")
                except Exception as e:
                    self.set_status(f"Cleared (cache clear: {str(e)})")
            else:
                self.set_status("Nothing to clear")
    
    def _on_model_loaded(self, stats: dict):
        """Handle model loaded event."""
        if self.current_scene:
            # Update scene with stats
            self.current_scene.is_loaded = True
            self.current_scene.vertex_count = stats.get('vertices')
            self.current_scene.face_count = stats.get('faces')
            self.current_scene.material_count = stats.get('materials')
            self.current_scene.texture_count = stats.get('textures')
            self.current_scene.is_draco = stats.get('isDraco', False)
            
            self.set_status(f"Model loaded: {stats.get('vertices', 0):,} vertices, {stats.get('faces', 0):,} faces")
    
    def _on_model_error(self, error: str):
        """Handle model error event."""
        messagebox.showerror("Error", f"Failed to load model: {error}")
        self.set_status("Model loading failed")
    
    def _update_ui_state(self):
        """Update UI state based on current data."""
        has_scene = self.current_scene is not None
        
        # Update toolbar
        self.toolbar.set_clear_enabled(has_scene)
        
        # Update window title
        if self.current_scene:
            filename = os.path.basename(self.current_scene.file_path)
            self.title(f"3D Integration Tool - {filename}")
        else:
            self.title("3D Integration Tool - Desktop Controller")
    
    def _handle_new_scene(self, file_path: str, from_browser: bool = False):
        """Create scene metadata and update UI after a file is selected."""
        if not file_path or not os.path.exists(file_path):
            return
        
        scene = Scene(file_path)
        filename = os.path.basename(file_path)
        source_label = "Browser" if from_browser else "Desktop"
        
        # Track loaded files without duplicating entries
        existing_entry = next((entry for entry in self.loaded_files if entry['path'] == file_path), None)
        if existing_entry:
            existing_entry.update({"scene": scene, "source": source_label, "name": filename})
        else:
            self.loaded_files.append({
                "path": file_path,
                "name": filename,
                "source": source_label,
                "scene": scene
            })
        
        # Always show the most recently loaded file
        self.current_scene = scene
        self._update_ui_state()
        
        status_prefix = "Added" if from_browser else "Loaded"
        self.set_status(f"{status_prefix}: {filename}")
    
    def notify_browser_file_loaded(self, file_path: str):
        """Called by HTTP server thread to update UI when browser requests a file."""
        if file_path and os.path.exists(file_path):
            self._external_update_queue.put(file_path)
    
    def set_status(self, message: str):
        """Update status message."""
        print(f"[Status] {message}")
        if hasattr(self, 'status_label'):
            self.status_label.configure(text=message)
    
    def _on_closing(self):
        """Handle application closing."""
        # Close webview if open
        if hasattr(self.viewer, 'webview_window') and self.viewer.webview_window:
            try:
                self.viewer.webview_window.destroy()
            except:
                pass
        
        # Close without save dialog
        self.destroy()
    
    def run(self):
        """Run the application."""
        self.mainloop()


def check_password():
    """Check password before starting the application."""
    # Create a temporary root window for the password dialog
    root = tk.Tk()
    root.withdraw()  # Hide the main window
    
    # Show password dialog
    password = simpledialog.askstring("Password Required", 
                                    "Enter password to access 3D Integration Tool Application:",
                                    show='*')
    
    root.destroy()
    
    # Check password
    if password == "102066":
        return True
    else:
        messagebox.showerror("Access Denied", "Incorrect password. Application will close.")
        return False


def main():
    """Main entry point."""
    # Check password first
    if not check_password():
        return
    
    try:
        # Create app
        app = GLTFViewerApp()
        
        # Run Tkinter mainloop
        app.run()
    except Exception as e:
        messagebox.showerror("Error", f"Application failed to start: {str(e)}")
        print(f"Error: {e}")


if __name__ == "__main__":
    main()

