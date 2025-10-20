import io
import zipfile
import time
from datetime import datetime
import cv2
import numpy as np
from PIL import Image

class WebLogger:
    """Web-compatible logger for the ExamReader"""
    def __init__(self):
        self.messages = []
    
    def info(self, message):
        self.messages.append(f"INFO: {message}")
        print(f"INFO: {message}")
    
    def error(self, message):
        self.messages.append(f"ERROR: {message}")
        print(f"ERROR: {message}")
    
    def warning(self, message):
        self.messages.append(f"WARNING: {message}")
        print(f"WARNING: {message}")
    
    def exception(self, error):
        self.messages.append(f"EXCEPTION: {str(error)}")
        print(f"EXCEPTION: {str(error)}")
    
    def get_messages(self):
        return self.messages
    
    def clear(self):
        self.messages = []

class WebPDFManager:
    """Web-compatible PDF manager for basic operations"""
    
    def detect_page_size(self, page_width, page_height):
        """Detect if page is A3 or A4 based on dimensions"""
        # A4: 210 × 297 mm, A3: 297 × 420 mm
        ratio = max(page_width, page_height) / min(page_width, page_height)
        
        # A3 ratio is approximately 1.41, A4 is also 1.41
        # But A3 pages are typically larger in absolute size
        if max(page_width, page_height) > 500:  # Rough threshold for A3
            return "A3"
        else:
            return "A4"
    
    def is_splittable_pair(self, page1, page2):
        """Check if two consecutive A3 pages can be split together"""
        return (page1["size"] == "A3" and page2["size"] == "A3" and 
                page1["side"] == "left" and page2["side"] == "right")

