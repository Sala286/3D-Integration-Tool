#!/usr/bin/env python3
"""Download three.module.js for ES module compatibility"""
import urllib.request
import os

url = 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js'
filename = 'three.module.js'

print(f'Downloading {filename}...')
try:
    urllib.request.urlretrieve(url, filename)
    if os.path.exists(filename):
        size = os.path.getsize(filename)
        print(f'Success! Downloaded {filename} ({size:,} bytes)')
    else:
        print('Error: File not found after download')
except Exception as e:
    print(f'Error downloading: {e}')

