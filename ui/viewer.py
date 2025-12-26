"""
Embedded webview container for GLTF viewer using pywebview.
Embeds the viewer directly in the app window instead of opening a separate browser.
"""

import os
import sys
import customtkinter as ctk
from typing import Optional, Callable
from pathlib import Path
import threading
import time
import http.server
import socketserver
from urllib.parse import quote, unquote

try:
    import webview
    WEBVIEW_AVAILABLE = True
except ImportError:
    WEBVIEW_AVAILABLE = False
    print("Warning: pywebview not available. Install with: pip install pywebview")


class WebViewCanvas(ctk.CTkFrame):
    """
    Canvas widget that embeds webview directly in the app for rendering GLTF files.
    Uses pywebview embedded in the Tkinter frame with local HTTP server.
    """
    
    def __init__(self, parent, **kwargs):
        """
        Initialize the embedded webview canvas.
        
        Args:
            parent: Parent widget
            **kwargs: Additional arguments for CTkFrame
        """
        super().__init__(parent, fg_color="gray20", **kwargs)
        
        # Callback functions
        self.on_model_loaded: Optional[Callable[[dict]]] = None
        self.on_model_error: Optional[Callable[[str]]] = None
        
        # Webview instance
        self.webview_window: Optional[webview.Window] = None
        self.webview_started = False
        
        # HTTP server for serving files
        self.http_server: Optional[socketserver.TCPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.server_port = 8765
        self.server_started = False
        
        # Get viewer HTML path - handle PyInstaller bundle
        import sys
        if getattr(sys, 'frozen', False):
            # Running as compiled exe
            base_path = Path(sys._MEIPASS)
        else:
            # Running as script
            base_path = Path(__file__).parent.parent
        
        self.viewer_dir = base_path / "viewer"
        self.html_path = self.viewer_dir / "index.html"
        
        # Verify viewer directory exists
        if not self.viewer_dir.exists():
            print(f"WARNING: Viewer directory not found: {self.viewer_dir}")
            print(f"Base path: {base_path}")
            print(f"Frozen: {getattr(sys, 'frozen', False)}")
            if getattr(sys, 'frozen', False):
                print(f"MEIPASS: {sys._MEIPASS}")
        
        # State
        self.current_file: Optional[str] = None
        self.model_stats: Optional[dict] = None
        
        # Placeholder label
        self.placeholder_label = ctk.CTkLabel(
            self,
            text="3D Viewer\n(Embedded viewer - click 'Open GLTF/GLB' to load model)",
            text_color="white",
            font=ctk.CTkFont(size=14),
            justify="center"
        )
        self.placeholder_label.pack(expand=True)
        
        if not WEBVIEW_AVAILABLE:
            self.placeholder_label.configure(
                text="pywebview not available.\nPlease install: pip install pywebview"
            )
        else:
            # Start local HTTP server for serving files
            self._start_local_server()
    
    def _get_html_url(self) -> str:
        """Get the HTTP URL for the HTML file."""
        if self.server_port and self.server_started:
            return f"http://localhost:{self.server_port}/index.html"
        else:
            # Fallback to file:// URL
            if self.html_path.exists():
                return str(self.html_path.absolute().as_uri())
            else:
                path_str = self.viewer_dir.absolute().as_posix()
                if sys.platform == 'win32':
                    path_str = path_str.replace('\\', '/')
                return f"file:///{path_str}/index.html"
    
    def _start_local_server(self):
        """Start a local HTTP server to serve viewer files."""
        if self.server_started and self.http_server:
            return
        
        try:
            class ViewerHandler(http.server.SimpleHTTPRequestHandler):
                def __init__(self, *args, viewer_dir=None, canvas_ref=None, **kwargs):
                    self.viewer_dir = viewer_dir
                    self.canvas_ref = canvas_ref
                    super().__init__(*args, **kwargs)
                
                def do_GET(self):
                    """Handle GET requests."""
                    parsed_path = self.path.split('?')[0]
                    path = unquote(parsed_path.lstrip('/'))
                    
                    # Serve GLTF files via /model/ route
                    if path.startswith('model/'):
                        file_id = path.replace('model/', '')
                        current_file = None
                        if self.canvas_ref:
                            current_file = self.canvas_ref.current_file
                        
                        if current_file and os.path.exists(current_file):
                            self.send_response(200)
                            if current_file.endswith('.gltf'):
                                self.send_header('Content-type', 'model/gltf+json')
                            elif current_file.endswith('.glb'):
                                self.send_header('Content-type', 'model/gltf-binary')
                            else:
                                self.send_header('Content-type', 'application/octet-stream')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            
                            with open(current_file, 'rb') as f:
                                self.wfile.write(f.read())
                        else:
                            self.send_response(404)
                            self.send_header('Content-type', 'text/plain')
                            self.end_headers()
                            self.wfile.write(b'Model file not found')
                    
                    # Serve index.html
                    elif path == '' or path == 'index.html':
                        current_file = None
                        if self.canvas_ref:
                            current_file = self.canvas_ref.current_file
                        
                        html_file = self.viewer_dir / 'index.html'
                        if html_file.exists():
                            html_content = html_file.read_text(encoding='utf-8')
                            self.send_response(200)
                            self.send_header('Content-type', 'text/html')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(html_content.encode())
                        else:
                            self.send_response(404)
                            self.end_headers()
                    
                    # Serve other files from viewer directory
                    else:
                        # Ignore Chrome DevTools requests (.well-known paths)
                        if path.startswith('.well-known/') or '/.well-known/' in path:
                            self.send_response(404)
                            self.end_headers()
                            return
                        
                        # Normalize path and prevent directory traversal
                        # Remove any leading slashes and normalize
                        normalized_path = path.lstrip('/').replace('\\', '/')
                        
                        # Security: Ensure path is within viewer directory
                        file_path = (self.viewer_dir / normalized_path).resolve()
                        viewer_dir_resolved = self.viewer_dir.resolve()
                        
                        # Check if resolved path is within viewer directory
                        try:
                            file_path.relative_to(viewer_dir_resolved)
                        except ValueError:
                            # Path traversal attempt - reject silently (don't log)
                            self.send_response(404)
                            self.end_headers()
                            return
                        
                        # Handle draco decoder files
                        if normalized_path == 'draco_decoder.js' or normalized_path.endswith('/draco_decoder.js'):
                            if not file_path.exists():
                                draco_path = self.viewer_dir / 'draco_decoder_gltf.js'
                                if draco_path.exists():
                                    file_path = draco_path
                        elif normalized_path == 'draco_decoder.wasm' or normalized_path.endswith('/draco_decoder.wasm'):
                            if not file_path.exists():
                                draco_path = self.viewer_dir / 'draco_decoder_gltf.wasm'
                                if draco_path.exists():
                                    file_path = draco_path
                        
                        if file_path.exists() and file_path.is_file():
                            self.send_response(200)
                            if normalized_path.endswith('.js') or file_path.suffix == '.js':
                                self.send_header('Content-type', 'application/javascript')
                            elif normalized_path.endswith('.css') or file_path.suffix == '.css':
                                self.send_header('Content-type', 'text/css')
                            elif normalized_path.endswith('.html') or file_path.suffix == '.html':
                                self.send_header('Content-type', 'text/html')
                            elif normalized_path.endswith('.wasm') or file_path.suffix == '.wasm':
                                self.send_header('Content-type', 'application/wasm')
                            elif normalized_path.endswith('.json') or file_path.suffix == '.json':
                                self.send_header('Content-type', 'application/json')
                            else:
                                self.send_header('Content-type', 'application/octet-stream')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            
                            with open(file_path, 'rb') as f:
                                self.wfile.write(f.read())
                        else:
                            # Only log non-DevTools 404s for debugging (suppress .well-known errors)
                            if '.well-known' not in normalized_path and 'devtools' not in normalized_path.lower():
                                print(f"File not found: {file_path} (requested: {path}, normalized: {normalized_path})")
                            self.send_response(404)
                            self.end_headers()
                
                def log_message(self, format, *args):
                    """Suppress server logs."""
                    pass
            
            # Try to find available port
            for port in range(self.server_port, self.server_port + 10):
                try:
                    handler_factory = lambda *args, **kwargs: ViewerHandler(
                        *args, 
                        viewer_dir=self.viewer_dir,
                        canvas_ref=self,
                        **kwargs
                    )
                    self.http_server = socketserver.ThreadingTCPServer(("", port), handler_factory)
                    self.http_server.allow_reuse_address = True
                    self.http_server.timeout = 1.0
                    self.server_port = port
                    break
                except OSError:
                    continue
            
            if self.http_server:
                def serve():
                    try:
                        time.sleep(0.2)
                        self.http_server.serve_forever()
                    except Exception as e:
                        print(f"Server error: {e}")
                
                self.server_thread = threading.Thread(target=serve, daemon=True)
                self.server_thread.start()
                self.server_started = True
                time.sleep(0.5)  # Wait for server to bind
                
        except Exception as e:
            print(f"Failed to start local server: {e}")
            self.server_port = None
    
    def _initialize_embedded_webview(self):
        """Initialize embedded webview in the frame."""
        if not WEBVIEW_AVAILABLE:
            return False
        
        if self.webview_window:
            return True  # Already initialized
        
        try:
            html_url = self._get_html_url()
            
            # Create webview API
            api = WebViewAPI(self)
            
            # Get parent window handle for embedding
            # On Windows, we can try to embed webview
            try:
                # Try to get Tkinter window handle
                parent_window = self.winfo_toplevel()
                parent_handle = parent_window.winfo_id()
                
                # Create embedded webview window
                # Note: pywebview embedding on Windows may require specific setup
                self.webview_window = webview.create_window(
                    title="GLTF 3D Viewer",
                    url=html_url,
                    width=self.winfo_width() or 800,
                    height=self.winfo_height() or 600,
                    resizable=True,
                    js_api=api,
                    on_top=False
                )
                
                # Hide placeholder
                self.placeholder_label.pack_forget()
                
                return True
            except Exception as e:
                print(f"Error creating embedded webview: {e}")
                # Fallback: show in separate window but keep it managed
                return self._initialize_window_webview(html_url, api)
                
        except Exception as e:
            print(f"Error initializing webview: {e}")
            return False
    
    def _initialize_window_webview(self, html_url: str, api):
        """Initialize webview in separate window (fallback)."""
        try:
            self.webview_window = webview.create_window(
                title="GLTF 3D Viewer",
                url=html_url,
                width=1024,
                height=768,
                resizable=True,
                js_api=api,
                on_top=False
            )
            return True
        except Exception as e:
            print(f"Error creating webview window: {e}")
            return False
    
    def load_gltf(self, file_path: str):
        """
        Load a GLTF/GLB file in the embedded viewer.
        
        Args:
            file_path: Path to GLTF/GLB file
        """
        if not WEBVIEW_AVAILABLE:
            return False
        
        if not os.path.exists(file_path):
            return False
        
        self.current_file = file_path
        
        # Ensure server is running
        if not self.server_started:
            self._start_local_server()
        
        # Wait for server to be ready
        max_wait = 20
        waited = 0
        while waited < max_wait:
            if self.server_port and self.server_started:
                import socket
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.1)
                    result = sock.connect_ex(('127.0.0.1', self.server_port))
                    sock.close()
                    if result == 0:
                        break
                except:
                    pass
            time.sleep(0.1)
            waited += 1
        
        try:
            # Initialize embedded webview if not already done
            if not self.webview_window:
                if not self._initialize_embedded_webview():
                    return False
            
            # Start webview if not started
            if not self.webview_started:
                def start_webview():
                    """Start webview from main thread."""
                    try:
                        # Start webview in background
                        def run_webview():
                            try:
                                webview.start(debug=False)
                            except Exception as e:
                                print(f"Webview start error: {e}")
                        
                        t = threading.Thread(target=run_webview, daemon=True)
                        t.start()
                        self.webview_started = True
                        time.sleep(1.5)  # Wait for webview to initialize
                    except Exception as e:
                        print(f"Error starting webview: {e}")
                
                # Schedule on main thread
                self.after(100, start_webview)
                time.sleep(0.5)  # Give it a moment
            
            # Prepare file URL for HTTP server
            if self.server_port:
                file_name = os.path.basename(file_path)
                file_url = f"/model/{file_name}"
            else:
                # Fallback to file:// URL
                file_url = Path(file_path).absolute().as_uri()
                if sys.platform == 'win32':
                    file_url = file_url.replace('\\', '/')
            
            # Load file in viewer after a delay to ensure webview is ready
            def load_file():
                """Load file in viewer."""
                if self.webview_window:
                    try:
                        # Update URL with file parameter
                        full_url = f"{self._get_html_url()}?file={quote(file_url, safe='')}"
                        self.webview_window.load_url(full_url)
                        
                        # Also try to load via JavaScript
                        time.sleep(0.5)
                        js_code = f"if (typeof viewer !== 'undefined' && viewer) {{ viewer.loadGLTF('{file_url}'); }}"
                        self.webview_window.evaluate_js(js_code)
                        
                        # Hide placeholder
                        try:
                            if self.placeholder_label.winfo_ismapped():
                                self.placeholder_label.pack_forget()
                        except:
                            pass
                    except Exception as e:
                        print(f"Error loading file: {e}")
                        # Retry
                        self.after(1000, lambda: self._retry_load(file_url))
            
            self.after(500, load_file)
            return True
            
        except Exception as e:
            print(f"Error loading GLTF: {e}")
            return False
    
    def _retry_load(self, file_url: str):
        """Retry loading GLTF after delay."""
        if self.webview_window:
            try:
                # Try loading via URL first
                full_url = f"{self._get_html_url()}?file={quote(file_url, safe='')}"
                self.webview_window.load_url(full_url)
                
                # Then try JavaScript
                time.sleep(0.5)
                js_code = f"if (typeof viewer !== 'undefined' && viewer) {{ viewer.loadGLTF('{file_url}'); }}"
                self.webview_window.evaluate_js(js_code)
            except Exception as e:
                print(f"Retry load error: {e}")
    
    def reset_view(self):
        """Reset camera to default position."""
        if self.webview_window:
            try:
                self.webview_window.evaluate_js("if (typeof viewer !== 'undefined' && viewer) viewer.resetView();")
            except Exception as e:
                print(f"Error resetting view: {e}")
    
    def toggle_wireframe(self):
        """Toggle wireframe mode."""
        if self.webview_window:
            try:
                self.webview_window.evaluate_js("if (typeof viewer !== 'undefined' && viewer) viewer.toggleWireframe();")
            except Exception as e:
                print(f"Error toggling wireframe: {e}")
    
    def clear(self):
        """Clear the current model and browser cache."""
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
            except Exception as e:
                print(f"Error clearing model: {e}")
        
        self.current_file = None
        self.model_stats = None
        
        # Show placeholder again
        try:
            if not self.placeholder_label.winfo_ismapped():
                self.placeholder_label.pack(expand=True)
        except:
            self.placeholder_label.pack(expand=True)
    
    def on_model_loaded_callback(self, stats: dict):
        """Called when model is loaded."""
        self.model_stats = stats
        if self.on_model_loaded:
            self.on_model_loaded(stats)
    
    def on_model_error_callback(self, error: str):
        """Called when model loading fails."""
        if self.on_model_error:
            self.on_model_error(error)


class WebViewAPI:
    """
    API class for communication between JavaScript and Python.
    """
    
    def __init__(self, canvas: WebViewCanvas):
        self.canvas = canvas
    
    def onModelLoaded(self, stats: dict):
        """Called from JavaScript when model is loaded."""
        self.canvas.on_model_loaded_callback(stats)
    
    def onModelError(self, error: str):
        """Called from JavaScript when model loading fails."""
        self.canvas.on_model_error_callback(error)

