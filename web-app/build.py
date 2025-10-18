#!/usr/bin/env python3
"""
Build script for the web app - concatenates Python files for easier development
"""

import os
from pathlib import Path

def build_app():
    """Build the app by combining Python files into the JS file"""
    
    web_app_dir = Path(__file__).parent
    python_dir = web_app_dir / "python"
    
    # Read all Python files
    python_files = [
        "web_logger.py",
        "qr_generator.py", 
        "pdf_processor.py"
    ]
    
    js_content = []
    
    # Start JavaScript content
    js_content.append("""let pyodide;
let currentFiles = [];
let currentPDFFiles = [];
let qrPdfBlob = null;
let resultsBlob = null;

// Initialize Pyodide
async function initializePyodide() {
    try {
        updateProgress(10, "Lade Pyodide...");
        pyodide = await loadPyodide();
        
        updateProgress(30, "Installiere Pakete...");
        await pyodide.loadPackage("micropip");
        
        const micropip = pyodide.pyimport("micropip");
        
        // Install PyMuPDF experimental wheel
        updateProgress(40, "Installiere PyMuPDF (experimentell)...");
        try {
            await micropip.install("https://github.com/pymupdf/PyMuPDF/releases/download/1.23.20/PyMuPDF-1.23.20-cp311-none-emscripten_3_1_46_wasm32.whl");
        } catch (error) {
            console.log("PyMuPDF wheel failed, falling back to PyPDF2");
            await micropip.install(["PyPDF2", "pypdf"]);
        }
        
        updateProgress(50, "Installiere OpenCV...");
        await micropip.install("opencv-python");
        
        updateProgress(60, "Installiere weitere Pakete...");
        await micropip.install(["Pillow", "reportlab", "qrcode", "numpy"]);
        
        updateProgress(80, "Lade Python-Code...");
        
        // Load our Python modules
        await loadPythonModules();
        
        updateProgress(100, "Fertig!");
        
        setTimeout(() => {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('mainPage').classList.remove('hidden');
        }, 500);
        
    } catch (error) {
        console.error("Error initializing Pyodide:", error);
        alert("Fehler beim Laden der Python-Umgebung: " + error);
    }
}

function updateProgress(percent, text) {
    document.getElementById('loadProgress').style.width = percent + '%';
    if (text) {
        document.querySelector('#loading p').textContent = text;
    }
}

async function loadPythonModules() {
    const pythonCode = `""")
    
    # Add all Python files
    for py_file in python_files:
        file_path = python_dir / py_file
        if file_path.exists():
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                js_content.append(f"# === {py_file} ===")
                js_content.append(content)
                js_content.append("")
    
    # Add the rest of the JavaScript
    js_content.append("""print("Python modules loaded successfully!")
    `;
    
    pyodide.runPython(pythonCode);
}

// [REST OF JAVASCRIPT FUNCTIONS WOULD GO HERE]

// Initialize when page loads
window.addEventListener('load', initializePyodide);""")
    
    # Write to build file
    build_file = web_app_dir / "app-build.js"
    with open(build_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(js_content))
    
    print(f"✅ Built app-build.js with {len(python_files)} Python modules")

if __name__ == "__main__":
    build_app()