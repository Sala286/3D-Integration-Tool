"""
Simplified webview container using subprocess approach.
Opens GLTF viewer in separate window managed by main app.
"""

import os
import sys
import customtkinter as ctk
from typing import Optional, Callable
from pathlib import Path
from tkinter import messagebox
import threading
import http.server
import socketserver
import json

try:
    import webview
    WEBVIEW_AVAILABLE = True
except ImportError:
    WEBVIEW_AVAILABLE = False


class WebViewCanvas(ctk.CTkFrame):
    """
    Canvas widget that opens GLTF viewer in separate window.
    Uses a local HTTP server to serve the viewer files.
    """
    
    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color="gray20", **kwargs)
        
        # Callback functions
        self.on_model_loaded: Optional[Callable[[dict]]] = None
        self.on_model_error: Optional[Callable[[str]]] = None
        
        # Get viewer directory - handle PyInstaller bundle
        import sys
        if getattr(sys, 'frozen', False):
            # Running as compiled exe
            base_path = Path(sys._MEIPASS)
        else:
            # Running as script
            base_path = Path(__file__).parent.parent
        
        self.viewer_dir = base_path / "viewer"
        self.html_path = self.viewer_dir / "index.html"
        
        # State
        self.current_file: Optional[str] = None
        self.model_stats: Optional[dict] = None
        self.webview_window: Optional[webview.Window] = None
        self.http_server: Optional[socketserver.TCPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.server_port = 8765
        
        # Placeholder
        self.placeholder_label = ctk.CTkLabel(
            self,
            text="3D Viewer\nClick 'Open GLTF/GLB' to view model\n(Viewer opens in separate window)",
            text_color="white",
            font=ctk.CTkFont(size=14),
            justify="center"
        )
        self.placeholder_label.pack(expand=True)
        
        # Start local HTTP server for serving viewer files
        self._start_local_server()
    
    def _start_local_server(self):
        """Start a local HTTP server to serve viewer files."""
        try:
            class ViewerHandler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, viewer_dir=None, **kwargs):
                    self.viewer_dir = viewer_dir
                    super().__init__(*args, **kwargs)
                
                def translate_path(self, path):
                    """Translate URL path to file path."""
                    path = path.lstrip('/')
                    if not path or path == '/':
                        path = 'index.html'
                    return str(self.viewer_dir / path)
                
                def log_message(self, format, *args):
                    """Suppress server logs."""
                    pass
            
            # Create custom handler with viewer directory
            handler = lambda *args, **kwargs: ViewerHandler(*args, viewer_dir=self.viewer_dir, **kwargs)
            
            self.http_server = socketserver.TCPServer(("", self.server_port), handler)
            self.http_server.allow_reuse_address = True
            
            def serve():
                try:
                    self.http_server.serve_forever()
                except Exception as e:
                    print(f"Server error: {e}")
            
            self.server_thread = threading.Thread(target=serve, daemon=True)
            self.server_thread.start()
            
        except Exception as e:
            print(f"Failed to start local server: {e}")
            self.server_port = None
    
    def load_gltf(self, file_path: str):
        """Load GLTF file in webview window."""
        if not WEBVIEW_AVAILABLE:
            messagebox.showerror("Error", "pywebview not available")
            return False
        
        if not os.path.exists(file_path):
            return False
        
        self.current_file = file_path
        
        try:
            # Close existing window if any
            if self.webview_window:
                try:
                    self.webview_window.destroy()
                except:
                    pass
            
            # Prepare file URL
            if self.server_port:
                # Use local server
                file_url = Path(file_path).absolute().as_uri()
                viewer_url = f"http://localhost:{self.server_port}/index.html"
            else:
                # Fallback to file:// URL
                viewer_url = self.html_path.absolute().as_uri()
                file_url = Path(file_path).absolute().as_uri()
            
            # Create API
            api = WebViewAPI(self)
            
            # Create and show webview window
            self.webview_window = webview.create_window(
                title=f"GLTF Viewer - {os.path.basename(file_path)}",
                url=viewer_url,
                width=1024,
                height=768,
                resizable=True,
                js_api=api
            )
            
            # Start webview - must be on main thread
            # We'll use Tkinter's after() to schedule it on main thread
            def start_on_main():
                """Start webview from main thread."""
                try:
                    # webview.start() blocks, so we need to run it
                    # in a way that doesn't freeze Tkinter
                    # Use a thread but ensure proper initialization
                    def run_webview():
                        try:
                            webview.start(debug=False)
                        except Exception as e:
                            print(f"Webview start error: {e}")
                    
                    # Start in daemon thread
                    # Note: This may fail with "must run on main thread"
                    # But we try it as workaround
                    t = threading.Thread(target=run_webview, daemon=True)
                    t.start()
                    
                    # Give it time to start
                    import time
                    time.sleep(1.5)
                except Exception as e:
                    print(f"Error scheduling webview: {e}")
            
            # Schedule to run on Tkinter's main thread
            self.after(100, start_on_main)
            
            # Wait a moment then load the file
            threading.Timer(1.0, lambda: self._load_file_in_viewer(file_url)).start()
            
            return True
        except Exception as e:
            print(f"Error loading GLTF: {e}")
            return False
    
    def _load_file_in_viewer(self, file_url: str):
        """Load file in viewer after window is ready."""
        if self.webview_window:
            try:
                js = f"if (typeof viewer !== 'undefined' && viewer) viewer.loadGLTF('{file_url}');"
                self.webview_window.evaluate_js(js)
            except Exception as e:
                print(f"Error loading file in viewer: {e}")
    
    def reset_view(self):
        """Reset camera view."""
        if self.webview_window:
            try:
                self.webview_window.evaluate_js("if (typeof viewer !== 'undefined' && viewer) viewer.resetView();")
            except:
                pass
    
    def toggle_wireframe(self):
        """Toggle wireframe mode."""
        if self.webview_window:
            try:
                self.webview_window.evaluate_js("if (typeof viewer !== 'undefined' && viewer) viewer.toggleWireframe();")
            except:
                pass
    
    def clear(self):
        """Clear current model and browser cache."""
        if self.webview_window:
            try:
                # Clear viewer
                self.webview_window.evaluate_js("if (typeof viewer !== 'undefined' && viewer) viewer.clear();")
                
                # Clear browser localStorage (material colors, etc.)
                clear_cache_js = """
                try {
                    localStorage.removeItem('materialManager_colors');
                    localStorage.removeItem('materialManager_partColors');
                    console.log('Browser cache cleared');
                } catch (e) {
                    console.warn('Failed to clear browser cache:', e);
                }
                """
                self.webview_window.evaluate_js(clear_cache_js)
            except:
                pass
            # Don't destroy window, just clear the content
            # self.webview_window.destroy()
            # self.webview_window = None
        
        self.current_file = None
        self.model_stats = None
    
    def on_model_loaded_callback(self, stats: dict):
        """Called when model loads."""
        self.model_stats = stats
        if self.on_model_loaded:
            self.on_model_loaded(stats)
    
    def on_model_error_callback(self, error: str):
        """Called on model error."""
        if self.on_model_error:
            self.on_model_error(error)


class WebViewAPI:
    """API for JS-Python communication."""
    
    def __init__(self, canvas: WebViewCanvas):
        self.canvas = canvas
    
    def onModelLoaded(self, stats: dict):
        self.canvas.on_model_loaded_callback(stats)
    
    def onModelError(self, error: str):
        self.canvas.on_model_error_callback(error)

