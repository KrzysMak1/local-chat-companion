#!/usr/bin/env python3
"""
Start script for the Local Chat Companion backend.
Run with: python start.py
"""
import os
import sys
from pathlib import Path

# Add current directory to path
sys.path.insert(0, str(Path(__file__).parent))

def main():
    # Load .env file if exists
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        print(f"Loading environment from {env_file}")
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ[key.strip()] = value.strip()
    
    # Import and run
    import uvicorn
    from main import app
    
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           Local Chat Companion - Backend Server              ║
╠══════════════════════════════════════════════════════════════╣
║  Backend URL:    http://localhost:{port}                       ║
║  Health check:   http://localhost:{port}/health                ║
║  API docs:       http://localhost:{port}/docs                  ║
╠══════════════════════════════════════════════════════════════╣
║  llama.cpp URL:  {os.getenv('LLAMA_BASE_URL', 'http://127.0.0.1:8081'):<40} ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    uvicorn.run(app, host=host, port=port, reload=False)

if __name__ == "__main__":
    main()
