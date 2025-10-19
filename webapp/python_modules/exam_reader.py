import io
import zipfile
import time
from datetime import datetime
import cv2
import numpy as np

class WebLogger:
    def __init__(self):
        self.messages = []
    
    def info(self, message):
        self.messages.append(f"INFO: {message}")
        print(f"INFO: {message}")
    
    def error(self, message):
        self.messages.append(f"ERROR: {message}")
        print(f"ERROR: {message}")
    
    def exception(self, error):
        self.messages.append(f"EXCEPTION: {str(error)}")
        print(f"EXCEPTION: {str(error)}")
    
    def get_messages(self):
        return self.messages
    
    def clear(self):
        self.messages = []

class ExamReader:
    def __init__(self, scan_options, logger=None, progress_callback=None):
        self.progress_callback = progress_callback
        self.split_a3 = scan_options.get("split_a3", False)
        self.two_page_scan = scan_options.get("two_page_scan", False)
        self.quick_and_dirty = scan_options.get("quick_and_dirty", False)
        self.logger = logger or WebLogger()
        self.pdf_page_array = None
        self.student_page_map = None
        self.summary = []

    def process_pdf_files(self, pdf_files_data):
        try:
            self.logger.info(f"Processing {len(pdf_files_data)} PDF file(s)")
            self._simulate_qr_reading()
            self.student_page_map = self._create_student_page_map()
            return True
        except Exception as e:
            self.logger.error(f"Error processing PDF files: {e}")
            return False

    def _simulate_qr_reading(self):
        self.pdf_page_array = [
            {"page_num": 0, "size": "A4", "status": "read", "value": "Mustermann_12345", "side": "left"},
            {"page_num": 1, "size": "A4", "status": "read", "value": "Schmidt_67890", "side": "right"},
            {"page_num": 2, "size": "A4", "status": "read", "value": "Mueller_11111", "side": "left"},
        ]
        
        if self.progress_callback:
            for i in range(len(self.pdf_page_array)):
                self.progress_callback((i + 1) / len(self.pdf_page_array))
        
        self.logger.info(f"Found {len(self.pdf_page_array)} pages with QR codes")

    def _create_student_page_map(self):
        students = {}
        for page in self.pdf_page_array:
            if page["value"] not in students:
                students[page["value"]] = []
            students[page["value"]].append(page)
        
        for student, pages in students.items():
            self.summary.append({
                "Schüler/-in": student.split("_")[0], 
                "Anzahl Seiten": len(pages)
            })
        
        return students

    def create_zip_file(self):
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
            summary_content = self._create_summary_text()
            zipf.writestr("summary.txt", summary_content)
            
            for student in self.student_page_map:
                student_name = student.split("_")[0]
                zipf.writestr(f"{student_name}/{student_name}.txt", 
                             f"Pages for {student_name}: {len(self.student_page_map[student])}")
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()

    def _create_summary_text(self):
        summary_text = "Zusammenfassung\n" + "="*50 + "\n\n"
        summary_text += f"Verarbeitet am: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        for item in self.summary:
            summary_text += f"Schüler/-in: {item['Schüler/-in']}, Anzahl Seiten: {item['Anzahl Seiten']}\n"
        
        return summary_text

    def get_summary(self):
        return self.summary