"""
Embedded GLTF viewer using CEF (Chromium Embedded Framework).
This embeds the viewer directly in the Tkinter window without opening a browser.
"""

import os
import sys
import customtkinter as ctk
from typing import Optional, Callable
from pathlib import Path
import threading
import http.server
import socketserver
import time
from urllib.parse import quote, unquote

CEF_AVAILABLE = False
try:
    from cefpython3 import cefpython as cef
    import platform
    CEF_AVAILABLE = True
except ImportError:
    # cefpython3 not installed - this is fine, will use fallback
    pass
except Exception as e:
    # Handle Python version incompatibility and other errors
    error_msg = str(e)
    if "Python version not supported" in error_msg:
        print(f"CEF Error: {error_msg}")
        print("cefpython3 does not support this Python version.")
        print("Please use Python 3.8-3.12 for cefpython3, or use the browser-based viewer.")
        # Raise ImportError so main.py will fall back to alternative viewer
        raise ImportError(f"CEF not available: {error_msg}") from e
    else:
        print(f"CEF Error: {error_msg}")
        # Raise ImportError so main.py will fall back
        raise ImportError(f"CEF not available: {error_msg}") from e


class WebViewCanvas(ctk.CTkFrame):
    """
    Canvas widget that embeds CEF browser for GLTF viewing.
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
        self.browser = None
        self.cef_initialized = False
        
        # HTTP server for serving files
        self.http_server: Optional[socketserver.TCPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.server_port = 8765
        self.server_started = False
        
        # Placeholder
        self.placeholder_label = ctk.CTkLabel(
            self,
            text="3D Viewer\n(Embedded viewer will appear here)",
            text_color="white",
            font=ctk.CTkFont(size=14),
            justify="center"
        )
        self.placeholder_label.pack(expand=True)
        
        if not CEF_AVAILABLE:
            self.placeholder_label.configure(
                text="cefpython3 not available.\nPlease install: pip install cefpython3\nOr use browser-based viewer."
            )
        else:
            # Start local HTTP server for serving files
            self._start_local_server()
            
            # Bind to configure event to initialize CEF when widget is ready
            self.bind('<Configure>', self._on_configure)
    
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
                    self.canvas_ref = canvas_ref  # Reference to WebViewCanvas instance
                    super().__init__(*args, **kwargs)
                
                def do_GET(self):
                    """Handle GET requests."""
                    # Parse path and query
                    parsed_path = self.path.split('?')[0]
                    path = unquote(parsed_path.lstrip('/'))
                    
                    # Serve GLTF files via /model/ route
                    if path.startswith('model/'):
                        # Extract file identifier from path
                        file_id = path.replace('model/', '')
                        current_file = None
                        if self.canvas_ref:
                            current_file = self.canvas_ref.current_file
                        
                        if current_file and os.path.exists(current_file):
                            # Get file size for proper header and chunked streaming
                            file_size = os.path.getsize(current_file)
                            
                            # Serve the GLTF file
                            self.send_response(200)
                            # Set appropriate content type
                            if current_file.endswith('.gltf'):
                                self.send_header('Content-type', 'model/gltf+json')
                            elif current_file.endswith('.glb'):
                                self.send_header('Content-type', 'model/gltf-binary')
                            else:
                                self.send_header('Content-type', 'application/octet-stream')
                            self.send_header('Content-Length', str(file_size))
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            
                            # Use chunked streaming for large files (read in 8MB chunks)
                            # This prevents loading entire file into memory
                            chunk_size = 8 * 1024 * 1024  # 8MB chunks
                            with open(current_file, 'rb') as f:
                                while True:
                                    chunk = f.read(chunk_size)
                                    if not chunk:
                                        break
                                    self.wfile.write(chunk)
                                    # Flush to ensure data is sent immediately
                                    self.wfile.flush()
                        else:
                            self.send_response(404)
                            self.send_header('Content-type', 'text/plain')
                            self.end_headers()
                            self.wfile.write(b'Model file not found')
                    
                    # Serve index.html with file parameter
                    elif path == '' or path == 'index.html':
                        # Get current file from canvas reference
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
                        file_path = self.viewer_dir / path
                        
                        # Handle draco decoder files
                        if path == 'draco_decoder.js' or path.endswith('/draco_decoder.js'):
                            if not file_path.exists():
                                draco_path = self.viewer_dir / 'draco_decoder_gltf.js'
                                if draco_path.exists():
                                    file_path = draco_path
                        elif path == 'draco_wasm_wrapper.js' or path.endswith('/draco_wasm_wrapper.js'):
                            # Alias wasm wrapper to draco_decoder_gltf.js if wrapper is missing
                            if not file_path.exists():
                                alias_path = self.viewer_dir / 'draco_decoder_gltf.js'
                                if alias_path.exists():
                                    file_path = alias_path
                        elif path == 'draco_decoder.wasm' or path.endswith('/draco_decoder.wasm'):
                            if not file_path.exists():
                                draco_path = self.viewer_dir / 'draco_decoder_gltf.wasm'
                                if draco_path.exists():
                                    file_path = draco_path
                        
                        if file_path.exists() and file_path.is_file():
                            self.send_response(200)
                            # Set appropriate content type
                            if path.endswith('.js') or file_path.suffix == '.js':
                                self.send_header('Content-type', 'application/javascript')
                            elif path.endswith('.css') or file_path.suffix == '.css':
                                self.send_header('Content-type', 'text/css')
                            elif path.endswith('.html') or file_path.suffix == '.html':
                                self.send_header('Content-type', 'text/html')
                            elif path.endswith('.wasm') or file_path.suffix == '.wasm':
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
                    """Suppress server logs."""
                    pass
            
            # Create handler factory with canvas reference
            handler_factory = lambda *args, **kwargs: ViewerHandler(
                *args, 
                viewer_dir=self.viewer_dir,
                canvas_ref=self,  # Pass self so handler can access current_file dynamically
                **kwargs
            )
            
            # Try to find available port
            for port in range(self.server_port, self.server_port + 10):
                try:
                    # Use ThreadingTCPServer for better handling
                    self.http_server = socketserver.ThreadingTCPServer(("", port), handler_factory)
                    self.http_server.allow_reuse_address = True
                    self.http_server.timeout = 1.0
                    self.server_port = port
                    print(f"HTTP server created on port {port}")
                    break
                except OSError as e:
                    print(f"Port {port} not available: {e}")
                    continue
            
            if self.http_server:
                # Start server in a way that ensures it binds before continuing
                server_event = threading.Event()
                
                def serve():
                    try:
                        print(f"Starting HTTP server on port {self.server_port}...")
                        time.sleep(0.2)
                        server_event.set()
                        print(f"Server serving on port {self.server_port}")
                        self.http_server.serve_forever()
                    except Exception as e:
                        print(f"Server error: {e}")
                        import traceback
                        traceback.print_exc()
                        server_event.set()  # Set anyway to unblock
                
                # Start server thread
                self.server_thread = threading.Thread(target=serve, daemon=True)
                self.server_thread.start()
                self.server_started = True
                
                # Wait for server to actually bind
                if server_event.wait(timeout=3.0):
                    print(f"Server confirmed ready on port {self.server_port}")
                else:
                    print(f"Warning: Server binding timeout on port {self.server_port}")
                
        except Exception as e:
            print(f"Failed to start local server: {e}")
            self.server_port = None
    
    def _on_configure(self, event=None):
        """Handle widget configure event - initialize CEF when widget is ready."""
        if not CEF_AVAILABLE or self.cef_initialized:
            return
        
        # Wait for widget to have proper dimensions
        width = self.winfo_width()
        height = self.winfo_height()
        
        if width > 1 and height > 1:
            # Widget is ready, initialize CEF after a short delay
            self.after(100, self._initialize_cef_delayed)
    
    def _initialize_cef_delayed(self):
        """Initialize CEF after widget is ready."""
        if self.cef_initialized or not CEF_AVAILABLE:
            return
        
        try:
            self._initialize_cef()
        except Exception as e:
            print(f"Error initializing CEF: {e}")
    
    def _initialize_cef(self):
        """Initialize CEF browser."""
        if not CEF_AVAILABLE or self.cef_initialized:
            return False
        
        try:
            # Check if CEF is already initialized globally
            if not hasattr(cef, '_initialized') or not cef._initialized:
                # CEF settings
                settings = {
                    "debug": False,
                    "log_severity": cef.LOGSEVERITY_INFO,
                    "log_file": "debug.log",
                }
                
                # Initialize CEF (only once globally)
                cef.Initialize(settings)
                cef._initialized = True
            
            # Get window handle
            window_handle = self.winfo_id()
            
            # Get widget dimensions
            width = self.winfo_width()
            height = self.winfo_height()
            
            if width <= 1 or height <= 1:
                # Widget not ready yet, try again later
                return False
            
            # Get window info
            window_info = cef.WindowInfo()
            window_info.SetAsChild(window_handle, [0, 0, width, height])
            
            # Create browser
            self.browser = cef.CreateBrowserSync(
                window_info,
                url=self._get_html_url()
            )
            
            # Set up message handler
            handler = MessageHandler(self)
            self.browser.SetClientHandler(handler)
            
            # Hide placeholder
            try:
                if self.placeholder_label.winfo_ismapped():
                    self.placeholder_label.pack_forget()
            except:
                pass
            
            self.cef_initialized = True
            
            # Handle resize events (unbind old configure handler first)
            self.unbind('<Configure>')
            self.bind('<Configure>', self._on_resize)
            
            # Start CEF message loop processing (required for CEF to work)
            self._process_cef_messages()
            
            return True
            
        except Exception as e:
            print(f"Error initializing CEF: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def _process_cef_messages(self):
        """Process CEF message loop periodically (required for CEF to work with Tkinter)."""
        if self.cef_initialized and CEF_AVAILABLE:
            try:
                # Process CEF messages (non-blocking)
                # cefpython3 requires periodic message processing when embedded
                # Use the appropriate method based on CEF version
                if hasattr(cef, 'MessageLoopWork'):
                    # Newer cefpython3 versions
                    cef.MessageLoopWork()
                elif hasattr(cef, 'DoMessageLoopWork'):
                    # Alternative API
                    cef.DoMessageLoopWork()
                else:
                    # For older versions, CEF may handle messages automatically when using SetAsChild
                    # But we still need to process some events
                    pass
            except Exception:
                # Ignore errors - CEF may handle messages automatically
                pass
            # Schedule next message loop processing (every 10ms for smooth rendering)
            self.after(10, self._process_cef_messages)
    
    def _on_resize(self, event=None):
        """Handle widget resize - CEF handles resize automatically through window handle."""
        # CEF automatically resizes based on the window handle bounds
        # No explicit action needed here
        pass
    
    def load_gltf(self, file_path: str):
        """Load GLTF file using HTTP server."""
        if not CEF_AVAILABLE:
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
        
        # Initialize CEF if not already done
        if not self.cef_initialized or self.browser is None:
            if not self._initialize_cef():
                # Try again after widget is ready
                self.after(500, lambda: self.load_gltf(file_path))
                return True
        
        try:
            # Use HTTP URL for file (same approach as browser viewer)
            if self.server_port:
                file_name = os.path.basename(file_path)
                file_url = f"/model/{file_name}"
            else:
                # Fallback to file:// URL
                file_url = Path(file_path).absolute().as_uri()
                if sys.platform == 'win32':
                    file_url = file_url.replace('\\', '/')
            
            # Load URL with file parameter
            html_url = self._get_html_url()
            full_url = f"{html_url}?file={quote(file_url, safe='')}"
            self.browser.LoadUrl(full_url)
            
            # Also try to load via JavaScript after a delay
            def load_via_js():
                try:
                    js_code = f"if (typeof viewer !== 'undefined' && viewer) {{ viewer.loadGLTF('{file_url}'); }}"
                    self.browser.ExecuteJavascript(js_code)
                except Exception as e:
                    print(f"Error loading via JS: {e}")
            
            self.after(500, load_via_js)
            
            return True
        except Exception as e:
            print(f"Error loading GLTF: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def reset_view(self):
        """Reset camera view."""
        if self.browser:
            try:
                self.browser.ExecuteJavascript("if (typeof viewer !== 'undefined' && viewer) viewer.resetView();")
            except:
                pass
    
    def toggle_wireframe(self):
        """Toggle wireframe mode."""
        if self.browser:
            try:
                self.browser.ExecuteJavascript("if (typeof viewer !== 'undefined' && viewer) viewer.toggleWireframe();")
            except:
                pass
    
    def clear(self):
        """Clear current model."""
        if self.browser:
            try:
                self.browser.ExecuteJavascript("if (typeof viewer !== 'undefined' && viewer) viewer.clear();")
            except:
                pass
        
        self.current_file = None
        self.model_stats = None
        
        # Show placeholder again
        try:
            if not self.placeholder_label.winfo_ismapped():
                self.placeholder_label.pack(expand=True)
        except:
            self.placeholder_label.pack(expand=True)
    
    def on_model_loaded_callback(self, stats: dict):
        """Called when model loads."""
        self.model_stats = stats
        if self.on_model_loaded:
            self.on_model_loaded(stats)
    
    def on_model_error_callback(self, error: str):
        """Called on model error."""
        if self.on_model_error:
            self.on_model_error(error)


class MessageHandler(object):
    """CEF message handler for JS-Python communication."""
    
    def __init__(self, canvas: WebViewCanvas):
        self.canvas = canvas
    
    def OnProcessMessageReceived(self, browser, source_process, message):
        """Handle messages from JavaScript."""
        if message.GetName() == "onModelLoaded":
            stats = message.GetArgumentList()
            self.canvas.on_model_loaded_callback(stats)
        elif message.GetName() == "onModelError":
            error = message.GetArgumentList()[0]
            self.canvas.on_model_error_callback(error)

