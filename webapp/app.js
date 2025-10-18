// app.js - Pyodide Web Application Loader

class DiRueLeiApp {
    constructor() {
        this.pyodide = null;
        this.loadingElement = document.getElementById('loading');
        this.contentElement = document.getElementById('content');
        this.progressBar = document.getElementById('progress-bar');
        this.loadingStatus = document.getElementById('loading-status');
        this.outputElement = document.getElementById('python-output');
        
        // Packages from requirements.txt that are available in Pyodide
        this.availablePackages = [
            'numpy',
            'pillow',
            'opencv-python',
            'pymupdf', 
        ];
        
        // Packages that need to be installed via micropip
        this.micropipPackages = [
            'qrcode',
        ];
        
        // Experimental packages with specific wheel URLs
        this.experimentalPackages = [
            {
                name: 'ReportLab',
                url: 'https://files.pythonhosted.org/packages/57/66/e040586fe6f9ae7f3a6986186653791fb865947f0b745290ee4ab026b834/reportlab-4.4.4-py3-none-any.whl'
            }
        ];
        
        this.totalSteps = 2 + this.availablePackages.length + this.micropipPackages.length + this.experimentalPackages.length;
        this.currentStep = 0;
    }
    
    updateProgress(message) {
        this.currentStep++;
        const percentage = (this.currentStep / this.totalSteps) * 100;
        this.progressBar.style.width = percentage + '%';
        this.loadingStatus.textContent = message;
        console.log(`Progress: ${percentage.toFixed(1)}% - ${message}`);
    }
    
    async init() {
        try {
            this.updateProgress('Loading Pyodide...');
            
            // Load Pyodide
            this.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"
            });
            
            this.updateProgress('Pyodide loaded successfully');
            
            // Load packages available in Pyodide
            for (const pkg of this.availablePackages) {
                try {
                    this.updateProgress(`Loading ${pkg}...`);
                    await this.pyodide.loadPackage(pkg);
                    console.log(`Successfully loaded ${pkg}`);
                } catch (error) {
                    console.warn(`Failed to load ${pkg}:`, error);
                    this.showMessage(`Warning: Could not load ${pkg}`, 'error');
                }
            }
            
            // Install packages via micropip
            if (this.micropipPackages.length > 0 || this.experimentalPackages.length > 0) {
                await this.pyodide.loadPackage("micropip");
                const micropip = this.pyodide.pyimport("micropip");
                
                // Install regular packages
                for (const pkg of this.micropipPackages) {
                    try {
                        this.updateProgress(`Installing ${pkg} via micropip...`);
                        await micropip.install(pkg);
                        console.log(`Successfully installed ${pkg}`);
                    } catch (error) {
                        console.warn(`Failed to install ${pkg}:`, error);
                        this.showMessage(`Warning: Could not install ${pkg}`, 'error');
                    }
                }
                
                // Install experimental packages from specific URLs
                for (const pkg of this.experimentalPackages) {
                    try {
                        this.updateProgress(`Installing experimental ${pkg.name}...`);
                        await micropip.install(pkg.url);
                        console.log(`Successfully installed experimental ${pkg.name}`);
                    } catch (error) {
                        console.warn(`Failed to install experimental ${pkg.name}:`, error);
                        this.showMessage(`Warning: Could not install experimental ${pkg.name}`, 'error');
                    }
                }
            }
            
            this.updateProgress('Setting up Python environment...');
            
            // Set up Python environment
            this.pyodide.runPython(`
import sys
print("Python version:", sys.version)
print("Available modules:")

# Test available imports
available_modules = []
test_modules = ['numpy', 'PIL', 'qrcode', 'cv2', 'reportlab', 'fitz']

for module in test_modules:
    try:
        __import__(module)
        available_modules.append(module)
        print(f"✓ {module}")
    except ImportError as e:
        print(f"✗ {module}: {e}")

print(f"\\nSuccessfully loaded {len(available_modules)} modules: {', '.join(available_modules)}")
            `);
            
            // Run Hello World example
            this.runHelloWorld();
            
            // Hide loading screen and show content
            this.loadingElement.style.display = 'none';
            this.contentElement.style.display = 'block';
            
            this.showMessage('Application loaded successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to initialize Pyodide:', error);
            this.showMessage(`Failed to load application: ${error.message}`, 'error');
        }
    }
    
    runHelloWorld() {
        try {
            const result = this.pyodide.runPython(`
# Hello World with module testing
import sys
from datetime import datetime

def hello_world():
    return f"""
Hello, World! 🌍
Welcome to DiRueLei Web Application!

Current time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
Python version: {sys.version.split()[0]}
Platform: Pyodide (WebAssembly)

This is your Python environment running in the browser!
"""

# Test some functionality
def test_numpy():
    try:
        import numpy as np
        arr = np.array([1, 2, 3, 4, 5])
        return f"NumPy test: Array sum = {arr.sum()}, Mean = {arr.mean():.2f}"
    except ImportError:
        return "NumPy not available"

def test_qrcode():
    try:
        import qrcode
        return "QR Code library is available for generating QR codes"
    except ImportError:
        return "QR Code library not available"

def test_opencv():
    try:
        import cv2
        import numpy as np
        # Test basic OpenCV functionality
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        return f"OpenCV test: Created {img.shape} image, version {cv2.__version__}"
    except ImportError:
        return "OpenCV not available"

def test_reportlab():
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.pagesizes import letter
        import io
        # Test basic ReportLab functionality
        buffer = io.BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        c.drawString(100, 750, "Hello from ReportLab in Pyodide!")
        c.save()
        return f"ReportLab test: Successfully created PDF document"
    except ImportError:
        return "ReportLab not available"
    except Exception as e:
        return f"ReportLab error: {str(e)}"

def test_pymupdf():
    try:
        import fitz
        # Test basic PyMuPDF functionality
        doc = fitz.open()  # Create empty document
        page = doc.new_page()  # Add a page
        page.insert_text((72, 72), "Hello from PyMuPDF in Pyodide!")
        doc.close()
        return f"PyMuPDF test: Successfully created document, version {fitz.version[0]}"
    except ImportError:
        return "PyMuPDF not available"
    except Exception as e:
        return f"PyMuPDF error: {str(e)}"

# Generate output
output = hello_world()
output += "\\n\\n" + test_numpy()
output += "\\n" + test_qrcode()
output += "\\n" + test_opencv()
output += "\\n" + test_reportlab()
output += "\\n" + test_pymupdf()

print(output)
output
            `);
            
            this.displayOutput(result);
            
        } catch (error) {
            console.error('Error running Python code:', error);
            this.showMessage(`Error running Python code: ${error.message}`, 'error');
        }
    }
    
    displayOutput(content) {
        this.outputElement.innerHTML = `<pre>${content}</pre>`;
    }
    
    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = type;
        messageDiv.textContent = message;
        
        // Insert after loading status
        this.loadingStatus.parentNode.insertBefore(messageDiv, this.loadingStatus.nextSibling);
        
        // Remove after 5 seconds for non-error messages
        if (type !== 'error') {
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 5000);
        }
    }
    
    // Public method to run Python code
    runPython(code) {
        if (!this.pyodide) {
            console.error('Pyodide not loaded yet');
            return null;
        }
        
        try {
            return this.pyodide.runPython(code);
        } catch (error) {
            console.error('Error running Python code:', error);
            this.showMessage(`Python error: ${error.message}`, 'error');
            return null;
        }
    }
}

// Initialize the application when the page loads
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new DiRueLeiApp();
    app.init();
});

// Make app globally available for debugging
window.diRueLeiApp = app;