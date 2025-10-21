// app.js - DiRueLei Web Application

class DiRueLeiApp {
    constructor() {
        this.loadingElement = document.getElementById('loading');
        this.mainAppElement = document.getElementById('main-app');
        this.progressBar = document.getElementById('progress-bar');
        this.loadingStatus = document.getElementById('loading-status');
        
        // Application state
        this.pdfFiles = [];
        this.csvContent = null;
        this.csvFilename = null;
        this.allStudents = [];
        
        // Web Worker for all Python operations
        this.scanWorker = null;
        this.workerInitialized = false;
        
        // Simple progress tracking
        this.totalSteps = 2;
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
            this.updateProgress('Initialisiere Anwendung...');
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.updateProgress('Starte Web Worker...');
            
            // Initialize the scan worker (this loads Pyodide in background)
            this.initializeScanWorker();
            
            // Hide loading screen and show main app immediately
            this.loadingElement.style.display = 'none';
            this.mainAppElement.classList.remove('hidden');
            
            this.showStatus('Anwendung geladen! Python-Umgebung wird im Hintergrund initialisiert...', 'success', 3000);
            
        } catch (error) {
            console.error('Anwendung konnte nicht initialisiert werden.', error);
            this.showStatus(`Anwendung konnte nicht geladen werden. Fehlermeldung: ${error.message}`, 'error');
        }
    }
    

    initializeScanWorker() {
        if (this.scanWorker) {
            return;
        }
        
        console.log('Initializing scan worker...');
        this.scanWorker = new Worker('scan-worker.js');
        
        this.scanWorker.onmessage = (event) => {
            this.handleWorkerMessage(event.data);
        };
        
        this.scanWorker.onerror = (error) => {
            console.error('Worker error:', error);
            this.showStatus(`Worker error: ${error.message}`, 'error');
        };
        
        this.showStatus('Initializiere Anwendung...', 'info');
        this.scanWorker.postMessage({ type: 'INIT' });
    }
    
    handleWorkerMessage(data) {
        switch (data.type) {
            case 'READY':
                console.log('Application loaded.');
                break;
                
            case 'INITIALIZED':
                this.workerInitialized = true;
                console.log('Scan worker ready', 'success');
                this.showStatus('Pakete vollständig geladen.', 'success'); 
                while (document.getElementsByClassName("init-progress").length > 0) {
                    document.getElementsByClassName("init-progress")[0].remove();
                }
                break;
                
            case 'INIT_PROGRESS':
                console.log(`Loading package ${data.current}/${data.total}: ${data.package}`);
                this.showStatus(`Lade ${data.package} (Paket ${data.current}/${data.total})...`, 'init-progress');
                break;
                
            case 'SCAN_PROGRESS':
                this.updateScanProgress(data.percentage);
                break;
                
            case 'LOG':
                console.log(data.message);
                // fall-through
        
            case 'SCAN_LOG':
                this.handleWorkerLog(data.message, data.level);
                break;
                
            case 'QR_COMPLETE':
                this.handleQRComplete(data);
                break;
                
            case 'SCAN_COMPLETE':
                this.handleScanComplete(data);
                break;
                
            case 'ERROR':
                this.showStatus(data.message, 'error');
                console.error('Worker error:', data.message);
                break;
                
            default:
                console.warn('Unknown worker message type:', data.type);
        }
    }
    
    updateScanProgress(percentage) {
        const progressBar = document.getElementById('scan-progress-bar');
        if (progressBar) {
            const percent = Math.round(percentage * 100);
            progressBar.style.width = percent + '%';
            progressBar.textContent = percent + '%';
            progressBar.setAttribute('aria-valuenow', percent);
        }
    }
    
    handleWorkerLog(message, level) {
        // Add log message to the output area
        const outputDiv = document.getElementById('scan-output');
        if (outputDiv) {
            const msgElement = document.createElement('div');
            msgElement.classList.add('status-output');
            msgElement.classList.add(level);
            msgElement.innerText = message;
            outputDiv.appendChild(msgElement);
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
    }
    
    handleScanComplete(data) {
        try {
            // Download the ZIP file
            this.downloadFile(data.zipBytes, 'scan-results.zip', 'application/zip');
            
            // Setup summary download button
            const summaryElement = document.getElementById("download-results-btn");
            if (summaryElement) {
                // Remove old listeners by cloning the element
                const newSummaryElement = summaryElement.cloneNode(true);
                summaryElement.parentNode.replaceChild(newSummaryElement, summaryElement);
                
                // Store summary bytes for download
                this.summaryBytes = data.summaryBytes;
                
                newSummaryElement.addEventListener('click', () => {
                    this.downloadFile(this.summaryBytes, 'Zusammenfassung.pdf', 'application/pdf');
                });
            }
            
            this.showStatus('PDF scan completed successfully!', 'success');
        } catch (error) {
            this.showStatus(`Error handling scan results: ${error.message}`, 'error');
        }
    }
    
    handleQRComplete(data) {
        try {
            // Download the generated QR PDF
            this.downloadFile(data.pdfBytes, data.filename, 'application/pdf');
            this.showStatus('QR-Codes erfolgreich erzeugt!', 'success');
        } catch (error) {
            this.showStatus(`Fehler beim Verarbeiten der QR-Codes: ${error.message}`, 'error');
        }
    }
    
    setupEventListeners() {
        const listeners = [
            {'id': 'open-instructions-btn', 'func': this.openInstructions, 'event': 'click'},
            {'id': 'csv-file', 'func': this.handleCsvFileUpload, 'event': 'change'},
            {'id': 'generate-qr-btn', 'func': this.generateQRPdf, 'event': 'click'},
            {'id': 'pdf-files', 'func': this.handlePdfFilesUpload, 'event': 'change'},
            {'id': 'clear-pdf-files-btn', 'func': this.clearPdfFiles, 'event': 'click'},
            {'id': 'process-pdf-btn', 'func': this.startPdfScan, 'event': 'click'},
            {'id': 'checkbox-use-offset', 'func': this.toggleOffset, 'event': 'change'},
            {'id': 'checkbox-select-students', 'func': this.toggleSelectStudents, 'event': 'change'},
            {'id': 'select-all', 'func': this.toggleSelectAll, 'event': 'change'}
            
        ];

        for (const listener of listeners) {
            document.getElementById(listener.id).addEventListener(listener.event, listener.func.bind(this));
        }
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
                // For PDFs, we want to append, not replace
                pdfFileInput.files = files;
                pdfFileInput.dispatchEvent(new Event('change', { detail: { append: true } }));
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
            return this.allStudents || [];
        }
        
        // Filter by selected checkboxes
        const selectedStudents = [];
        
        const studentCheckboxes = document.querySelectorAll('#student-checkboxes input[type="checkbox"]');
        studentCheckboxes.forEach((checkbox, index) => {
            if (checkbox.checked && index < this.allStudents.length) {
                selectedStudents.push(this.allStudents[index]);
            }
        });
        
        return selectedStudents;
    }
    
    async handleCsvFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const csvData = await this.readFileAsText(file);
            this.csvContent = csvData;
            this.csvFilename = file.name;
            this.allStudents = this.parseCSV(csvData);
            
            document.getElementById('generate-qr-btn').disabled = false;
            document.getElementById('qr-settings').classList.remove('hidden');
            
            this.showStatus(`Daten für ${this.allStudents.length} Schüler-/innen eingelesen.`, 'success');
            this.populateStudentCheckboxes(this.allStudents);
            
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
    
    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) 
            return [];
        
        const students = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            students.push({
                id: values[0] || '',      
                name: String(values[1]).replaceAll('"', '') || ''      
            });
        }
        return students;
    }
    
    populateStudentCheckboxes(students) {
        const studentCheckboxesContainer = document.getElementById('student-checkboxes');
        
        studentCheckboxesContainer.innerHTML = '';
        
        students.forEach((student, index) => {
            const checkboxWrapper = document.createElement('label');
            checkboxWrapper.className = 'student-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = index;
            
            const studentName = student.name || student.Name || student['Vollständiger Name'] || student.nachname || student.Nachname || `Schüler ${index + 1}`;
            
            checkboxWrapper.appendChild(checkbox);
            checkboxWrapper.appendChild(document.createTextNode(` ${studentName}`));
            
            studentCheckboxesContainer.appendChild(checkboxWrapper);
        });
    }
    
    async generateQRPdf() {
        if (!this.csvContent) {
            this.showStatus('Noch keine CSV-Datei ausgewählt.', 'error');
            return;
        }
        
        // Initialize worker if not already done
        if (!this.scanWorker) {
            this.initializeScanWorker();
        }
        
        // Wait for worker to be ready
        if (!this.workerInitialized) {
            this.showStatus('Warten auf Worker-Initialisierung...', 'info');
            // Set up a one-time listener to retry when worker is ready
            const checkReady = setInterval(() => {
                if (this.workerInitialized) {
                    clearInterval(checkReady);
                    this.generateQRPdf(); // Retry
                }
            }, 100);
            return;
        }
        
        try {
            this.showStatus('Erzeuge PDF mit QR-Codes...', 'info');
            
            const selectedStudents = this.getSelectedStudents();
            
            if (selectedStudents.length === 0) {
                this.showStatus('Bitte wählen Sie mindestens einen Schüler aus', 'error');
                return;
            }
            
            const copies = parseInt(document.getElementById('copies').value) || 1;
            const offsetRow = parseInt(document.getElementById('offset-row').value) || 1;
            const offsetCol = parseInt(document.getElementById('offset-col').value) || 1;
            
            // Send QR generation request to worker
            this.scanWorker.postMessage({
                type: 'GENERATE_QR',
                data: {
                    csvContent: this.csvContent,
                    copies: copies,
                    offsetRow: offsetRow,
                    offsetCol: offsetCol,
                    selectedStudents: selectedStudents,
                    csvFilename: this.csvFilename
                }
            });
            
        } catch (error) {
            console.error('PDF generation error:', error);
            this.showStatus(`Fehler beim Erzeugen der PDF-Datei: ${error.message}`, 'error');
        }
    }
    
    async handlePdfFilesUpload(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;
        
        try {
            // Initialize pdfFiles array if it doesn't exist
            if (!this.pdfFiles) {
                this.pdfFiles = [];
            }
            
            // Add new files to existing ones instead of replacing
            for (const file of files) {
                // Check if file already exists
                const exists = this.pdfFiles.some(f => f.name === file.name);
                if (!exists) {
                    const arrayBuffer = await this.readFileAsArrayBuffer(file);
                    this.pdfFiles.push({
                        name: file.name,
                        data: new Uint8Array(arrayBuffer)
                    });
                }
            }
            
            // Update the display
            this.updatePdfFileList();
            document.getElementById('scan-settings')?.classList.remove('hidden');
            
        } catch (error) {
            this.showStatus(`Error reading PDF files: ${error.message}`, 'error');
        }
    }
    
    updatePdfFileList() {
        const dropzone = document.getElementById('pdf-dropzone');
        if (dropzone && this.pdfFiles.length > 0) {
            dropzone.classList.add('has-files');
            const fileNames = this.pdfFiles.map(f => f.name).join(', ');
            const primaryText = dropzone.querySelector('.upload-primary');
            const secondaryText = dropzone.querySelector('.upload-secondary');
            
            if (primaryText && secondaryText) {
                primaryText.textContent = `${this.pdfFiles.length} Datei(en) ausgewählt`;
                secondaryText.textContent = fileNames.length > 80 ? fileNames.substring(0, 80) + '...' : fileNames;
            }
            
            // Show the clear button
            const clearBtn = document.getElementById('clear-pdf-files-btn');
            if (clearBtn) {
                clearBtn.classList.remove('hidden');
            }
        }
    }
    
    clearPdfFiles() {
        this.pdfFiles = [];
        const dropzone = document.getElementById('pdf-dropzone');
        const fileInput = document.getElementById('pdf-files');
        
        if (dropzone) {
            dropzone.classList.remove('has-files');
            this.resetDropzoneText(dropzone);
        }
        
        if (fileInput) {
            fileInput.value = '';
        }
        
        // Hide the clear button
        const clearBtn = document.getElementById('clear-pdf-files-btn');
        if (clearBtn) {
            clearBtn.classList.add('hidden');
        }
        
        this.showStatus('Alle PDF-Dateien entfernt', 'info');
    }
    
    async startPdfScan() {
        if (!this.pdfFiles.length) {
            this.showStatus('Bitte laden Sie zuerst PDF-Dateien hoch', 'error');
            return;
        }
        
        // Initialize worker if not already done
        if (!this.scanWorker) {
            this.initializeScanWorker();
        }
        
        // Wait for worker to be ready
        if (!this.workerInitialized) {
            this.showStatus('Warten auf Worker-Initialisierung...', 'info');
            // Set up a listener to start scan when worker is ready
            const originalHandler = this.handleWorkerMessage.bind(this);
            this.handleWorkerMessage = (data) => {
                originalHandler(data);
                if (data.type === 'INITIALIZED') {
                    this.startPdfScan(); // Retry scan
                }
            };
            return;
        }
        
        this.showStatus('Scanne PDF...', 'info');
        
        try {
            // Reset progress bar
            const progressBar = document.getElementById('scan-progress-bar');
            if (progressBar) {
                progressBar.style.width = '0%';
                progressBar.textContent = '0%';
                progressBar.setAttribute('aria-valuenow', 0);
            }
            
            // Clear output area
            const outputDiv = document.getElementById('scan-output');
            if (outputDiv) {
                outputDiv.innerHTML = '';
            }
            
            // Get scan options
            const scanOptions = {
                twoPageScan: document.getElementById('two-page-scan')?.checked || false,
                splitA3: document.getElementById('split-a3')?.checked || false,
                quickAndDirty: document.getElementById('quick-and-dirty')?.checked || false
            };
            
            // Prepare PDF files for transfer to worker
            // Use Transferable objects for efficiency (transfers ownership, no copy)
            const transferList = [];
            const pdfFilesForWorker = this.pdfFiles.map(file => {
                const buffer = file.data.buffer;
                transferList.push(buffer);
                return {
                    name: file.name,
                    data: file.data
                };
            });
            
            // Send scan request to worker
            this.scanWorker.postMessage({
                type: 'SCAN_START',
                data: {
                    pdfFiles: pdfFilesForWorker,
                    options: scanOptions
                }
            }, transferList);
            
            // Note: After transfer, this.pdfFiles data will be empty (transferred to worker)
            // We'll need to reload if user wants to scan again
            
        } catch (error) {
            this.showStatus(`Fehler beim Scannen der PDFs: ${error.message}`, 'error');
            console.error('Scan error:', error);
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

        const initStatus = document.getElementsByClassName("init-progress")[0];
        if (type == "init-progress" && initStatus) {
            initStatus.textContent = message;
            return;
        }
        
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
        if (duration > 0 && type != "init-progress") {
            setTimeout(() => {
                this.removeStatusMessage(statusDiv);
            }, duration);
        }
        
        return statusDiv; 
    }
    
    removeStatusMessage(statusDiv) {
        if (!statusDiv || !statusDiv.parentNode) 
            return;
        
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
        document.getElementById("pdf-files").files = null;
        const outputDiv = document.getElementById("output-area")
        while (outputDiv.firstChild) {
            outputDiv.firstChild.remove();
        }
    }
}

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new DiRueLeiApp();
    app.init();
});

window.diRueLeiApp = app;