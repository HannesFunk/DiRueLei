// scan-worker.js - Web Worker for PDF scanning with Pyodide
// This runs in a separate thread to keep the UI responsive

// Import Pyodide from CDN
importScripts('https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.js');

let pyodide = null;
let ExamReader = null;
let isInitialized = false;

// Initialize Pyodide and load Python modules
async function initialize() {
    if (isInitialized) return;
    
    try {
        postMessage({ type: 'LOG', message: 'Loading Pyodide in worker...', level: 'info' });
        
        // Load Pyodide
        pyodide = await loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/'
        });
        
        postMessage({ type: 'INIT_PROGRESS', package: 'Pyodide', current: 1, total: 'n'});
        
        // Install required packages
        await pyodide.loadPackage(['micropip']);
        const micropip = pyodide.pyimport('micropip');
        
        // Install packages one by one with progress updates
        const packages = [
            'Pillow',
            'reportlab', 
            'PyPDF2',
            'PyMuPDF',
            'opencv-python',
            'qrcode',
            'numpy'
        ];        
        
        const modules = [
            { name: 'qr_reader.py', path: './python_modules/qr_reader.py' },
            { name: 'qr_generator.py', path: './python_modules/qr_generator.py' }
        ];
        
        const totalSteps = 1 + packages.length + modules.length;

        let iStep = 0;
        for (iStep = 0; iStep < packages.length; iStep++) {
            const pkg = packages[iStep];
            postMessage({ 
                type: 'INIT_PROGRESS', 
                package: pkg, 
                current: iStep + 2, 
                total: totalSteps
            });
            await micropip.install(pkg);
        }
        
        postMessage({ type: 'LOG', message: 'Loading Python modules...', level: 'info' });
        
        // Load Python module files

        
        for (const module of modules) {
            try {
                const response = await fetch(module.path);
                if (!response.ok) throw new Error(`Failed to load ${module.name}`);
                const code = await response.text();
                pyodide.runPython(code);
                iStep++;
                postMessage({ 
                    type: 'INIT_PROGRESS', 
                    package: module.name, 
                    current: iStep + 1, 
                    total: totalSteps
                });
            } catch (error) {
                postMessage({ 
                    type: 'ERROR', 
                    message: `Failed to load ${module.name}: ${error.message}` 
                });
                throw error;
            }
        }
        
        // Get the ExamReader class
        ExamReader = pyodide.globals.get('ExamReader');
        
        isInitialized = true;
        postMessage({ type: 'INITIALIZED' });
        postMessage({ type: 'LOG', message: 'Worker initialized successfully', level: 'success' });
        
    } catch (error) {
        postMessage({ 
            type: 'ERROR', 
            message: `Initialization failed: ${error.message}` 
        });
        throw error;
    }
}

// Handle messages from main thread
self.onmessage = async function(event) {
    const { type, data } = event.data;
    
    switch (type) {
        case 'INIT':
            await initialize();
            break;
            
        case 'GENERATE_QR':
            await handleQRGeneration(data);
            break;
            
        case 'SCAN_START':
            await handleScan(data);
            break;
            
        case 'SCAN_CANCEL':
            // TODO: Implement cancellation
            postMessage({ type: 'LOG', message: 'Scan cancelled', level: 'warning' });
            break;
            
        default:
            postMessage({ type: 'ERROR', message: `Unknown message type: ${type}` });
    }
};