class ExamReader:
    """Web-compatible version of ExamReader for processing PDF files with QR codes"""
    
    def __init__(self, pdf_files_data, scan_options, logFunc=None, progress_callback=None):
        if scan_options is None:
            self.split_a3 = False
            self.two_page_scan = False
            self.quick_and_dirty = False
            output = "First option worked."
        elif hasattr(scan_options, 'to_py'):
            options_dict = scan_options.to_py()
            self.split_a3 = options_dict.get("split_a3", False)
            self.two_page_scan = options_dict.get("two_page_scan", False)
            self.quick_and_dirty = options_dict.get("quick_and_dirty", False)
            output = "Second option worked."
        elif isinstance(scan_options, dict):
            self.split_a3 = scan_options.get("split_a3", False)
            self.two_page_scan = scan_options.get("two_page_scan", False)
            self.quick_and_dirty = scan_options.get("quick_and_dirty", False)
            output = "third option worked."
        else:
            try:
                self.split_a3 = getattr(scan_options, 'split_a3', False)
                self.two_page_scan = getattr(scan_options, 'two_page_scan', False)
                self.quick_and_dirty = getattr(scan_options, 'quick_and_dirty', False)
                output = "Fourth option worked."
            except:
                self.split_a3 = False
                self.two_page_scan = False
                self.quick_and_dirty = False
                output = "Last option worked."
            
        # Store PDF data
        self.pdf_files_data = pdf_files_data
        self.pdf_manager = WebPDFManager()
        
        # Initialize processing variables
        self.pdf_page_array = None
        self.student_page_map = None
        self.summary = []
        self.missing_pages = []
            
        if logFunc :
            self.logMsg = logFunc.to_py()
            self.logMsg("Reader initialized", "success")
            self.logMsg(output, "info")

    def process_pdf_files(self):
        try:
            self.logger.info(f"Processing {len(self.pdf_files_data)} PDF file(s)")
            
            # Read QR codes from all pages
            self.pdf_page_array = self._read_qr_codes_from_pdfs()
            
            # Create mapping of students to their pages
            self.student_page_map = self._create_student_page_map()
            
            # Generate summary
            self._generate_summary()
            
            self.logger.info(f"Processing completed. Found {len(self.student_page_map)} students.")
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing PDF files: {str(e)}")
            return False

    def _read_qr_codes_from_pdfs(self):
        """
        Read QR codes from all pages in the PDF files
        
        Returns:
            list: Array of page information with QR code data
        """
        pages_info = []
        last_qr = None
        self.missing_pages = []
        
        total_pages = 0
        current_page = 0
        
        # First pass: count total pages for progress tracking
        try:
            # For now, we'll simulate PDF processing since we don't have PyMuPDF in web
            # In a real implementation, you'd use a web-compatible PDF library
            
            # Simulate pages based on file sizes (rough estimation)
            for pdf_file in self.pdf_files_data:
                # Rough estimate: 1 page per 50KB
                estimated_pages = max(1, len(pdf_file['data']) // 50000)
                total_pages += estimated_pages
            
            # Simulate QR code reading
            for pdf_file in self.pdf_files_data:
                estimated_pages = max(1, len(pdf_file['data']) // 50000)
                
                for page_num in range(estimated_pages):
                    current_page += 1
                    
                    # Simulate QR code detection (replace with real implementation)
                    qr_data, side = self._simulate_qr_extraction(pdf_file, page_num, current_page)
                    
                    # Simulate page size detection
                    page_size = "A4"  # Default simulation
                    
                    if qr_data:
                        page_info = {
                            "page_num": current_page - 1,
                            "size": page_size,
                            "status": "read",
                            "value": qr_data,
                            "side": side,
                            "file_name": pdf_file['name']
                        }
                        pages_info.append(page_info)
                        last_qr = qr_data
                        
                    elif self.two_page_scan:
                        if not last_qr:
                            self.logger.error(f"Error on page {current_page}: Two consecutive pages without QR-code")
                            self.missing_pages.append(current_page - 1)
                            continue
                            
                        page_info = {
                            "page_num": current_page - 1,
                            "size": page_size,
                            "status": "from_previous",
                            "value": last_qr,
                            "side": "none",
                            "file_name": pdf_file['name']
                        }
                        self.logger.info(f"No QR code on page {current_page}. Inferred from previous page.")
                        pages_info.append(page_info)
                        last_qr = None
                        
                    else:
                        self.logger.error(f"Read error: Page {current_page} has no QR-Code and two_page_scan is not active.")
                        self.missing_pages.append(current_page - 1)
                        continue
                    
                    # Update progress
                    if self.progress_callback:
                        self.progress_callback(current_page / total_pages)
            
            if len(self.missing_pages) > 0:
                self.logger.warning(f"Some pages could not be assigned: {[p+1 for p in self.missing_pages]}")
            else:
                self.logger.info("All QR codes read successfully.")
            
            return pages_info
            
        except Exception as e:
            self.logger.error(f"Error reading QR codes: {str(e)}")
            return []

    def _simulate_qr_extraction(self, pdf_file, page_num, global_page_num):
        """
        Simulate QR code extraction from a PDF page
        In a real implementation, this would:
        1. Extract the page as an image
        2. Use OpenCV to detect and decode QR codes
        3. Return the QR data and position
        """
        # Simulate different student names based on file name and page
        file_base = pdf_file['name'].replace('.pdf', '')
        student_names = [
            "Mustermann_12345", "Schmidt_67890", "Mueller_11111", 
            "Weber_22222", "Fischer_33333", "Wagner_44444",
            "Becker_55555", "Schulz_66666", "Hoffmann_77777"
        ]
        
        # Simulate some pages having QR codes, some not
        if global_page_num % 3 == 0:  # Every third page has no QR code
            return None, None
        
        # Select a student name based on page number
        student_idx = (global_page_num + hash(file_base)) % len(student_names)
        qr_data = student_names[student_idx]
        
        # Simulate side detection
        side = "left" if global_page_num % 2 == 0 else "right"
        
        self.logger.info(f"QR-Code on page {global_page_num} read. Student: {qr_data.split('_')[0]}")
        
        return qr_data, side

    def _extract_qr_code_from_image_data(self, image_data):
        """
        Extract QR code from image data using OpenCV
        
        Args:
            image_data: Binary image data
            
        Returns:
            tuple: (qr_data, side) or (None, None) if no QR code found
        """
        try:
            # Convert image data to OpenCV format
            nparr = np.frombuffer(image_data, np.uint8)
            img_cv = cv2.imdecode(nparr, cv2.COLOR_RGB2BGR)
            
            if img_cv is None:
                return None, None
            
            detector = cv2.QRCodeDetector()
            (h, w) = img_cv.shape[:2]
            center = (w//2, h//2)
            
            # Try different rotation angles if quick_and_dirty is False
            if self.quick_and_dirty:
                angles = [0]
            else:
                angles = [0] + [i for i in range(-15, 16) if i != 0]
            
            for angle in angles:
                if angle != 0:
                    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
                    rotated = cv2.warpAffine(img_cv, matrix, (w, h), 
                                           flags=cv2.INTER_LINEAR, 
                                           borderMode=cv2.BORDER_REPLICATE)
                else:
                    rotated = img_cv
                
                data, points, _ = detector.detectAndDecode(rotated)
                
                if data:
                    # Clean up data
                    data = data.replace("Teilnehmer/in", "")
                    
                    # Determine side based on QR code position
                    if points is not None and len(points) > 0:
                        cx = int(points[0][:,0].mean())
                        side = "left" if cx < w/2 else "right"
                    else:
                        side = "center"
                    
                    return data, side
            
            return None, None
            
        except Exception as e:
            self.logger.error(f"Error extracting QR code from image: {str(e)}")
            return None, None

    def _create_student_page_map(self):
        """
        Create mapping of students to their pages
        
        Returns:
            dict: Dictionary mapping student IDs to their page lists
        """
        students = {}
        
        for page in self.pdf_page_array:
            student_id = page["value"]
            if student_id not in students:
                students[student_id] = []
            students[student_id].append(page)
        
        return students

    def _generate_summary(self):
        """Generate summary information about processed students"""
        self.summary = []
        
        for student_id, pages in self.student_page_map.items():
            student_name = student_id.split("_")[0]
            self.summary.append({
                "Schüler/-in": student_name,
                "Anzahl Seiten": len(pages),
                "Status": "Vollständig" if len(pages) > 0 else "Fehler"
            })
        
        # Sort by student name
        self.summary.sort(key=lambda x: x["Schüler/-in"])

    def create_zip_file(self):
        """
        Create a ZIP file with all processed student data
        
        Returns:
            bytes: ZIP file contents as bytes
        """
        try:
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
                # Add summary
                summary_content = self._create_summary_text()
                zipf.writestr("summary.txt", summary_content)
                
                # Add detailed summary (HTML format)
                html_summary = self._create_summary_html()
                zipf.writestr("summary.html", html_summary)
                
                # Add individual student files
                for student_id, pages in self.student_page_map.items():
                    student_name = student_id.split("_")[0]
                    student_folder = f"Participant_{student_id.split('_')[1]}_assignsubmission_file_"
                    
                    # Create student info file
                    student_info = self._create_student_info(student_id, pages)
                    zipf.writestr(f"{student_folder}/{student_name}_info.txt", student_info)
                    
                    # Add page information
                    for i, page in enumerate(pages):
                        page_info = f"Page {i+1}: File={page.get('file_name', 'unknown')}, " \
                                   f"Page={page['page_num']+1}, Size={page['size']}, " \
                                   f"Status={page['status']}, Side={page['side']}"
                        zipf.writestr(f"{student_folder}/page_{i+1}_info.txt", page_info)
                
                # Add missing pages info if any
                if self.missing_pages:
                    missing_info = f"Nicht zugeordnete Seiten: {len(self.missing_pages)}\n"
                    missing_info += "Seitennummern: " + ", ".join(str(p+1) for p in self.missing_pages)
                    zipf.writestr("missing_pages.txt", missing_info)
            
            zip_buffer.seek(0)
            return zip_buffer.getvalue()
            
        except Exception as e:
            self.logger.error(f"Error creating ZIP file: {str(e)}")
            return b""

    def _create_summary_text(self):
        """Create text summary of processing results"""
        summary_text = "DiRueLei - Zusammenfassung der PDF-Verarbeitung\n"
        summary_text += "=" * 50 + "\n\n"
        summary_text += f"Verarbeitet am: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        summary_text += f"Anzahl verarbeiteter PDF-Dateien: {len(self.pdf_files_data)}\n"
        summary_text += f"Anzahl gefundener Schüler: {len(self.student_page_map)}\n"
        summary_text += f"Gesamtanzahl Seiten: {len(self.pdf_page_array)}\n"
        
        if self.missing_pages:
            summary_text += f"Nicht zugeordnete Seiten: {len(self.missing_pages)}\n"
        
        summary_text += "\nEinstellungen:\n"
        summary_text += f"- A3-Bögen teilen: {'Ja' if self.split_a3 else 'Nein'}\n"
        summary_text += f"- Zweiseitiger Scan: {'Ja' if self.two_page_scan else 'Nein'}\n"
        summary_text += f"- Quick and Dirty: {'Ja' if self.quick_and_dirty else 'Nein'}\n\n"
        
        summary_text += "Schüler-Details:\n"
        summary_text += "-" * 30 + "\n"
        
        for item in self.summary:
            summary_text += f"Schüler/-in: {item['Schüler/-in']:<20} "
            summary_text += f"Seiten: {item['Anzahl Seiten']:<5} "
            summary_text += f"Status: {item['Status']}\n"
        
        return summary_text

    def _create_summary_html(self):
        """Create HTML summary of processing results"""
        html = """<!DOCTYPE html>
<html>
<head>
    <title>DiRueLei - Zusammenfassung</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .header { color: #333; margin-bottom: 20px; }
        .settings { background-color: #f9f9f9; padding: 10px; margin: 10px 0; }
    </style>
</head>
<body>
    <h1>DiRueLei - Zusammenfassung der PDF-Verarbeitung</h1>
    
    <div class="header">
        <p><strong>Verarbeitet am:</strong> {timestamp}</p>
        <p><strong>PDF-Dateien:</strong> {num_files}</p>
        <p><strong>Gefundene Schüler:</strong> {num_students}</p>
        <p><strong>Gesamte Seiten:</strong> {total_pages}</p>
        {missing_pages_info}
    </div>
    
    <div class="settings">
        <h3>Einstellungen:</h3>
        <ul>
            <li>A3-Bögen teilen: {split_a3}</li>
            <li>Zweiseitiger Scan: {two_page_scan}</li>
            <li>Quick and Dirty: {quick_and_dirty}</li>
        </ul>
    </div>
    
    <h2>Schüler-Details:</h2>
    <table>
        <tr>
            <th>Schüler/-in</th>
            <th>Anzahl Seiten</th>
            <th>Status</th>
        </tr>
        {student_rows}
    </table>
</body>
</html>"""
        
        # Format student rows
        student_rows = ""
        for item in self.summary:
            student_rows += f"""
        <tr>
            <td>{item['Schüler/-in']}</td>
            <td>{item['Anzahl Seiten']}</td>
            <td>{item['Status']}</td>
        </tr>"""
        
        # Missing pages info
        missing_pages_info = ""
        if self.missing_pages:
            missing_pages_info = f"<p><strong>Nicht zugeordnete Seiten:</strong> {len(self.missing_pages)}</p>"
        
        return html.format(
            timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            num_files=len(self.pdf_files_data),
            num_students=len(self.student_page_map),
            total_pages=len(self.pdf_page_array),
            missing_pages_info=missing_pages_info,
            split_a3="Ja" if self.split_a3 else "Nein",
            two_page_scan="Ja" if self.two_page_scan else "Nein",
            quick_and_dirty="Ja" if self.quick_and_dirty else "Nein",
            student_rows=student_rows
        )

    def _create_student_info(self, student_id, pages):
        """Create detailed information text for a student"""
        student_name = student_id.split("_")[0]
        info_text = f"Schüler/-in: {student_name}\n"
        info_text += f"ID: {student_id}\n"
        info_text += f"Anzahl Seiten: {len(pages)}\n\n"
        
        info_text += "Seiten-Details:\n"
        info_text += "-" * 20 + "\n"
        
        for i, page in enumerate(pages):
            info_text += f"Seite {i+1}:\n"
            info_text += f"  - Datei: {page.get('file_name', 'unbekannt')}\n"
            info_text += f"  - Seiten-Nr.: {page['page_num']+1}\n"
            info_text += f"  - Größe: {page['size']}\n"
            info_text += f"  - Status: {page['status']}\n"
            info_text += f"  - Position: {page['side']}\n\n"
        
        return info_text

    def get_summary(self):
        """Get processing summary"""
        return self.summary
    
    def get_student_count(self):
        """Get number of processed students"""
        return len(self.student_page_map) if self.student_page_map else 0
    
    def get_page_count(self):
        """Get total number of processed pages"""
        return len(self.pdf_page_array) if self.pdf_page_array else 0
    
    def get_missing_pages(self):
        """Get list of missing page numbers"""
        return self.missing_pages
    
    def has_missing_pages(self):
        """Check if there are any missing pages"""
        return len(self.missing_pages) > 0