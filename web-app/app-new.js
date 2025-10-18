let pyodide;
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
        
        // Try multiple PyMuPDF wheels in order of compatibility
        updateProgress(40, "Installiere PyMuPDF (experimentell)...");
        let hasPyMuPDF = false;
        
        try {
            // First try if PyMuPDF is available in the official Pyodide packages
            await pyodide.loadPackage("PyMuPDF");
            hasPyMuPDF = true;
            console.log("PyMuPDF loaded from official Pyodide packages!");
        } catch (error) {
            console.log("PyMuPDF not available in official packages, trying experimental wheels...");
            
            const pymupdfWheels = [
                // Try older versions that might be compatible with Emscripten 3.1.45
                "https://github.com/pymupdf/PyMuPDF/releases/download/1.23.19/PyMuPDF-1.23.19-cp311-none-emscripten_3_1_45_wasm32.whl",
                "https://github.com/pymupdf/PyMuPDF/releases/download/1.23.18/PyMuPDF-1.23.18-cp311-none-emscripten_3_1_45_wasm32.whl",
                "https://github.com/pymupdf/PyMuPDF/releases/download/1.23.17/PyMuPDF-1.23.17-cp311-none-emscripten_3_1_45_wasm32.whl",
                "https://github.com/pymupdf/PyMuPDF/releases/download/1.23.16/PyMuPDF-1.23.16-cp311-none-emscripten_3_1_45_wasm32.whl",
            ];
            
            for (const wheelUrl of pymupdfWheels) {
                try {
                    console.log(`Trying PyMuPDF wheel: ${wheelUrl}`);
                    await micropip.install(wheelUrl);
                    hasPyMuPDF = true;
                    console.log("PyMuPDF experimental wheel installed successfully!");
                    break;
                } catch (error) {
                    console.log(`PyMuPDF wheel failed: ${error.message}`);
                    continue;
                }
            }
        }
        
        if (!hasPyMuPDF) {
            console.log("All PyMuPDF options failed, installing PyPDF2 fallback");
            await micropip.install(["PyPDF2", "pypdf"]);
        }
        
        updateProgress(50, "Installiere OpenCV...");
        try {
            await micropip.install("opencv-python");
        } catch (error) {
            console.log("OpenCV installation failed, QR detection will use demo mode");
        }
        
        updateProgress(60, "Installiere weitere Pakete...");
        await micropip.install(["Pillow", "reportlab", "qrcode", "numpy"]);
        
        updateProgress(80, "Lade Python-Code...");
        
        // Load our Python modules
        await loadPythonModules();
        
        // Show capability info
        showCapabilityInfo(hasPyMuPDF);
        
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

function showCapabilityInfo(hasPyMuPDF) {
    let messageHtml;
    
    if (hasPyMuPDF) {
        messageHtml = `
            <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="color: #155724; margin: 0 0 10px 0;">✅ Vollständige Funktionalität</h4>
                <p style="color: #155724; margin: 0; font-size: 14px;">
                    PyMuPDF wurde erfolgreich geladen. QR-Code-Erkennung funktioniert vollständig!
                </p>
            </div>
        `;
    } else {
        messageHtml = `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Eingeschränkter Modus</h4>
                <p style="color: #856404; margin: 0; font-size: 14px;">
                    PyMuPDF konnte nicht geladen werden. QR-Code-Erkennung läuft im Demo-Modus. 
                    Die QR-Code-Generierung funktioniert vollständig.
                </p>
            </div>
        `;
    }
    
    const mainPage = document.getElementById('mainPage');
    const header = mainPage.querySelector('.header');
    header.insertAdjacentHTML('afterend', messageHtml);
}

function updateProgress(percent, text) {
    document.getElementById('loadProgress').style.width = percent + '%';
    if (text) {
        document.querySelector('#loading p').textContent = text;
    }
}

async function loadPythonModules() {
    try {
        // Load Python files dynamically
        const pythonFiles = [
            'python/web_logger.py',
            'python/qr_generator.py',
            'python/pdf_processor.py'
        ];
        
        for (const filePath of pythonFiles) {
            try {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(`Failed to load ${filePath}: ${response.status}`);
                }
                const pythonCode = await response.text();
                pyodide.runPython(pythonCode);
                console.log(`Loaded ${filePath}`);
            } catch (error) {
                console.error(`Error loading ${filePath}:`, error);
                throw error;
            }
        }
        
        console.log("All Python modules loaded successfully!");
        
    } catch (error) {
        console.error("Error loading Python modules:", error);
        throw error;
    }
}

