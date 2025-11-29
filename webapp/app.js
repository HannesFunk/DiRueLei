// app.js - DiRueLei Web Application

class DiRueLeiApp {
    constructor() {
        this.loadingElement = document.getElementById('loading');
        this.mainAppElement = document.getElementById('main-app');
        
        // Application state
        this.pdfFiles = [];
        this.allStudents = [];
        this.className = "";
        
        // Web Worker for all Python operations
        this.scanWorker = null;
        this.workerInitialized = false;
    }
    
    async init() {
        try {
            document.querySelector('.version').textContent = `v${APP_VERSION}`;
            this.setupEventListeners();
            this.initializeScanWorker();
            
            this.showStatus('Einiges wird noch im Hintergrund geladen.', 'init-progress');
            
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
        this.scanWorker = new Worker('scan-worker.js?v=' + APP_VERSION_NUM);
        
        this.scanWorker.onmessage = (event) => {
            this.handleWorkerMessage(event.data);
        };
        
        this.scanWorker.onerror = (error) => {
            console.error('Worker error:', error);
            this.showStatus(`Worker-Fehler: ${error.message}`, 'error');
        };
        
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
                this.showStatus('Anwendung vollständig geladen.', 'success'); 
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
                
            case 'SCAN_LOG':
                this.handleScanLog(data.message, data.level);
                // fall-through

            case 'LOG':
                console.log(data.message);
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
    
    handleScanLog(message, level) {
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
            this.downloadFile(data.zipBytes, 'scan-results.zip', 'application/zip');
            
            const summaryElement = document.getElementById("download-results-btn");
            if (summaryElement) {
                const newSummaryElement = summaryElement.cloneNode(true);
                summaryElement.parentNode.replaceChild(newSummaryElement, summaryElement);
                
                this.summaryBytes = data.summaryBytes;
                
                newSummaryElement.addEventListener('click', () => {
                    this.openPdfInNewTab(this.summaryBytes, 'Zusammenfassung.pdf');
                });
            }
            
            this.showStatus('PDF Scan erfolgreich!', 'success');
        } catch (error) {
            this.showStatus(`Fehler: ${error.message}`, 'error');
        }
    }
    
    handleQRComplete(data) {
        const filename = `QR-Codes${this.className}.pdf`;
        try {
            this.downloadFile(data.pdfBytes, filename, 'application/pdf');
            this.showStatus('QR-Codes erfolgreich erzeugt!', 'success');
        } catch (error) {
            this.showStatus(`Fehler beim Verarbeiten der QR-Codes: ${error.message}`, 'error');
        }
    }
    
    setupEventListeners() {
        const listeners = [
            {'id': 'open-instructions-btn', 'func': this.openInstructions, 'event': 'click'},
            {'id': 'csv-files', 'func': this.handleCsvFileUpload, 'event': 'change'},
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
        const csvFileInput = document.getElementById('csv-files');
        
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
        
        if (!selectStudentsCheckbox.checked) {
            return this.allStudents || [];
        }
        
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
            this.className = this.guessClassFromFilename(file.name);
            let students = this.parseCSV(csvData);
            students.sort((a, b) => {
                const getLastName = (student) => {
                    const parts = student.name.split(' ');
                    return parts[parts.length -1]
                }

                return getLastName(a).localeCompare(getLastName(b));
            });

            this.allStudents = students;
            
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
        if (!this.scanWorker) {
            this.initializeScanWorker();
        }
        
        // Wait for worker to be ready
        if (!this.workerInitialized) {
            this.showStatus('Warten auf vollständiges Laden der Anwendung.', 'info');
            const checkReady = setInterval(() => {
                if (this.workerInitialized) {
                    clearInterval(checkReady);
                    this.generateQRPdf(); // Retry
                }
            }, 100);
            return;
        }
        
        try {
            if (!this.allStudents || this.allStudents.length === 0) {
                this.showStatus('Noch keine Schülerdaten erfasst. Bitte zuerst CSV-Datei auswählen.', 'error');
                return;
            }

            const selectedStudents = this.getSelectedStudents();
            if (selectedStudents.length === 0) {
                this.showStatus('Bitte mindestens einen Schüler auswählen.', 'error');
                return;
            }
            
            const copies = parseInt(document.getElementById('copies').value) || 1;
            const offsetRow = parseInt(document.getElementById('offset-row').value) || 1;
            const offsetCol = parseInt(document.getElementById('offset-col').value) || 1;
            
            this.showStatus('Erzeuge PDF mit QR-Codes...', 'info');
            this.scanWorker.postMessage({
                type: 'GENERATE_QR',
                data: {
                    copies: copies,
                    offsetRow: offsetRow,
                    offsetCol: offsetCol,
                    selectedStudents: selectedStudents,
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
    
    clearFiles(extension) {
        if (extension != 'pdf' && extension != 'csv')
            return;

        const dropzone = document.getElementById(extension + '-dropzone');
        const fileInput = document.getElementById(extension + '-files');
        
        if (dropzone) {
            dropzone.classList.remove('has-files');
            this.resetDropzoneText(dropzone);
        }
        
        if (fileInput) {
            fileInput.value = '';
        }
        
        if (extension == 'pdf') {
            this.pdfFiles = [];
            document.getElementById('clear-pdf-files-btn')?.classList.add('hidden');
        }
    }

    clearPdfFiles() {
        this.clearFiles('pdf');
    }

    guessClassFromFilename(fileName) {
        const classPattern = /_\d{1,2}[a-z]_/;
        const match = fileName.match(classPattern);
        
        if (match === null) {
            return "";
        } else {
            return "_" + match[0].replace(/_/g, "");
        }
    }
    
    async startPdfScan() {
        if (!this.pdfFiles.length) {
            this.showStatus('Bitte laden Sie zuerst PDF-Dateien hoch', 'error');
            return;
        }
        
        if (!this.scanWorker) {
            this.initializeScanWorker();
        }
        
        if (!this.workerInitialized) {
            this.showStatus('Warten auf Worker-Initialisierung...', 'info');
            
            const originalHandler = this.handleWorkerMessage.bind(this);
            this.handleWorkerMessage = (data) => {
                originalHandler(data);
                if (data.type === 'INITIALIZED') {
                    this.startPdfScan(); // Retry scan
                }
            };
            return;
        }
        
        try {
            const progressBar = document.getElementById('scan-progress-bar');
            if (progressBar) {
                progressBar.classList.remove("hidden");
                progressBar.style.width = '0%';
                progressBar.textContent = '0%';
                progressBar.setAttribute('aria-valuenow', 0);
            }
            
            const outputDiv = document.getElementById('scan-output');
            if (outputDiv) {
                outputDiv.innerHTML = '';
                outputDiv.classList.remove("hidden");
            }
            
            const scanOptions = {
                twoPageScan: document.getElementById('two-page-scan')?.checked || false,
                splitA3: document.getElementById('split-a3')?.checked || false,
                quickAndDirty: document.getElementById('quick-and-dirty')?.checked || false
            };
            
            const pdfFilesForWorker = this.pdfFiles.map(file => ({
                name: file.name,
                data: new Uint8Array(file.data) // Create a copy
            }));
            
            this.scanWorker.postMessage({
                type: 'SCAN_START',
                data: {
                    pdfFiles: pdfFilesForWorker,
                    options: scanOptions
                }
            });
            
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
    
    openPdfInNewTab(data, filename) {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        
        if (newWindow) {
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 1000);
        } else {
            this.showStatus('Popup blocked! Downloading PDF instead...', 'warning');
            this.downloadFile(data, filename, 'application/pdf');
            URL.revokeObjectURL(url);
        }
    }
    
    showStatus(message, type = 'info', duration = 7000) {
        console.log(`${type.toUpperCase()}: ${message}`);

        const initStatus = document.getElementsByClassName("init-progress")[0];
        if (type == "init-progress" && initStatus) {
            initStatus.textContent = message;
            return;
        }
        
        let statusContainer = document.getElementById('status-container');
        if (!statusContainer) {
            statusContainer = document.createElement('div');
            statusContainer.id = 'status-container';
            document.body.appendChild(statusContainer);
        }
        
        const statusDiv = document.createElement('div');
        statusDiv.className = `status-message ${type}`;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = 'status-text';
        if (message.length > 200) {
            let tempMessage = message.replaceAll("\n", "");
            messageSpan.innerText = tempMessage.substring(0,209) + "[...]";
        } else {
            messageSpan.innerText = message;
        }
        statusDiv.appendChild(messageSpan);
        
        if (type === 'error') {
            duration = 15000;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '📋';
            copyBtn.title = 'Fehlermeldung kopieren';
            copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(message).then(() => {
                    copyBtn.innerHTML = '✓';
                    copyBtn.title = 'Kopiert!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '📋';
                        copyBtn.title = 'Fehlermeldung kopieren';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            });
            statusDiv.appendChild(copyBtn);
        }
        
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '×';
        closeBtn.classList.add('close-btn');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeStatusMessage(statusDiv);
        });
        
        statusDiv.appendChild(closeBtn);
        
        statusDiv.addEventListener('click', () => {
            this.removeStatusMessage(statusDiv);
        });
        
        statusContainer.appendChild(statusDiv);
        
        setTimeout(() => {
            statusDiv.style.transform = 'translateX(0)';
            statusDiv.style.opacity = '1';
        }, 50);
        
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
        app.clearFiles('csv');
        const checkBoxes = document.getElementById("student-checkboxes");
        if (checkBoxes) {
            checkBoxes.innerHTML = '';
        }
        app.allStudents = null;
    }
    if (scanPage) {
        scanPage.classList.add('hidden');
        app.clearFiles('pdf');
        const outputDiv = document.getElementById("scan-output")
        while (outputDiv.firstChild) {
            outputDiv.firstChild.remove();
        }
    }
}

let app;

// Function to update footer with deployment timestamp
async function updateFooterTimestamp() {
    try {
        // Fetch the current page to get Last-Modified header
        const response = await fetch(window.location.href, { method: 'HEAD' });
        const lastModified = response.headers.get('Last-Modified');
        
        if (lastModified) {
            const date = new Date(lastModified);
            const formatted = date.toLocaleString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const versionElement = document.querySelector('.upload-time');
            if (versionElement) {
                versionElement.innerHTML = ` vom ${formatted} `;
            }
        }
    } catch (error) {
        console.log('Could not fetch deployment timestamp:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    app = new DiRueLeiApp();
    app.init();
    updateFooterTimestamp();
});

window.diRueLeiApp = app;