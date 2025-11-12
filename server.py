#!/usr/bin/env python3
import http.server
import socketserver
import os
import gzip
import io

PORT = 5000
DIRECTORY = "."

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    
    def end_headers(self):
        # Cache control headers
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        
        # Security headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        
        super().end_headers()
    
    def send_error(self, code, message=None, explain=None):
        if code == 404:
            error_page = open('404.html', 'r', encoding='utf-8').read()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(error_page.encode('utf-8'))
        else:
            super().send_error(code, message, explain)

Handler = MyHTTPRequestHandler

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"خادم Smart HSR يعمل الآن على المنفذ {PORT}")
    print(f"قم بفتح المتصفح على: http://0.0.0.0:{PORT}")
    httpd.serve_forever()