// Handle QR code generation
async function handleQRGeneration(data) {
    try {
        if (!isInitialized) {
            await initialize();
        }
        
        const { csvContent, copies, offsetRow, offsetCol, selectedStudents, csvFilename } = data;
        
        postMessage({ type: 'LOG', message: 'Generating QR codes...', level: 'info' });
        
        // Get the QRGenerator class
        const QRGenerator = pyodide.globals.get('QRGenerator');
        
        // Create QRGenerator instance with CSV content
        const qrGenerator = QRGenerator(csvContent, csvFilename);
        
        // Set selected students if provided
        if (selectedStudents && selectedStudents.length > 0) {
            // Convert JavaScript array to Python list
            // The students are JavaScript objects, so we need to convert them properly
            const pyStudents = pyodide.toPy(selectedStudents);
            qrGenerator.set_students(pyStudents);
            pyStudents.destroy(); // Clean up the converted object
        }
        
        postMessage({ type: 'LOG', message: `Generating ${copies} copy/copies with offset (${offsetRow}, ${offsetCol})...`, level: 'info' });
        
        // Generate the PDF
        const pdfBytesProxy = qrGenerator.generate_qr_pdf_bytes(copies, offsetRow, offsetCol);
        
        // Convert to JavaScript Uint8Array
        const pdfBytes = new Uint8Array(pdfBytesProxy.toJs());
        pdfBytesProxy.destroy();
        
        // Get filename
        const filename = qrGenerator.get_filename();
        
        // Send result back (transfer ownership for efficiency)
        postMessage({
            type: 'QR_COMPLETE',
            pdfBytes: pdfBytes,
            filename: filename
        }, [pdfBytes.buffer]);
        
        postMessage({ type: 'LOG', message: 'QR codes generated successfully!', level: 'success' });
        
        // Cleanup
        qrGenerator.destroy();
        QRGenerator.destroy();
        
    } catch (error) {
        postMessage({ 
            type: 'ERROR', 
            message: `QR generation error: ${error.message}\n${error.stack}` 
        });
    }
}

// Handle the PDF scanning process
async function handleScan(data) {
    try {
        if (!isInitialized) {
            await initialize();
        }
        
        const { pdfFiles, options } = data;
        
        postMessage({ type: 'SCAN_LOG', message: 'Starting PDF scan...', level: 'info' });
        
        // Create progress callback that sends messages back to main thread
        pyodide.runPython(`
import js
from pyodide.ffi import to_js

def progress_callback(percentage):
    js.postMessage(to_js({
        'type': 'SCAN_PROGRESS',
        'percentage': float(percentage)
    }, dict_converter=js.Object.fromEntries))

def log_callback(message, level='info'):
    js.postMessage(to_js({
        'type': 'SCAN_LOG',
        'message': str(message),
        'level': str(level)
    }, dict_converter=js.Object.fromEntries))
        `);
        
        const progressCallback = pyodide.globals.get('progress_callback');
        const logCallback = pyodide.globals.get('log_callback');
        
        const pdfFilesForPython = pdfFiles.map(file => ({
            name: file.name,
            data: file.data
        }));
        
        const examReader = ExamReader(pdfFilesForPython, {
            two_page_scan: options.twoPageScan || false,
            split_a3: options.splitA3 || false,
            quick_and_dirty: options.quickAndDirty || false
        });
        
        examReader.progress_callback = progressCallback;
        examReader.log_callback = logCallback;
        
        postMessage({ type: 'SCAN_LOG', message: 'Processing PDFs...', level: 'info' });
        const success = await examReader.process();
        
        if (success) {
            postMessage({ type: 'SCAN_LOG', message: 'Scan completed, preparing results...', level: 'success' });
            
            // Get the ZIP and summary bytes
            const zipBytesProxy = examReader.get_zip_bytes();
            const summaryBytesProxy = examReader.get_summary_bytes();
            
            // Convert to JavaScript Uint8Array
            const zipBytes = new Uint8Array(zipBytesProxy.toJs());
            const summaryBytes = new Uint8Array(summaryBytesProxy.toJs());
            
            // Clean up proxies
            zipBytesProxy.destroy();
            summaryBytesProxy.destroy();
            
            // Send results back to main thread (transfer ownership for efficiency)
            postMessage({
                type: 'SCAN_COMPLETE',
                zipBytes: zipBytes,
                summaryBytes: summaryBytes
            }, [zipBytes.buffer, summaryBytes.buffer]);
            
            postMessage({ type: 'SCAN_LOG', message: 'Results sent to main thread', level: 'success' });
            
        } else {
            postMessage({ type: 'ERROR', message: 'PDF scan failed' });
        }
        
        // Clean up
        examReader.close();
        progressCallback.destroy();
        logCallback.destroy();
        
    } catch (error) {
        postMessage({ 
            type: 'ERROR', 
            message: `Scan error: ${error.message}\n${error.stack}` 
        });
    }
}

// Send initial ready message
postMessage({ type: 'READY' });
