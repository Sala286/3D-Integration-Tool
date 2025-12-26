"""
Browser-based GLTF viewer using system default browser.
This avoids the pywebview threading issues.
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
from urllib.parse import quote, unquote


class WebViewCanvas(ctk.CTkFrame):
    """
    Canvas widget that opens GLTF viewer in system browser.
    Uses a local HTTP server to serve files.
    """
    
    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color="gray20", **kwargs)
        
        # Callback functions
        self.on_model_loaded: Optional[Callable[[dict]]] = None
        self.on_model_error: Optional[Callable[[str]]] = None
        
        # Get viewer directory - handle PyInstaller bundle
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
        self.model_files: list = []  # List of all loaded model files
        self.model_stats: Optional[dict] = None
        self.http_server: Optional[socketserver.TCPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.server_port = 8765
        self.server_started = False
        self.app_ref = None  # Reference to main app instance
        self.export_folder: Optional[str] = None  # Folder for saving exported images
        
        # Placeholder
        self.placeholder_label = ctk.CTkLabel(
            self,
            text="3D Viewer",
            text_color="white",
            font=ctk.CTkFont(size=14),
            justify="center"
        )
        self.placeholder_label.pack(expand=True)
        
        # Start local HTTP server on initialization
        self._start_local_server()
        print(f"Browser viewer initialized. Server will start when first file is loaded.")
    
    def _start_local_server(self):
        """Start a local HTTP server to serve viewer files."""
        if self.server_started and self.http_server:
            return
        
        try:
            class ViewerHandler(http.server.SimpleHTTPRequestHandler):
                # Class-level cache for static files (JS, CSS, WASM) to improve performance
                _file_cache = {}
                _cache_enabled = True
                
                def __init__(self, *args, viewer_dir=None, canvas_ref=None, app_ref=None, **kwargs):
                    self.viewer_dir = viewer_dir
                    self.canvas_ref = canvas_ref  # Reference to WebViewCanvas instance
                    self.app_ref = app_ref  # Reference to main app instance
                    super().__init__(*args, **kwargs)
                
                def _get_export_folder(self):
                    """Get export folder from canvas reference."""
                    if self.canvas_ref and hasattr(self.canvas_ref, 'export_folder'):
                        return self.canvas_ref.export_folder
                    return None
                
                def do_OPTIONS(self):
                    """Handle CORS preflight requests."""
                    self.send_response(200)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD')
                    self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                    self.end_headers()
                
                def do_HEAD(self):
                    """Handle HEAD requests - same as GET but without body."""
                    # HEAD requests should return same headers as GET but no body
                    # We'll handle this in do_GET by checking self.command
                    self.do_GET()
                
                def do_POST(self):
                    """Handle POST requests."""
                    parsed_path = self.path.split('?')[0]
                    path = parsed_path.lstrip('/')
                    
                    # Handle add-model API endpoint
                    if path == 'api/add-model':
                        self._handle_add_model()
                    elif path == 'api/capture-image':
                        self._handle_capture_image()
                    else:
                        self.send_response(404)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(b'{"error": "Not found"}')
                
                def _handle_add_model(self):
                    """Handle add model request from browser."""
                    try:
                        # Read request body
                        content_length = int(self.headers.get('Content-Length', 0))
                        if content_length > 0:
                            body = self.rfile.read(content_length)
                        else:
                            body = b'{}'
                        
                        # Parse JSON request (if any)
                        import json
                        try:
                            request_data = json.loads(body.decode('utf-8'))
                        except:
                            request_data = {}
                        
                        # Get app reference to trigger file dialog
                        app = self.app_ref
                        if app and hasattr(app, 'request_file_selection'):
                            # Extract file types from request if provided (for CSV files)
                            filetypes_raw = request_data.get('fileTypes')
                            # Convert JSON array of arrays to Python list of tuples
                            filetypes = None
                            if filetypes_raw:
                                filetypes = [tuple(ft) for ft in filetypes_raw]
                            title = request_data.get('title') or ('Select CSV File' if request_data.get('fileType') == 'csv' else None)
                            
                            # Request file selection from app (thread-safe)
                            file_path = app.request_file_selection(add_mode=True, filetypes=filetypes, title=title)
                            
                            if file_path and os.path.exists(file_path):
                                # Get file size for browser handling
                                file_size = os.path.getsize(file_path)
                                
                                # Return file URL for browser to load
                                file_name = os.path.basename(file_path)
                                file_url = f"/model/{file_name}"
                                
                                # Store file in canvas for serving
                                if self.canvas_ref:
                                    self.canvas_ref.add_model_file(file_path)
                                
                                if self.app_ref and hasattr(self.app_ref, 'notify_browser_file_loaded'):
                                    try:
                                        self.app_ref.notify_browser_file_loaded(file_path)
                                    except Exception as notify_err:
                                        print(f"Failed to notify desktop app: {notify_err}")
                                
                                response = {
                                    'success': True,
                                    'fileUrl': file_url,
                                    'fileName': file_name,
                                    'fileSize': file_size  # Add file size for browser to handle large files
                                }
                                
                                self.send_response(200)
                                self.send_header('Content-type', 'application/json')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.end_headers()
                                self.wfile.write(json.dumps(response).encode('utf-8'))
                            else:
                                # User cancelled or error
                                response = {
                                    'success': False,
                                    'error': 'No file selected' if not file_path else 'File not found'
                                }
                                
                                self.send_response(200)
                                self.send_header('Content-type', 'application/json')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.end_headers()
                                self.wfile.write(json.dumps(response).encode('utf-8'))
                        else:
                            # App reference not available
                            response = {
                                'success': False,
                                'error': 'Desktop app not available'
                            }
                            
                            self.send_response(500)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                    except Exception as e:
                        # Error handling
                        import json
                        response = {
                            'success': False,
                            'error': str(e)
                        }
                        
                        self.send_response(500)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps(response).encode('utf-8'))
                
                def _handle_capture_image(self):
                    """Handle image capture request from browser."""
                    try:
                        # Read request body
                        content_length = int(self.headers.get('Content-Length', 0))
                        if content_length == 0:
                            response = {
                                'success': False,
                                'error': 'No image data provided'
                            }
                            self.send_response(400)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                            return
                        
                        body = self.rfile.read(content_length)
                        
                        # Parse JSON request
                        import json
                        import base64
                        from datetime import datetime
                        try:
                            request_data = json.loads(body.decode('utf-8'))
                        except Exception as e:
                            response = {
                                'success': False,
                                'error': f'Invalid JSON: {str(e)}'
                            }
                            self.send_response(400)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                            return
                        
                        # Get image data
                        image_data = request_data.get('imageData', '')
                        if not image_data:
                            response = {
                                'success': False,
                                'error': 'No image data in request'
                            }
                            self.send_response(400)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                            return
                        
                        # Get export folder
                        export_folder = self._get_export_folder()
                        if not export_folder or not os.path.exists(export_folder):
                            response = {
                                'success': False,
                                'error': 'Export folder not set or does not exist'
                            }
                            self.send_response(400)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                            return
                        
                        # Extract base64 data (remove data:image/png;base64, prefix if present)
                        if ',' in image_data:
                            image_data = image_data.split(',')[1]
                        
                        # Decode base64
                        try:
                            image_bytes = base64.b64decode(image_data)
                        except Exception as e:
                            response = {
                                'success': False,
                                'error': f'Failed to decode image: {str(e)}'
                            }
                            self.send_response(400)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                            return
                        
                        # Get part name and filename from request (for part photo feature)
                        part_name = request_data.get('partName', '')
                        filename = request_data.get('filename', '')
                        
                        # If part name is provided, create folder for part inside main export folder
                        if part_name:
                            # Sanitize part name for folder name (remove invalid characters)
                            safe_part_name = part_name.replace('/', '_').replace('\\', '_').replace(':', '_').replace('*', '_').replace('?', '_').replace('"', '_').replace('<', '_').replace('>', '_').replace('|', '_').strip()
                            if not safe_part_name:
                                safe_part_name = 'unnamed_part'
                            
                            part_folder = os.path.join(export_folder, safe_part_name)
                            try:
                                os.makedirs(part_folder, exist_ok=True)
                                print(f"Created part folder: {part_folder}")
                            except Exception as e:
                                response = {
                                    'success': False,
                                    'error': f'Failed to create part folder: {str(e)}'
                                }
                                self.send_response(500)
                                self.send_header('Content-type', 'application/json')
                                self.send_header('Access-Control-Allow-Origin', '*')
                                self.end_headers()
                                self.wfile.write(json.dumps(response).encode('utf-8'))
                                return
                            
                            # Use provided filename (should be short name like "Front.png")
                            if filename:
                                file_path = os.path.join(part_folder, filename)
                            else:
                                # Fallback: use short name extracted from part name
                                # Try to extract keyword like "Front", "Rear", etc.
                                short_name = safe_part_name
                                keywords = ['Front', 'Rear', 'Back', 'Left', 'Right', 'Top', 'Bottom', 
                                           'Upper', 'Lower', 'Inner', 'Outer', 'Side', 'Center', 'Middle']
                                for keyword in keywords:
                                    if keyword.lower() in part_name.lower():
                                        # Check if it's a whole word
                                        import re
                                        if re.search(r'\b' + re.escape(keyword) + r'\b', part_name, re.IGNORECASE):
                                            short_name = keyword
                                            break
                                
                                filename = f"{short_name}.png"
                                file_path = os.path.join(part_folder, filename)
                        else:
                            # Generate filename with timestamp for regular captures
                            if not filename:
                                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                                filename = f"model-capture_{timestamp}.png"
                            file_path = os.path.join(export_folder, filename)
                        
                        # Save image
                        try:
                            with open(file_path, 'wb') as f:
                                f.write(image_bytes)
                            
                            response = {
                                'success': True,
                                'filePath': file_path,
                                'fileName': filename,
                                'message': f'Image saved to {filename}'
                            }
                            
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                            
                            # Notify app if available
                            if self.app_ref and hasattr(self.app_ref, 'set_status'):
                                try:
                                    self.app_ref.set_status(f"Image saved: {filename}")
                                except:
                                    pass
                        except Exception as e:
                            response = {
                                'success': False,
                                'error': f'Failed to save image: {str(e)}'
                            }
                            self.send_response(500)
                            self.send_header('Content-type', 'application/json')
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            self.wfile.write(json.dumps(response).encode('utf-8'))
                    except Exception as e:
                        import json
                        import traceback
                        traceback.print_exc()
                        response = {
                            'success': False,
                            'error': str(e)
                        }
                        self.send_response(500)
                        self.send_header('Content-type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps(response).encode('utf-8'))
                
                def do_GET(self):
                    """Handle GET requests."""
                    try:
                        # Parse path and query
                        parsed_path = self.path.split('?')[0]
                        path = unquote(parsed_path.lstrip('/'))
                    except (ConnectionResetError, BrokenPipeError, OSError) as e:
                        # Connection closed by client - ignore
                        return
                    except Exception as e:
                        # Other errors - log but don't crash
                        print(f"Error parsing path: {e}")
                        return
                    
                    # Serve GLTF files via /model/ route
                    if path.startswith('model/'):
                        # Extract file name from path
                        file_name = path.replace('model/', '')
                        file_path = None
                        
                        if self.canvas_ref:
                            # Check in model_files list first (for multiple models)
                            if hasattr(self.canvas_ref, 'model_files'):
                                for model_file in self.canvas_ref.model_files:
                                    if os.path.basename(model_file) == file_name:
                                        file_path = model_file
                                        break
                            
                            # Fallback to current_file if not found
                            if not file_path and self.canvas_ref.current_file:
                                if os.path.basename(self.canvas_ref.current_file) == file_name:
                                    file_path = self.canvas_ref.current_file
                        
                        if file_path and os.path.exists(file_path):
                            # Get file size for proper header and chunked streaming
                            file_size = os.path.getsize(file_path)
                            
                            # Serve the GLTF file
                            self.send_response(200)
                            # Set appropriate content type
                            if file_path.endswith('.gltf'):
                                self.send_header('Content-type', 'model/gltf+json')
                            elif file_path.endswith('.glb'):
                                self.send_header('Content-type', 'model/gltf-binary')
                            else:
                                self.send_header('Content-type', 'application/octet-stream')
                            self.send_header('Content-Length', str(file_size))
                            self.send_header('Access-Control-Allow-Origin', '*')
                            self.end_headers()
                            
                            # Use chunked streaming for large files (read in 8MB chunks)
                            # This prevents loading entire file into memory
                            chunk_size = 8 * 1024 * 1024  # 8MB chunks
                            with open(file_path, 'rb') as f:
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
                        
                        if current_file and os.path.exists(current_file):
                            # Pass HTTP URL instead of file:// URL
                            file_url = f"/model/{os.path.basename(current_file)}"
                            html_content = self._get_html_with_file(file_url)
                        else:
                            html_content = self._get_html_without_file()
                        
                        self.send_response(200)
                        self.send_header('Content-type', 'text/html')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(html_content.encode())
                    
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
                        
                        # Handle draco decoder files - alias missing files to available decoders
                        # Check for draco_wasm_wrapper.js requests and alias to draco_decoder_gltf.js
                        # Also handle variations with spaces (URL encoding issues)
                        if 'draco_wasm_wrapper.js' in normalized_path or 'draco wasm wrapper.js' in normalized_path:
                            # Alias draco_wasm_wrapper.js to draco_decoder_gltf.js (provides DracoDecoderModule)
                            alias_path = self.viewer_dir / 'draco_decoder_gltf.js'
                            if alias_path.exists():
                                file_path = alias_path
                        # Handle draco_decoder.js - try actual file first, then fallback
                        elif 'draco_decoder.js' in normalized_path and 'wasm_wrapper' not in normalized_path and 'wasm wrapper' not in normalized_path:
                            if not file_path.exists():
                                alias_path = self.viewer_dir / 'draco_decoder_gltf.js'
                                if alias_path.exists():
                                    file_path = alias_path
                        # Handle draco_decoder.wasm - try actual file first, then fallback
                        elif 'draco_decoder.wasm' in normalized_path:
                            if not file_path.exists():
                                alias_path = self.viewer_dir / 'draco_decoder_gltf.wasm'
                                if alias_path.exists():
                                    file_path = alias_path
                        
                        if file_path.exists() and file_path.is_file():
                            self.send_response(200)
                            # Set appropriate content type
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
                            
                            # For HEAD requests, send file size and end headers without body
                            if self.command == 'HEAD':
                                try:
                                    file_size = file_path.stat().st_size
                                    self.send_header('Content-Length', str(file_size))
                                    self.end_headers()
                                except Exception:
                                    self.end_headers()
                            # Only write body for non-HEAD requests
                            else:
                                try:
                                    # Use cache for static files (JS, CSS, WASM) but not for HTML (may change)
                                    cache_key = str(file_path)
                                    use_cache = (self._cache_enabled and 
                                                file_path.suffix in ['.js', '.css', '.wasm', '.json'] and
                                                not normalized_path.endswith('.html'))
                                    
                                    if use_cache and cache_key in self._file_cache:
                                        # Serve from cache
                                        file_data = self._file_cache[cache_key]
                                        self.send_header('Content-Length', str(len(file_data)))
                                        self.end_headers()
                                        self.wfile.write(file_data)
                                    else:
                                        # Read file and optionally cache
                                        with open(file_path, 'rb') as f:
                                            file_data = f.read()
                                        
                                        if use_cache:
                                            self._file_cache[cache_key] = file_data
                                        
                                        self.send_header('Content-Length', str(len(file_data)))
                                        self.end_headers()
                                        self.wfile.write(file_data)
                                except (ConnectionResetError, BrokenPipeError, OSError):
                                    # Connection closed by client - ignore
                                    pass
                                except Exception as e:
                                    # Other errors - don't cache
                                    self.send_header('Content-Length', '0')
                                    self.end_headers()
                        else:
                            # Only log non-DevTools 404s for debugging (suppress .well-known errors)
                            if '.well-known' not in normalized_path and 'devtools' not in normalized_path.lower():
                                print(f"File not found: {file_path} (requested: {path}, normalized: {normalized_path})")
                            try:
                                self.send_response(404)
                                self.end_headers()
                            except (ConnectionResetError, BrokenPipeError, OSError):
                                # Connection closed by client - ignore
                                pass
                
                def _get_html_with_file(self, file_url: str) -> str:
                    """Get HTML content - file URL passed via URL parameter."""
                    # Don't modify HTML, just return it as-is
                    # File URL will be passed as URL parameter
                    html_file = self.viewer_dir / 'index.html'
                    if html_file.exists():
                        return html_file.read_text(encoding='utf-8')
                    return self._get_html_without_file()
                
                def _get_html_without_file(self) -> str:
                    """Get HTML content without file."""
                    html_file = self.viewer_dir / 'index.html'
                    if html_file.exists():
                        return html_file.read_text(encoding='utf-8')
                    return "<html><body><h1>Viewer not found</h1></body></html>"
                
                def log_message(self, format, *args):
                    """Suppress server logs."""
                    pass
            
            # Create handler factory with canvas and app references
            handler_factory = lambda *args, **kwargs: ViewerHandler(
                *args, 
                viewer_dir=self.viewer_dir,
                canvas_ref=self,  # Pass self so handler can access current_file dynamically
                app_ref=self.app_ref,  # Pass app reference for file dialog
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
                        # ThreadingTCPServer already binds in __init__, just serve
                        # Verify it's listening
                        import socket
                        # Small delay to ensure binding
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
    
    def set_app_reference(self, app):
        """Set reference to main app instance for file dialog access."""
        self.app_ref = app
    
    def set_export_folder(self, folder_path: str):
        """Set the export folder for saving images."""
        if folder_path and os.path.exists(folder_path):
            self.export_folder = folder_path
            print(f"Export folder set to: {folder_path}")
        else:
            print(f"Warning: Export folder does not exist: {folder_path}")
    
    def stop_server(self):
        """Stop the HTTP server."""
        if self.http_server and self.server_started:
            try:
                self.http_server.shutdown()
                self.http_server.server_close()
                self.server_started = False
                print("Server stopped")
            except Exception as e:
                print(f"Error stopping server: {e}")
    
    def is_server_running(self) -> bool:
        """Check if server is running."""
        return self.server_started and self.http_server is not None
    
    def request_image_capture(self) -> bool:
        """Request image capture from browser viewer via JavaScript injection."""
        # This will be handled by the browser JavaScript
        # The browser will call the API endpoint when image is captured
        # For now, we just need to ensure the browser knows to capture
        # The actual capture will be triggered by the browser's Image button
        # We'll modify the viewer JavaScript to send to our API instead of downloading
        return True
    
    def add_model_file(self, file_path: str):
        """Add a model file to the list (for multiple models)."""
        if file_path and os.path.exists(file_path):
            if file_path not in self.model_files:
                self.model_files.append(file_path)
            # Also set as current_file for backward compatibility
            self.current_file = file_path
    
    def load_gltf(self, file_path: str):
        """Load GLTF file in browser."""
        if not os.path.exists(file_path):
            return False
        
        self.current_file = file_path
        # Add to model files list
        if file_path not in self.model_files:
            self.model_files.append(file_path)
        
        # Ensure server is running and ready
        if not self.server_started:
            print("Starting HTTP server for browser viewer...")
            self._start_local_server()
        
        # Wait for server to be ready
        if not self._wait_for_server_ready():
            print("Server not ready; unable to load file.")
            return False
        
        if self.server_port:
            # Use HTTP URL path instead of file:// URL
            # The file will be served via /model/ route
            file_name = os.path.basename(file_path)
            http_file_url = f"/model/{file_name}"
            encoded_file_url = quote(http_file_url, safe='')
            
            # Open in browser with HTTP URL as parameter
            url = f"http://localhost:{self.server_port}/index.html?file={encoded_file_url}"
            
            # Verify server is accessible before opening browser
            import socket
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex(('localhost', self.server_port))
                sock.close()
                
                if result == 0:
                    # Server is running, open browser
                    try:
                        webbrowser.open(url)
                        self.placeholder_label.configure(
                            text=f"3D Viewer\nModel: {os.path.basename(file_path)}"
                        )
                        return True
                    except Exception as e:
                        print(f"Error opening browser: {e}")
                        return False
                else:
                    print(f"Server on port {self.server_port} not accessible")
                    return False
            except Exception as e:
                print(f"Error checking server: {e}")
                return False
        else:
            print("Failed to start local server")
            return False
    
    def reset_view(self):
        """Reset camera view - not applicable for browser view."""
        # Could reload the page or send message via server
        pass
    
    def toggle_wireframe(self):
        """Toggle wireframe - not directly accessible in browser."""
        # Could implement via server message
        pass
    
    def clear(self):
        """Clear current model."""
        self.current_file = None
        self.model_stats = None
        self.placeholder_label.configure(
            text="3D Viewer"
        )
    
    def open_browser_viewer(self):
        """Open the viewer landing page without selecting a file."""
        if not self.server_started:
            print("Starting HTTP server for browser viewer...")
            self._start_local_server()
        
        if not self._wait_for_server_ready():
            print("Server not ready; cannot open browser.")
            return False
        
        url = f"http://localhost:{self.server_port}/index.html"
        try:
            webbrowser.open(url)
            self.placeholder_label.configure(text="3D Viewer\n(Browser opened)")
            return True
        except Exception as e:
            print(f"Error opening browser: {e}")
            return False
    
    def _wait_for_server_ready(self, timeout_seconds: int = 20) -> bool:
        """Ensure the HTTP server is listening before attempting browser actions."""
        waited = 0
        while waited < timeout_seconds:
            if self.server_port and self.server_started:
                import socket
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(0.1)
                    result = sock.connect_ex(('127.0.0.1', self.server_port))
                    sock.close()
                    if result == 0:
                        print(f"Server confirmed listening on port {self.server_port}")
                        return True
                except Exception:
                    pass
            time.sleep(0.1)
            waited += 1
        return False
    
    def on_model_loaded_callback(self, stats: dict):
        """Called when model loads (if using webview API)."""
        self.model_stats = stats
        if self.on_model_loaded:
            self.on_model_loaded(stats)
    
    def on_model_error_callback(self, error: str):
        """Called on model error."""
        if self.on_model_error:
            self.on_model_error(error)

