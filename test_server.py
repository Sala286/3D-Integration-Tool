"""
Quick test script to verify HTTP server works.
"""

import http.server
import socketserver
import os
from pathlib import Path
import webbrowser
import time

viewer_dir = Path(__file__).parent / "viewer"
port = 8765

class ViewerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, viewer_dir=None, **kwargs):
        self.viewer_dir = viewer_dir
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        path = self.path.lstrip('/').split('?')[0]
        
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
        else:
            file_path = self.viewer_dir / path
            if file_path.exists() and file_path.is_file():
                self.send_response(200)
                if path.endswith('.js'):
                    self.send_header('Content-type', 'application/javascript')
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
        print(f"GET {self.path}")

# Create server
handler = lambda *args, **kwargs: ViewerHandler(*args, viewer_dir=viewer_dir, **kwargs)
httpd = socketserver.ThreadingTCPServer(("", port), handler)
httpd.allow_reuse_address = True

print(f"Starting test server on http://localhost:{port}")
print("Press Ctrl+C to stop")

# Start in thread
import threading
def serve():
    httpd.serve_forever()

thread = threading.Thread(target=serve, daemon=True)
thread.start()

# Wait a moment
time.sleep(1)

# Open browser
url = f"http://localhost:{port}/index.html"
print(f"Opening: {url}")
webbrowser.open(url)

# Keep running
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nStopping server...")
    httpd.shutdown()

