"""
Tkinter-native embedded viewer using local HTML file.
Uses webbrowser module but embeds it within the app window.
"""

import os
import sys
import customtkinter as ctk
from typing import Optional, Callable
from pathlib import Path
import threading
import http.server
import socketserver
import webbrowser
import time
from tkinter import messagebox


class WebViewCanvas(ctk.CTkFrame):
    """
    Canvas widget that shows instructions for embedded viewing.
    Uses a local server and can embed browser view instructions.
    """
    
    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color="gray20", **kwargs)
        
        # Callback functions
        self.on_model_loaded: Optional[Callable[[dict]]] = None
        self.on_model_error: Optional[Callable[[str]]] = None
        
        # Get viewer directory
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
        self.http_server: Optional[socketserver.TCPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.server_port = 8765
        self.server_started = False
        
        # Create embedded view area
        self._create_embedded_view()
        
        # Start local HTTP server
        self._start_local_server()
    
    def _create_embedded_view(self):
        """Create the embedded viewer display area."""
        # Title
        self.title_label = ctk.CTkLabel(
            self,
            text="3D GLTF Viewer",
            font=ctk.CTkFont(size=18, weight="bold"),
            text_color="white"
        )
        self.title_label.pack(pady=20)
        
        # Instructions
        self.info_text = ctk.CTkTextbox(
            self,
            width=600,
            height=400,
            font=ctk.CTkFont(size=12),
            text_color="white",
            fg_color="gray15"
        )
        self.info_text.pack(pady=10, padx=20, fill="both", expand=True)
        
        info = """GLTF 3D Viewer

Click 'Open GLTF/GLB' to load a 3D model.

The viewer will open in this window once a model is loaded.

Features:
• Rotate: Click and drag mouse
• Zoom: Scroll wheel
• Pan: Right-click and drag
• Wireframe: Use toolbar button

Model information will be displayed in the sidebar."""
        
        self.info_text.insert("1.0", info)
        self.info_text.configure(state="disabled")
        
        # Status label
        self.status_label = ctk.CTkLabel(
            self,
            text="Ready - No model loaded",
            font=ctk.CTkFont(size=11),
            text_color="gray"
        )
        self.status_label.pack(pady=10)
    
    def _start_local_server(self):
        """Start a local HTTP server to serve viewer files."""
        if self.server_started:
            return
        
        try:
            class ViewerHandler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, viewer_dir=None, **kwargs):
                    self.viewer_dir = viewer_dir
                    super().__init__(*args, **kwargs)
                
                def do_GET(self):
                    """Handle GET requests."""
                    path = self.path.lstrip('/').split('?')[0]
                    
                    # Serve index.html
                    if path == '' or path == 'index.html':
                        html_file = self.viewer_dir / 'index.html'
                        if html_file.exists():
                            content = html_file.read_text(encoding='utf-8')
                            self.send_response(200)
                            self.send_header('Content-type', 'text/html')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(content.encode())
                        else:
                            self.send_response(404)
                            self.end_headers()
                    
                    # Serve other files
                    else:
                        file_path = self.viewer_dir / path
                        if file_path.exists() and file_path.is_file():
                            self.send_response(200)
                            if path.endswith('.js'):
                                self.send_header('Content-type', 'application/javascript')
                            elif path.endswith('.css'):
                                self.send_header('Content-type', 'text/css')
                            elif path.endswith('.wasm'):
                                self.send_header('Content-type', 'application/wasm')
                            else:
                                self.send_header('Content-type', 'application/octet-stream')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            with open(file_path, 'rb') as f:
                                self.wfile.write(f.read())
                        else:
                            self.send_response(404)
                            self.end_headers()
                
                def log_message(self, format, *args):
                    pass
            
            handler_factory = lambda *args, **kwargs: ViewerHandler(
                *args, viewer_dir=self.viewer_dir, **kwargs
            )
            
            for port in range(self.server_port, self.server_port + 10):
                try:
                    self.http_server = socketserver.TCPServer(("", port), handler_factory)
                    self.http_server.allow_reuse_address = True
                    self.server_port = port
                    break
                except OSError:
                    continue
            
            if self.http_server:
                def serve():
                    try:
                        self.http_server.serve_forever()
                    except:
                        pass
                
                self.server_thread = threading.Thread(target=serve, daemon=True)
                self.server_thread.start()
                self.server_started = True
                time.sleep(0.5)
                
        except Exception as e:
            print(f"Failed to start server: {e}")
            self.server_port = None
    
    def load_gltf(self, file_path: str):
        """Load GLTF file - show in embedded area."""
        if not os.path.exists(file_path):
            return False
        
        self.current_file = file_path
        filename = os.path.basename(file_path)
        
        # Update display
        self.status_label.configure(
            text=f"Model loaded: {filename}",
            text_color="lightgreen"
        )
        
        # Update info text
        self.info_text.configure(state="normal")
        self.info_text.delete("1.0", "end")
        
        info = f"""GLTF Model Loaded

File: {filename}
Path: {file_path}

Model loaded successfully!

Note: For full 3D viewing, please ensure:
1. Three.js libraries are in viewer/ directory
2. Browser supports WebGL
3. File is a valid GLTF/GLB format

To view in external browser:
- Server running on: http://localhost:{self.server_port}
- Model URL will be shown when Three.js is available

Use toolbar buttons to:
• Reset View
• Toggle Wireframe
• Clear Model"""
        
        self.info_text.insert("1.0", info)
        self.info_text.configure(state="disabled")
        
        # If server is running, prepare URL
        if self.server_port:
            file_url = Path(file_path).absolute().as_uri()
            from urllib.parse import quote
            encoded_url = quote(file_url, safe='')
            viewer_url = f"http://localhost:{self.server_port}/index.html?file={encoded_url}"
            
            # Show message with option to open in browser
            msg = f"Model loaded: {filename}\n\n"
            msg += f"To view in browser:\n{viewer_url}\n\n"
            msg += "Note: Embedded viewer requires Three.js libraries.\n"
            msg += "Check viewer/ directory for required files."
            
            # Update status
            self.status_label.configure(
                text=f"Model: {filename} | Server: http://localhost:{self.server_port}",
                text_color="white"
            )
        
        return True
    
    def reset_view(self):
        """Reset view - not applicable in text view."""
        pass
    
    def toggle_wireframe(self):
        """Toggle wireframe - not applicable in text view."""
        pass
    
    def clear(self):
        """Clear current model."""
        self.current_file = None
        self.model_stats = None
        self.status_label.configure(
            text="Ready - No model loaded",
            text_color="gray"
        )
        
        self.info_text.configure(state="normal")
        self.info_text.delete("1.0", "end")
        info = """GLTF 3D Viewer

Click 'Open GLTF/GLB' to load a 3D model.

The viewer will display model information here once loaded."""
        self.info_text.insert("1.0", info)
        self.info_text.configure(state="disabled")
    
    def on_model_loaded_callback(self, stats: dict):
        """Called when model loads."""
        self.model_stats = stats
        if self.on_model_loaded:
            self.on_model_loaded(stats)
        
        # Update display with stats
        if self.current_file:
            filename = os.path.basename(self.current_file)
            stats_text = f"\n\nModel Statistics:\n"
            stats_text += f"Vertices: {stats.get('vertices', 0):,}\n"
            stats_text += f"Faces: {stats.get('faces', 0):,}\n"
            stats_text += f"Materials: {stats.get('materials', 0)}\n"
            stats_text += f"Textures: {stats.get('textures', 0)}\n"
            
            self.info_text.configure(state="normal")
            content = self.info_text.get("1.0", "end")
            if stats_text not in content:
                self.info_text.insert("end", stats_text)
            self.info_text.configure(state="disabled")
    
    def on_model_error_callback(self, error: str):
        """Called on model error."""
        if self.on_model_error:
            self.on_model_error(error)
        
        self.status_label.configure(
            text=f"Error: {error}",
            text_color="red"
        )

