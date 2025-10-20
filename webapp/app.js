// app.js - DiRueLei Web Application

class DiRueLeiApp {
    constructor() {
        this.pyodide = null;
        this.loadingElement = document.getElementById('loading');
        this.mainAppElement = document.getElementById('main-app');
        this.progressBar = document.getElementById('progress-bar');
        this.loadingStatus = document.getElementById('loading-status');
        
        // Application state
        this.pdfFiles = [];
        this.examReader = null;
        this.qrGenerator = null;
        
        // Python modules
        this.QRGenerator = null;
        this.ExamReader = null;
        
        // Package configuration
        this.availablePackages = [
            'numpy',
            'pillow',
            'opencv-python'
        ];
        
        this.micropipPackages = [
            'qrcode',
            'pymupdf'
        ];
        
        this.experimentalPackages = [
            {
                name: 'ReportLab',
                url: 'https://files.pythonhosted.org/packages/57/66/e040586fe6f9ae7f3a6986186653791fb865947f0b745290ee4ab026b834/reportlab-4.4.4-py3-none-any.whl'
            },
            {
                name: 'PyPDF2',
                url: 'https://files.pythonhosted.org/packages/8e/5e/c86a5643653825d3c913719e788e41386bee415c2b87b4f955432f2de6b2/pypdf2-3.0.1-py3-none-any.whl'
            }
        ];
        
        this.totalSteps = 2 + this.availablePackages.length + this.micropipPackages.length + this.experimentalPackages.length + 1;
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
            this.updateProgress('Lade Pyodide...');
            
            // Load Pyodide
            this.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/",
            });
            this.pyodide.setDebug(true);
            
            this.updateProgress('Pyodide geladen.');
            
            // Load packages available in Pyodide
            for (const pkg of this.availablePackages) {
                try {
                    this.updateProgress(`Lade ${pkg}...`);
                    await this.pyodide.loadPackage(pkg);
                    console.log(`${pkg} geladen.`);
                } catch (error) {
                    console.warn(`Failed to load ${pkg}:`, error);
                    this.showStatus(`Fehler: ${pkg} konnte nicht geladen werden.`, 'error');
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
                        this.showStatus(`Warning: Could not install ${pkg}`, 'error');
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
                        this.showStatus(`Warning: Could not install experimental ${pkg.name}`, 'error');
                    }
                }
            }
            
            this.updateProgress('Lade Python-Module...');
            
            // Load our custom Python modules
            await this.loadPythonModules();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Hide loading screen and show main app
            this.loadingElement.style.display = 'none';
            this.mainAppElement.classList.remove('hidden');
            
            this.showStatus('Anwendung erfolgreich geladen!', 'success', 3000);
            
        } catch (error) {
            console.error('Pyodide konnte nicht initialisiert werden.', error);
            this.showStatus(`Anwendung konnte nicht geladen werden. Fehlermeldung: ${error.message}`, 'error');
        }
    }
    
    async loadPythonModules() {
        // Create Python module loader
        const moduleLoader = new PythonModuleLoader(this.pyodide);
        
        // Define modules to load
        const moduleConfig = [
            {
                name: 'qr_generator',
                path: './python_modules/qr_generator.py'
            },
            {
                name: 'exam_reader', 
                path: './python_modules/qr_reader.py'
            }
        ];
        
        // Load all Python modules
        const results = await moduleLoader.loadAllModules(moduleConfig);
        
        if (results.failed.length > 0) {
            console.warn('Some Python modules failed to load:', results.failed);
            this.showStatus(`Warning: ${results.failed.length} Python modules failed to load`, 'error');
        }
        
        // Get references to the Python classes
        this.QRGenerator = this.pyodide.globals.get('QRGenerator');
        this.ExamReader = this.pyodide.globals.get('ExamReader');
        this.PdfManager = this.pyodide.globals.get('PdfManager');
        
        console.log(`Successfully loaded ${results.successful.length} Python modules:`, results.successful);
    }
    
    setupEventListeners() {
        const listeners = [
            {'id': 'open-instructions-btn', 'func': this.openInstructions, 'event': 'click'},
            {'id': 'csv-file', 'func': this.handleCsvFileUpload, 'event': 'change'},
            {'id': 'generate-qr-btn', 'func': this.generateQRPdf, 'event': 'click'},
            {'id': 'pdf-files', 'func': this.handlePdfFilesUpload, 'event': 'change'},
            {'id': 'process-pdf-btn', 'func': this.startPdfScan, 'event': 'click'},
            {'id': 'checkbox-use-offset', 'func': this.toggleOffset, 'event': 'change'},
            {'id': 'checkbox-select-students', 'func': this.toggleSelectStudents, 'event': 'change'},
            {'id': 'select-all', 'func': this.toggleSelectAll, 'event': 'change'}
           // {'id': 'download-results-btn', 'func': this.downloadResults(), 'event': 'click'},
            
        ];

        for (const listener of listeners) {
            document.getElementById(listener.id).addEventListener(listener.event, listener.func.bind(this));
        }

        // document.getElementById("process-pdf-btn").addEventListener('click', 
        //     () => {
        //         this.startPdfScan().then(
        //             () => {this.showStatus("Reading successful.");}
        //         )
        //         this.showStatus("Started reading process.");
        //     }
        // );
        this.setupDragAndDrop();
    }
    
    setupDragAndDrop() {
        const csvDropzone = document.getElementById('csv-dropzone');
        const csvFileInput = document.getElementById('csv-file');
        
        if (csvDropzone && csvFileInput) {
            this.setupDropzone(csvDropzone, csvFileInput, (files) => {
                csvFileInput.files = files;
                csvFileInput.dispatchEvent(new Event('change'));
            });
        }
        
        const pdfDropzone = document.getElementById('pdf-dropzone');
        const pdfFileInput = document.getElementById('pdf-files');
        
        if (pdfDropzone && pdfFileInput) {
            this.setupDropzone(pdfDropzone, pdfFileInput, (files) => {
                pdfFileInput.files = files;
                pdfFileInput.dispatchEvent(new Event('change'));
            });
        }
    }
    
    setupDropzone(dropzone, fileInput, onFilesSelected) {
        dropzone.addEventListener('click', () => {
            fileInput.click();
        });
        
        // Drag and drop events
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            if (!dropzone.contains(e.relatedTarget)) {
                dropzone.classList.remove('dragover');
            }
        });
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                // Create a FileList-like object
                const dt = new DataTransfer();
                for (let i = 0; i < files.length; i++) {
                    dt.items.add(files[i]);
                }
                onFilesSelected(dt.files);
            }
        });
        
        // File input change event
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                dropzone.classList.add('has-files');
                this.updateDropzoneText(dropzone, fileInput.files);
            } else {
                dropzone.classList.remove('has-files');
                this.resetDropzoneText(dropzone);
            }
        });
    }
    
    updateDropzoneText(dropzone, files) {
        const uploadText = dropzone.querySelector('.upload-text');
        if (uploadText && files.length > 0) {
            const fileNames = Array.from(files).map(f => f.name).join(', ');
            const primaryText = dropzone.querySelector('.upload-primary');
            const secondaryText = dropzone.querySelector('.upload-secondary');
            
            if (primaryText && secondaryText) {
                primaryText.textContent = `${files.length} Datei(en) ausgewählt`;
                secondaryText.textContent = fileNames.length > 50 ? fileNames.substring(0, 50) + '...' : fileNames;
            }
        }
    }
    
    resetDropzoneText(dropzone) {
        const primaryText = dropzone.querySelector('.upload-primary');
        const secondaryText = dropzone.querySelector('.upload-secondary');
        
        if (primaryText && secondaryText) {
            const isCsv = dropzone.id === 'csv-dropzone';
            primaryText.textContent = `Bewegen Sie ${isCsv ? 'CSV-Datei' : 'PDF-Datei(en)'} in dieses Feld (Drag&Drop)`;
            secondaryText.textContent = 'oder klicken Sie hier zum Durchsuchen';
        }
    }

    toggleOffset() {
        const checkbox = document.getElementById('checkbox-use-offset');
        if (checkbox.checked)  {
            document.getElementById('offset-settings').classList.remove('hidden');
        } else {
            document.getElementById('offset-settings').classList.add('hidden');
            document.getElementById('offset-row').value = 1;
            document.getElementById('offset-col').value = 1;
        }
    }

    toggleSelectStudents() {
        const checkbox = document.getElementById('checkbox-select-students');
        const studentSelection = document.getElementById('student-selection');
        
        if (checkbox.checked) {
            studentSelection.classList.remove('hidden');
        } else {
            studentSelection.classList.add('hidden');
        }
    }
    
    toggleSelectAll() {
        const selectAllCheckbox = document.getElementById('select-all');
        const studentCheckboxes = document.querySelectorAll('#student-checkboxes input[type="checkbox"]');
        
        studentCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
        });
    }
    
    getSelectedStudents() {
        const selectStudentsCheckbox = document.getElementById('checkbox-select-students');
        
        // If student selection is not enabled, return all students
        if (!selectStudentsCheckbox.checked) {
            return this.qrGenerator.get_students();
        }
        
        // Get all students and filter by selected checkboxes
        const allStudents = this.qrGenerator.get_students();
        const selectedStudents = [];
        
        const studentCheckboxes = document.querySelectorAll('#student-checkboxes input[type="checkbox"]');
        studentCheckboxes.forEach((checkbox, index) => {
            if (checkbox.checked && index < allStudents.length) {
                selectedStudents.push(allStudents[index]);
            }
        });
        
        return selectedStudents;
    }
    
    async handleCsvFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const csvData = await this.readFileAsText(file);
            this.showStatus('CSV-Datei geladen.', 'success');
            
            this.readFileAsArrayBuffer
            this.qrGenerator = this.QRGenerator(csvData, file.name);
            const students = this.qrGenerator.get_students().toJs();
                    document.getElementById('generate-qr-btn').disabled = false;
        
            document.getElementById('qr-settings').classList.remove('hidden');
            
            this.showStatus(`Daten für ${students.length} Schüler-/innen eingelesen.`, 'success');
            this.populateStudentCheckboxes(students);
            
        } catch (error) {
            this.showStatus(`Fehler bei Lesen der CSV-Datei: ${error.message} ${error.stack}`, 'error');
        }
    }

    openInstructions() {
        try {
            window.open('https://hannesfunk.github.io/anleitung.pdf', '_blank');
        } catch (error) {
            console.error('Failed to open instructions:', error);
            if (window.diRueLeiApp) {
                window.diRueLeiApp.showStatus('Die Anleitung konnte nicht im Browser geöffnet werden.', 'error');
            } else {
                alert('Die Anleitung konnte nicht im Browser geöffnet werden.');
            }
        }
    }
    
    populateStudentCheckboxes(students) {
        const studentCheckboxesContainer = document.getElementById('student-checkboxes');
        
        // Clear existing checkboxes
        studentCheckboxesContainer.innerHTML = '';
        
        // Create checkbox for each student
        students.forEach((student, index) => {
            const checkboxWrapper = document.createElement('label');
            checkboxWrapper.className = 'student-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true; // Default to selected
            checkbox.value = index;
            
            // Display student name (assuming student object has name or similar property)
            const studentName = student.name || student.Name || student['Vollständiger Name'] || student.nachname || student.Nachname || `Schüler ${index + 1}`;
            
            checkboxWrapper.appendChild(checkbox);
            checkboxWrapper.appendChild(document.createTextNode(` ${studentName}`));
            
            studentCheckboxesContainer.appendChild(checkboxWrapper);
        });
    }
    
    async generateQRPdf() {
        if (!this.qrGenerator) {
            this.showStatus('Noch keine CSV-Datei ausgewählt.', 'error');
            return;
        }
        
        try {
            this.showStatus('Erzeuge PDF mit QR-Codes...', 'info');
            
            // Get selected students
            const selectedStudents = this.getSelectedStudents();
            
            if (selectedStudents.length === 0) {
                this.showStatus('Bitte wählen Sie mindestens einen Schüler aus', 'error');
                return;
            }
            
            // Update the QRGenerator with selected students
            this.qrGenerator.set_students(selectedStudents);
            
            // Get settings
            const copies = parseInt(document.getElementById('copies').value) || 1;
            const offset_row = parseInt(document.getElementById('offset-row').value) || 1;
            const offset_col = parseInt(document.getElementById('offset-col').value) || 1;
            
            // Generate PDF - the Python method returns bytes
            const pdfBytes = this.qrGenerator.generate_qr_pdf_bytes(copies, offset_row, offset_col);
            
            // Ensure we have valid PDF data
            if (!pdfBytes || pdfBytes.length === 0) {
                throw new Error('Erzeugte PDF ist ungültig oder leer.');
            }
            
            // Convert Python bytes to JavaScript Uint8Array if needed
            const pdfData = pdfBytes.constructor === Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
            
            // Download PDF
            const outputFilename = this.qrGenerator.get_filename();
            this.downloadFile(pdfData, outputFilename, 'application/pdf');
            
            this.showStatus('PDF mit QR-Codes erfolgreich erzeugt!', 'success');
            
        } catch (error) {
            console.error('PDF generation error:', error);
            this.showStatus(`Fehler beim Erzeugen der PDF-Datei: ${error.message}`, 'error');
        }
    }
    
    async handlePdfFilesUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        
        try {
            this.pdfFiles = [];
            for (const file of files) {
                const arrayBuffer = await this.readFileAsArrayBuffer(file);
                this.pdfFiles.push({
                    name: file.name,
                    data: new Uint8Array(arrayBuffer)
                });
            }
            
            this.showStatus(`Loaded ${this.pdfFiles.length} PDF file(s)`, 'success');
            
            // Enable the process button and show scan settings
            const processBtn = document.getElementById('process-pdf-btn');
            if (processBtn) {
                processBtn.disabled = false;
            }
            
            const scanSettings = document.getElementById('scan-settings');
            if (scanSettings) {
                scanSettings.classList.remove('hidden');
            }
            
        } catch (error) {
            this.showStatus(`Error reading PDF files: ${error.message}`, 'error');
        }
    }
    
    async startPdfScan() {
        if (!this.pdfFiles.length) {
            this.showStatus('Please upload PDF files first', 'error');
            return;
        }
        
        this.showStatus('Scanne PDF...', 'info');
        try {
            const progressBar = document.getElementById('scan-progress-bar');
            if (progressBar) {
                progressBar.style.width = '0%';
                progressBar.textContent = '0%';
                progressBar.setAttribute('aria-valuenow', 0);
            }
            
            const scanOptions = {
                'split_a3': document.getElementById('split-a3')?.checked || false,
                'two_page_scan': document.getElementById('two-page-scan')?.checked || false,
                'quick_and_dirty': document.getElementById('quick-and-dirty')?.checked || false
            };
            
            const progressCallback = (progress) => {
                const progressBar = document.getElementById('scan-progress-bar');
                if (progressBar) {
                    const percentage = Math.round(progress * 100);
                    console.log('Setting progress to:', percentage + '%');
                    progressBar.style.width = percentage + '%';
                    progressBar.setAttribute('aria-valuenow', percentage);
                    progressBar.textContent = percentage + '%';
                } else {
                    console.warn('Progress bar element not found');
                }
            };

            const pdfFilesForPython = this.pdfFiles.map(file => ({
                name: file.name,
                data: Array.from(file.data) 
            }));
            
            this.examReader = this.ExamReader(pdfFilesForPython, scanOptions);
            const success = await this.examReader.process(progressCallback);
            
            if (success) {
                // Convert Python bytes to JavaScript Uint8Array
                const zipBytesProxy = this.examReader.get_zip_bytes();
                const zipBytes = new Uint8Array(zipBytesProxy.toJs());
                zipBytesProxy.destroy(); // Clean up proxy
                
                this.downloadFile(zipBytes, 'scan-results.zip', 'application/zip');

                const summaryElement = document.getElementById("download-results-btn");
                summaryElement.addEventListener('click', 
                    () => {
                        const summaryBytesProxy = this.examReader.get_summary_bytes();
                        const summaryBytes = new Uint8Array(summaryBytesProxy.toJs());
                        summaryBytesProxy.destroy(); // Clean up proxy
                        
                        this.downloadFile(summaryBytes, 'Zusammenfassung.pdf', 'application/pdf');  
                });
                
                this.showStatus('PDF scan completed successfully!', 'success');
            } else {
                this.showStatus('PDF scan failed', 'error');
            }
            
        } catch (error) {
            this.showStatus(`Error scanning PDFs: ${error.message}, ${error.stack}`, 'error');
        }
    }
    
    // Utility methods
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
    
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
    
    downloadFile(data, filename, mimeType) {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    showStatus(message, type = 'info', duration = 10000) {
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // Create or get the status container
        let statusContainer = document.getElementById('status-container');
        if (!statusContainer) {
            statusContainer = document.createElement('div');
            statusContainer.id = 'status-container';
            document.body.appendChild(statusContainer);
        }
        
        // Create the new status message
        const statusDiv = document.createElement('div');
        statusDiv.className = `status-message ${type}`;
        statusDiv.textContent = message;
        
        // Add close button
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '×';
        closeBtn.classList.add('close-btn');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeStatusMessage(statusDiv);
        });
        
        statusDiv.appendChild(closeBtn);
        
        // Add click to dismiss
        statusDiv.addEventListener('click', () => {
            this.removeStatusMessage(statusDiv);
        });
        
        // Add to container (at the bottom)
        statusContainer.appendChild(statusDiv);
        
        // Animate in
        setTimeout(() => {
            statusDiv.style.transform = 'translateX(0)';
            statusDiv.style.opacity = '1';
        }, 50);
        
        // Auto-remove after specified duration (if duration > 0)
        if (duration > 0) {
            setTimeout(() => {
                this.removeStatusMessage(statusDiv);
            }, duration);
        }
        
        return statusDiv; // Return reference for manual removal if needed
    }
    
    removeStatusMessage(statusDiv) {
        if (!statusDiv || !statusDiv.parentNode) return;
        
        // Animate out
        statusDiv.style.transform = 'translateX(100%)';
        statusDiv.style.opacity = '0';
        
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
                
                // Remove container if empty
                const statusContainer = document.getElementById('status-container');
                if (statusContainer && statusContainer.children.length === 0) {
                    statusContainer.remove();
                }
            }
        }, 300);
    }
    
    clearAllStatusMessages() {
        const statusContainer = document.getElementById('status-container');
        if (statusContainer) {
            // Animate out all messages
            Array.from(statusContainer.children).forEach(child => {
                this.removeStatusMessage(child);
            });
        }
    }
    
    runPython(code) {
        if (!this.pyodide) {
            console.error('Pyodide not loaded yet');
            return null;
        }
        
        try {
            return this.pyodide.runPython(code);
        } catch (error) {
            console.error('Error running Python code:', error);
            this.showStatus(`Python error: ${error.message}`, 'error');
            return null;
        }
    }
}



// Navigation functions
function showQRGeneration() {
    const mainPage = document.getElementById('main-page');
    const qrPage = document.getElementById('qr-generation-page');
    
    if (mainPage && qrPage) {
        mainPage.classList.add('hidden');
        qrPage.classList.remove('hidden');
    }
}

function showPDFScan() {
    const mainPage = document.getElementById('main-page');
    const scanPage = document.getElementById('pdf-scan-page');
    
    if (mainPage && scanPage) {
        mainPage.classList.add('hidden');
        scanPage.classList.remove('hidden');
    }
}

function showMainPage() {
    const mainPage = document.getElementById('main-page');
    const qrPage = document.getElementById('qr-generation-page');
    const scanPage = document.getElementById('pdf-scan-page');
    
    if (mainPage) {
        mainPage.classList.remove('hidden');
    }
    if (qrPage) {
        qrPage.classList.add('hidden');
    }
    if (scanPage) {
        scanPage.classList.add('hidden');
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