// UI Functions
function openInstructions() {
    window.open("https://hannesfunk.github.io/anleitung.pdf", "_blank");
}

function selectCSV() {
    showPage('qrGenerationPage');
    setupCSVDropZone();
}

function selectScanFiles() {
    showPage('scanPage');
    setupPDFDropZone();
}

function backToMain() {
    showPage('mainPage');
    // Reset any downloaded files
    qrPdfBlob = null;
    resultsBlob = null;
    currentFiles = [];
    currentPDFFiles = [];
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
}

function setupCSVDropZone() {
    const dropZone = document.getElementById('csvDrop');
    const fileInput = document.getElementById('csvFile');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
            handleCSVFile(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleCSVFile(e.target.files[0]);
        }
    });
}

function setupPDFDropZone() {
    const dropZone = document.getElementById('pdfDrop');
    const fileInput = document.getElementById('pdfFiles');
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'));
        if (files.length > 0) {
            handlePDFFiles(files);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handlePDFFiles(Array.from(e.target.files));
        }
    });
}

async function handleCSVFile(file) {
    const text = await file.text();
    document.getElementById('csvContent').textContent = text.substring(0, 500) + (text.length > 500 ? '...' : '');
    document.getElementById('csvPreview').classList.remove('hidden');
    currentFiles = [{ file: file, content: text }];
}

async function handlePDFFiles(files) {
    currentPDFFiles = [];
    
    for (const file of files) {
        const arrayBuffer = await file.arrayBuffer();
        currentPDFFiles.push({
            name: file.name,
            data: new Uint8Array(arrayBuffer)
        });
    }
    
    document.getElementById('scanOptions').classList.remove('hidden');
    
    const fileList = files.map(f => f.name).join(', ');
    alert(`${files.length} PDF-Datei(en) ausgewählt: ${fileList}`);
}

async function generateQRCodes() {
    if (currentFiles.length === 0) return;
    
    document.getElementById('qrProgress').classList.remove('hidden');
    document.getElementById('qrLog').classList.remove('hidden');
    
    pyodide.runPython('set_logger("qrLog")');
    
    try {
        const csvContent = currentFiles[0].content;
        
        // Show progress
        for (let i = 0; i <= 90; i += 10) {
            document.getElementById('qrProgressFill').style.width = i + '%';
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Generate QR codes using Python
        pyodide.globals.set('csv_content', csvContent);
        const pdfData = pyodide.runPython(`
pdf_bytes = generate_qr_pdf_from_csv(csv_content)
pdf_bytes
        `);
        
        // Create blob for download
        qrPdfBlob = new Blob([pdfData], { type: 'application/pdf' });
        
        document.getElementById('qrProgressFill').style.width = '100%';
        document.getElementById('qrDownload').classList.remove('hidden');
        
    } catch (error) {
        console.error("Error generating QR codes:", error);
        alert("Fehler bei der QR-Code Generierung: " + error);
    }
}

async function processPDFs() {
    if (currentPDFFiles.length === 0) return;
    
    document.getElementById('scanProgress').classList.remove('hidden');
    document.getElementById('scanLog').classList.remove('hidden');
    
    pyodide.runPython('set_logger("scanLog")');
    
    const options = {
        split_a3: document.getElementById('splitA3').checked,
        two_page_scan: document.getElementById('twoPageScan').checked,
        quick_and_dirty: document.getElementById('quickAndDirty').checked
    };
    
    try {
        // Show progress
        for (let i = 0; i <= 80; i += 10) {
            document.getElementById('scanProgressFill').style.width = i + '%';
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Prepare PDF data for Python
        const pdfFilesData = currentPDFFiles.map(file => [file.name, file.data]);
        
        pyodide.globals.set('pdf_files_data', pdfFilesData);
        pyodide.globals.set('options', options);
        
        const resultsData = pyodide.runPython(`
result_bytes = process_pdf_files(pdf_files_data, options)
result_bytes
        `);
        
        // Create blob for download
        resultsBlob = new Blob([resultsData], { type: 'application/zip' });
        
        document.getElementById('scanProgressFill').style.width = '100%';
        document.getElementById('scanDownload').classList.remove('hidden');
        
    } catch (error) {
        console.error("Error processing PDFs:", error);
        alert("Fehler bei der PDF-Verarbeitung: " + error);
    }
}

function downloadQRPDF() {
    if (!qrPdfBlob) return;
    
    const url = URL.createObjectURL(qrPdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'QR-Codes.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadResults() {
    if (!resultsBlob) return;
    
    const url = URL.createObjectURL(resultsBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ergebnisse.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Initialize when page loads
window.addEventListener('load', initializePyodide);