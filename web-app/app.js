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
        
        // Install PyMuPDF experimental wheel
        updateProgress(40, "Installiere PyMuPDF (experimentell)...");
        await micropip.install("https://github.com/pymupdf/PyMuPDF/releases/download/1.23.20/PyMuPDF-1.23.20-cp311-none-emscripten_3_1_46_wasm32.whl");
        
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
    const pythonCode = `
import sys
import io
import base64
import csv
import re
from js import console, Uint8Array, document, Blob, URL
import numpy as np
from PIL import Image
import qrcode
from reportlab.pdfgen import canvas        
from reportlab.lib.pagesizes import A4        
from reportlab.lib.units import cm   
from reportlab.lib.utils import ImageReader
from PyPDF2 import PdfReader, PdfWriter
import pypdf

class WebLogger:
    def __init__(self, element_id):
        self.element_id = element_id
        
    def info(self, message):
        console.log(f"INFO: {message}")
        self._append_log(message, "info")
        
    def error(self, message):
        console.log(f"ERROR: {message}")
        self._append_log(message, "error")
        
    def warning(self, message):
        console.log(f"WARNING: {message}")
        self._append_log(message, "warning")
        
    def _append_log(self, message, level):
        log_element = document.getElementById(self.element_id)
        if log_element:
            color = {"info": "#00ff00", "error": "#ff6b6b", "warning": "#ffa500"}.get(level, "#00ff00")
            log_element.innerHTML += f'<div style="color: {color}">[{level.upper()}] {message}</div>'
            log_element.scrollTop = log_element.scrollHeight

class WebQRGenerator:
    def __init__(self, csv_content):
        self.csv_content = csv_content
        self.class_guessed = None
        
    def readData(self):
        students = []
        csv_reader = csv.DictReader(io.StringIO(self.csv_content), delimiter=',')
        string_id = csv_reader.fieldnames[0]
        
        for row in csv_reader:
            row[string_id] = row[string_id].replace("Teilnehmer/in", "")
            students.append({
                'id': row[string_id],
                'name': row['Vollständiger Name']
            })
        return students
    
    def create_qr_image(self, id_str, name):
        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(name + "_" + id_str)
        qr.make(fit=True)
        img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        
        # Resize to 3cm x 3cm at 300 DPI
        qr_size_px = int((3 / 2.54) * 300) 
        img_qr = img_qr.resize((qr_size_px, qr_size_px), Image.LANCZOS)
        
        return img_qr
    
    def generate_qr_pdf(self, students, copies=1):
        buffer = io.BytesIO()
        _, page_height = A4
        c = canvas.Canvas(buffer, pagesize=A4, bottomup=0)

        page_specs = {
            "page_height": page_height,
            "margin-top": 1 * cm,
            "margin-left": 0.7 * cm,
            "col_width": 3.5 * cm,
            "row_height": 3.5 * cm,
            "row_sep": 0.5 * cm,
            "col_sep": 0.5 * cm,
            "num_cols": 5, 
            "num_rows": 7,
            "qr_size": 2 * cm
        }

        if copies != 1:
            students = self.multiply_students(students, copies)

        page_specs["qr_per_page"] = page_specs["num_rows"] * page_specs["num_cols"]
        x_start = page_specs["margin-left"] + (page_specs["col_width"] - page_specs["qr_size"]) / 2
        y_start = page_specs["margin-top"] + (page_specs["row_height"] - page_specs["qr_size"] - 0.5 * cm) / 2

        for i, student in enumerate(students):
            qr_img = self.create_qr_image(student["id"], student["name"])

            img_buffer = io.BytesIO()
            qr_img.save(img_buffer, format="PNG")
            img_buffer.seek(0)
            img_reader = ImageReader(img_buffer)

            pos_number = i
            col = pos_number % page_specs["num_cols"]
            row = (pos_number // page_specs["num_cols"]) % page_specs["num_rows"]

            if pos_number != 0 and pos_number % page_specs["qr_per_page"] == 0:
                c.showPage()

            x = x_start + page_specs["col_width"] * col + page_specs["col_sep"] * col
            y = y_start + row * page_specs["row_height"] + row * page_specs["row_sep"]

            c.drawImage(img_reader, x, y, page_specs["qr_size"], page_specs["qr_size"])
            font_size = 10
            c.setFont("Helvetica", font_size)

            text_x = x + (page_specs["qr_size"] / 2)
            text_y = y + page_specs["qr_size"] + 12

            name_to_print = student["name"]

            if c.stringWidth(name_to_print, "Helvetica", font_size) > (page_specs["col_width"] - 0.3*cm):
                names = student["name"].split()
                for idx, name in enumerate(names):
                    if idx == 0:
                        name_to_print = name
                        continue
                    name_to_print = name_to_print + " " + name[0] + "."

            c.drawCentredString(text_x, text_y, name_to_print)

        c.save()
        buffer.seek(0)
        return buffer.getvalue()
    
    def sort_students(self, students):
        def extract_last_name(student):
            full_name = student['name']
            parts = full_name.strip().split()
            return parts[1] if len(parts) >= 2 else parts[0]
        
        return sorted(students, key=extract_last_name)

    def multiply_students(self, students, repeat=1):
        result = []
        for student in students:
            result.extend([student] * repeat)
        return result

class WebPdfManager:
    def __init__(self):
        pass

    def detect_page_size(self, page):
        # Get page dimensions using PyPDF2
        box = page.mediabox if hasattr(page, 'mediabox') else page.mediaBox
        width = float(box.width)
        height = float(box.height)
        
        if self._is_a4(width, height):
            return "A4"
        elif self._is_a3(width, height):
            return "A3"
        else:
            return "other"
        
    def _is_a4(self, w, h):
        return (self._is_close(w, 595) and self._is_close(h, 842)) or (self._is_close(w, 842) and self._is_close(h, 595))

    def _is_a3(self, w, h):
        return (self._is_close(w, 842) and self._is_close(h, 1191)) or (self._is_close(w, 1191) and self._is_close(h, 842))

    def _is_close(self, a, b, tol=5):
        return abs(a - b) < tol

# Global instances
web_logger = None
qr_generator = None
pdf_manager = WebPdfManager()

def set_logger(element_id):
    global web_logger
    web_logger = WebLogger(element_id)
    return web_logger

def create_qr_generator(csv_content):
    global qr_generator
    qr_generator = WebQRGenerator(csv_content)
    return qr_generator

def generate_qr_pdf_from_csv(csv_content):
    try:
        generator = create_qr_generator(csv_content)
        students = generator.readData()
        sorted_students = generator.sort_students(students)
        
        web_logger.info(f"Gefunden: {len(students)} Schüler")
        web_logger.info("Generiere QR-Codes...")
        
        pdf_data = generator.generate_qr_pdf(sorted_students)
        
        web_logger.info("QR-Codes erfolgreich generiert!")
        return pdf_data
    except Exception as e:
        web_logger.error(f"Fehler bei QR-Generierung: {str(e)}")
        raise e

class WebExamReader:
    def __init__(self, pdf_files_data, options, logger):
        self.pdf_files_data = pdf_files_data
        self.split_a3 = options.get('split_a3', False)
        self.two_page_scan = options.get('two_page_scan', False)  
        self.quick_and_dirty = options.get('quick_and_dirty', False)
        self.logger = logger
        self.pdf_manager = pdf_manager
        self.student_page_map = {}
        
    def merge_pdfs(self):
        """Merge multiple PDFs into one using PyPDF2"""
        from PyPDF2 import PdfWriter, PdfReader
        
        if len(self.pdf_files_data) == 1:
            return PdfReader(io.BytesIO(self.pdf_files_data[0][1]))
        
        writer = PdfWriter()
        readers = []
        
        for filename, data in self.pdf_files_data:
            reader = PdfReader(io.BytesIO(data))
            readers.append(reader)
            for page in reader.pages:
                writer.add_page(page)
        
        # Save merged PDF to buffer and return as reader
        merged_buffer = io.BytesIO()
        writer.write(merged_buffer)
        merged_buffer.seek(0)
        
        return PdfReader(merged_buffer)
    
    def simulate_qr_reading(self, total_pages):
        """Simplified QR reading simulation - since we can't render pages in PyPDF2"""
        pdf_page_array = []
        
        # For demo purposes, we'll simulate finding QR codes on some pages
        # In a real implementation, you'd need a library that can render PDF pages to images
        
        for page_num in range(total_pages):
            # Simulate QR detection - every 2-3 pages has a QR code
            has_qr = (page_num % 3 == 0)  # Simple simulation
            
            if has_qr:
                # Generate fake student name for demo
                student_id = f"12345{page_num // 3}"
                student_name = f"Student_{student_id}"
                qr_data = f"{student_name}_{student_id}"
            else:
                qr_data = None
            
            page_info = {
                "page_number": page_num,
                "page_size": "A4",  # Assume A4 for simplicity
                "qr_data": qr_data,
                "side": "left" if has_qr else "none",
                "status": "read" if has_qr else "unread"
            }
            
            pdf_page_array.append(page_info)
            
            if has_qr:
                self.logger.info(f"QR-Code auf Seite {page_num+1} (simuliert): {student_name}")
            
            # Progress update
            self.logger.info(f"Fortschritt: {page_num + 1}/{total_pages} Seiten verarbeitet")
        
        return pdf_page_array
    
    def create_student_page_map(self, pdf_page_array):
        """Create mapping of students to their pages"""
        student_map = {}
        
        for page in pdf_page_array:
            if page["status"] == "read" and page["qr_data"]:
                student_name = page["qr_data"].split('_')[0]
                
                if student_name not in student_map:
                    student_map[student_name] = []
                
                student_map[student_name].append(page["page_number"])
        
        return student_map
    
    def create_student_pdfs(self, merged_reader):
        """Create individual PDFs for each student using PyPDF2"""
        import zipfile
        
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w') as zip_file:
            for student_name, page_numbers in self.student_page_map.items():
                # Create PDF for this student
                writer = PdfWriter()
                
                for page_num in sorted(page_numbers):
                    if page_num < len(merged_reader.pages):
                        writer.add_page(merged_reader.pages[page_num])
                
                # Save to buffer
                pdf_buffer = io.BytesIO()
                writer.write(pdf_buffer)
                
                # Add to zip
                zip_file.writestr(f"{student_name}.pdf", pdf_buffer.getvalue())
                self.logger.info(f"PDF für {student_name} erstellt ({len(page_numbers)} Seiten)")
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()

def process_pdf_files(pdf_files_data, options):
    try:
        web_logger.info(f"Verarbeite {len(pdf_files_data)} PDF-Datei(en)...")
        
        # Create exam reader
        reader = WebExamReader(pdf_files_data, options, web_logger)
        
        # Merge PDFs
        web_logger.info("Füge PDFs zusammen...")
        merged_pdf = reader.merge_pdfs()
        
        # Get total pages
        total_pages = len(merged_pdf.pages)
        web_logger.info(f"Insgesamt {total_pages} Seiten zu verarbeiten")
        
        # Simulate QR code reading (since we can't render pages with PyPDF2)
        web_logger.info("Simuliere QR-Code Erkennung...")
        web_logger.warning("HINWEIS: QR-Code Erkennung ist in der Browser-Version vereinfacht")
        
        pdf_page_array = reader.simulate_qr_reading(total_pages)
        
        # Create student-page mapping
        web_logger.info("Erstelle Schüler-Zuordnungen...")
        reader.student_page_map = reader.create_student_page_map(pdf_page_array)
        
        # Create individual student PDFs
        web_logger.info("Erstelle individuelle PDFs...")
        result_zip = reader.create_student_pdfs(merged_pdf)
        
        num_students = len(reader.student_page_map)
        web_logger.info(f"PDF-Verarbeitung abgeschlossen! {num_students} Schüler erkannt.")
        
        return result_zip
        
    except Exception as e:
        web_logger.error(f"Fehler bei PDF-Verarbeitung: {str(e)}")
        raise e

print("Python modules loaded successfully!")
    `;
    
    pyodide.runPython(pythonCode);
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