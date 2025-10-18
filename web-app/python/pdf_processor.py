import fitz  # PyMuPDF
import cv2
import numpy as np
import io
import zipfile
from PIL import Image

class WebPdfManager:
    def __init__(self):
        pass

    def detect_page_size(self, page):
        width, height = page.rect.width, page.rect.height
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
    
    def split_a3(self, fitz_pdf, page_num):
        fitz_page = fitz_pdf[page_num]
        rect = fitz_page.rect
        left_rect = fitz.Rect(rect.x0, rect.y0, rect.x1 / 2, rect.y1)
        right_rect = fitz.Rect(rect.x1 / 2, rect.y0, rect.x1, rect.y1)

        left_page = fitz.open()
        left_page1 = left_page.new_page(width=left_rect.width, height=left_rect.height)
        left_page1.show_pdf_page(left_page1.rect, fitz_pdf, page_num, clip=left_rect)

        right_page = fitz.open()
        right_page2 = right_page.new_page(width=right_rect.width, height=right_rect.height)
        right_page2.show_pdf_page(right_page2.rect, fitz_pdf, page_num, clip=right_rect)

        return (left_page, right_page)

class WebExamReader:
    def __init__(self, pdf_files_data, options, logger):
        self.pdf_files_data = pdf_files_data
        self.split_a3 = options.get('split_a3', False)
        self.two_page_scan = options.get('two_page_scan', False)  
        self.quick_and_dirty = options.get('quick_and_dirty', False)
        self.logger = logger
        self.pdf_manager = WebPdfManager()
        self.student_page_map = {}
        
    def merge_pdfs(self):
        """Merge multiple PDFs into one using PyMuPDF"""
        if len(self.pdf_files_data) == 1:
            return fitz.open(stream=self.pdf_files_data[0][1])
        
        merged_doc = fitz.open()
        for filename, data in self.pdf_files_data:
            pdf_doc = fitz.open(stream=data)
            merged_doc.insert_pdf(pdf_doc)
            pdf_doc.close()
        
        return merged_doc
    
    def extract_qr_code_from_page(self, page_number, fitz_pdf):
        """Extract QR code from a page using OpenCV"""
        try:
            # Convert page to image
            zoom = 3
            mat = fitz.Matrix(zoom, zoom)
            pix = fitz_pdf.load_page(page_number).get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            
            detector = cv2.QRCodeDetector()
            h, w = img_cv.shape[:2]
            center = (w//2, h//2)
            
            # Try different rotations
            angles = [0] if self.quick_and_dirty else [0] + list(range(-15, 16))
            
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
                    self.logger.info(f"QR-Code auf Seite {page_number+1} gelesen: {data.split('_')[0]}")
                    data = data.replace("Teilnehmer/in", "")
                    
                    # Determine side (left/right)
                    if points is not None and len(points) > 0:
                        cx = int(points[0][:,0].mean())
                        side = "left" if cx < w/2 else "right"
                    else:
                        side = "none"
                    
                    return data, side
            
            return None, None
            
        except Exception as e:
            self.logger.warning(f"Fehler beim QR-Code lesen auf Seite {page_number+1}: {str(e)}")
            return None, None
    
    def read_qr_codes(self, fitz_pdf):
        """Read QR codes from all pages"""
        pdf_page_array = []
        total_pages = len(fitz_pdf)
        
        for page_num in range(total_pages):
            page_size = self.pdf_manager.detect_page_size(fitz_pdf[page_num])
            qr_data, side = self.extract_qr_code_from_page(page_num, fitz_pdf)
            
            page_info = {
                "page_number": page_num,
                "page_size": page_size,
                "qr_data": qr_data,
                "side": side,
                "status": "read" if qr_data else "unread"
            }
            
            pdf_page_array.append(page_info)
            
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
    
    def create_student_pdfs(self, fitz_pdf):
        """Create individual PDFs for each student using PyMuPDF"""
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w') as zip_file:
            for student_name, page_numbers in self.student_page_map.items():
                # Create PDF for this student
                student_doc = fitz.open()
                
                for page_num in sorted(page_numbers):
                    student_doc.insert_pdf(fitz_pdf, from_page=page_num, to_page=page_num)
                
                # Save to buffer
                pdf_buffer = io.BytesIO()
                student_doc.save(pdf_buffer)
                student_doc.close()
                
                # Add to zip
                zip_file.writestr(f"{student_name}.pdf", pdf_buffer.getvalue())
                self.logger.info(f"PDF für {student_name} erstellt ({len(page_numbers)} Seiten)")
        
        zip_buffer.seek(0)
        return zip_buffer.getvalue()

def process_pdf_files(pdf_files_data, options):
    from web_logger import web_logger
    
    try:
        web_logger.info(f"Verarbeite {len(pdf_files_data)} PDF-Datei(en)...")
        
        # Create exam reader
        reader = WebExamReader(pdf_files_data, options, web_logger)
        
        # Merge PDFs
        web_logger.info("Füge PDFs zusammen...")
        merged_pdf = reader.merge_pdfs()
        
        # Read QR codes from all pages
        web_logger.info("Lese QR-Codes...")
        pdf_page_array = reader.read_qr_codes(merged_pdf)
        
        # Create student-page mapping
        web_logger.info("Erstelle Schüler-Zuordnungen...")
        reader.student_page_map = reader.create_student_page_map(pdf_page_array)
        
        # Create individual student PDFs
        web_logger.info("Erstelle individuelle PDFs...")
        result_zip = reader.create_student_pdfs(merged_pdf)
        
        # Cleanup
        merged_pdf.close()
        
        num_students = len(reader.student_page_map)
        web_logger.info(f"PDF-Verarbeitung abgeschlossen! {num_students} Schüler erkannt.")
        
        return result_zip
        
    except Exception as e:
        web_logger.error(f"Fehler bei PDF-Verarbeitung: {str(e)}")
        raise e