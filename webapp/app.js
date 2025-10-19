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
        this.WebLogger = null;
        
        // Package configuration
        this.availablePackages = [
            'numpy',
            'pillow',
            'opencv-python'
        ];
        
        this.micropipPackages = [
            'qrcode',
        ];
        
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
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.0/full/",
            });
            this.pyodide.setDebug(true);
            
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
            
            this.updateProgress('Loading Python modules...');
            
            // Load our custom Python modules
            await this.loadPythonModules();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Hide loading screen and show main app
            this.loadingElement.style.display = 'none';
            this.mainAppElement.classList.remove('hidden');
            
            this.showMessage('Application loaded successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to initialize Pyodide:', error);
            this.showMessage(`Failed to load application: ${error.message}`, 'error');
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
                path: './python_modules/exam_reader.py'
            }
        ];
        
        // Load all Python modules
        const results = await moduleLoader.loadAllModules(moduleConfig);
        
        if (results.failed.length > 0) {
            console.warn('Some Python modules failed to load:', results.failed);
            this.showMessage(`Warning: ${results.failed.length} Python modules failed to load`, 'error');
        }
        
        // Get references to the Python classes
        this.QRGenerator = this.pyodide.globals.get('QRGenerator');
        this.ExamReader = this.pyodide.globals.get('ExamReader');
        this.WebLogger = this.pyodide.globals.get('WebLogger');
        
        console.log(`Successfully loaded ${results.successful.length} Python modules:`, results.successful);
    }
    
    setupEventListeners() {
        const listeners = [
            {'id': 'open-instructions-btn', 'func': this.openInstructions, 'event': 'click'},
            {'id': 'csv-file', 'func': this.handleCsvFileUpload, 'event': 'change'},
            {'id': 'generate-qr-btn', 'func': this.generateQRPdf, 'event': 'click'},
            {'id': 'pdf-files', 'func': this.handlePdfFilesUpload, 'event': 'click'},
            {'id': 'process-pdf-btn', 'func': this.startPdfScan, 'event': 'click'},
            {'id': 'checkbox-use-offset', 'func': this.toggleOffset, 'event': 'change'},
            {'id': 'checkbox-select-students', 'func': this.toggleSelectStudents, 'event': 'change'},
            {'id': 'select-all', 'func': this.toggleSelectAll, 'event': 'change'},
        ];

        for (const listener of listeners) {
            document.getElementById(listener.id).addEventListener(listener.event, listener.func.bind(this));
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
                window.diRueLeiApp.showMessage('Die Anleitung konnte nicht im Browser geöffnet werden.', 'error');
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
            this.downloadFile(pdfData, 'qr-codes.pdf', 'application/pdf');
            
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
        
        try {
            this.showStatus('Scanning PDF files...', 'info');
            
            // Get scan options
            const scanOptions = {
                split_a3: document.getElementById('split-a3').checked,
                two_page_scan: document.getElementById('two-page-scan').checked,
                quick_and_dirty: document.getElementById('quick-dirty').checked
            };
            
            // Create logger and progress callback
            const logger = this.WebLogger();
            const progressCallback = (progress) => {
                console.log(`Scan progress: ${(progress * 100).toFixed(1)}%`);
            };
            
            // Create exam reader
            this.examReader = this.ExamReader(scanOptions, logger, progressCallback);
            
            // Process PDF files
            const success = this.examReader.process_pdf_files(this.pdfFiles);
            
            if (success) {
                // Create and download zip file
                const zipBytes = this.examReader.create_zip_file();
                this.downloadFile(zipBytes, 'scan-results.zip', 'application/zip');
                
                // Display summary
                const summary = this.examReader.get_summary();
                this.displayScanSummary(summary);
                
                this.showStatus('PDF scan completed successfully!', 'success');
            } else {
                this.showStatus('PDF scan failed', 'error');
            }
            
        } catch (error) {
            this.showStatus(`Error scanning PDFs: ${error.message}`, 'error');
        }
    }
    
    displayScanSummary(summary) {
        // Create summary display
        const summaryHtml = `
            <div class="status-box">
                <h4>Scan Results</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #ddd; padding: 8px;">Student</th>
                            <th style="border: 1px solid #ddd; padding: 8px;">Pages</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${summary.map(item => `
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 8px;">${item['Schüler/-in']}</td>
                                <td style="border: 1px solid #ddd; padding: 8px;">${item['Anzahl Seiten']}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        // Try to find scan output area, or create one
        let outputArea = document.getElementById('scan-output');
        if (!outputArea) {
            // If no scan-output element, try to find the scan settings area
            const scanSettings = document.getElementById('scan-settings');
            if (scanSettings) {
                outputArea = document.createElement('div');
                outputArea.id = 'scan-output';
                outputArea.className = 'output-area';
                scanSettings.appendChild(outputArea);
            }
        }
        
        if (outputArea) {
            outputArea.innerHTML = summaryHtml;
        } else {
            // Fallback: show in a status message
            this.showStatus(`Scan completed: ${summary.length} students processed`, 'success');
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
    
    showStatus(message, type = 'info', duration = 5000) {
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
    
    showMessage(message, type = 'info') {
        this.showStatus(message, type);
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