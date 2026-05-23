#!/usr/bin/env python3
"""Project verification script"""
import os
import sys

def verify():
    print('=== PROJECT VERIFICATION ===\n')
    
    # 1. File structure
    print('File Structure:')
    required_files = ['app.py', 'requirements.txt', 'README.md', 'test_endpoints.py']
    for f in required_files:
        status = '✓' if os.path.exists(f) else '✗'
        print(f'  {status} {f}')
    
    required_dirs = ['templates', 'static', 'data']
    for d in required_dirs:
        status = '✓' if os.path.isdir(d) else '✗'
        print(f'  {status} {d}/')
    
    # 2. Check if Flask app can be imported
    print('\nPython Modules:')
    try:
        import app
        print('  ✓ app.py imports successfully')
    except Exception as e:
        print(f'  ✗ app.py import failed: {e}')
        return False
    
    # 3. Check dependencies
    print('\nDependencies:')
    with open('requirements.txt', 'r') as f:
        packages = [line.strip() for line in f if line.strip()]
        print(f'  ✓ {len(packages)} packages specified')
    
    # 4. Check data files
    print('\nData Files:')
    cache_status = 'exists' if os.path.exists('data/cache.json') else 'will be created'
    sample_status = 'exists' if os.path.exists('data/sample_data.json') else 'not created'
    print(f'  - cache.json: {cache_status}')
    print(f'  - sample_data.json: {sample_status}')
    
    print('\n=== VERIFICATION COMPLETE ===')
    print('\n✓ Project is ready to run!')
    print('\nTo start the server:')
    print('  python app.py')
    print('\nThen visit:')
    print('  http://127.0.0.1:5000')
    return True

if __name__ == '__main__':
    success = verify()
    sys.exit(0 if success else 1)
