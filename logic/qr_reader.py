import os
import shutil
import zipfile
import time
from datetime import datetime
from pathlib import Path
import fitz
import cv2
import numpy as np
from PyPDF2 import PdfMerger
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet


class ExamReader : 

    def __init__(self, input_files : list[str], scan_options, logger, progress_callback=None):
        self.input_files = input_files
        self.progress_callback = progress_callback
        self.split_a3 = scan_options["split_a3"] 
        self.two_page_scan = scan_options["two_page_scan"]
        self.logger = logger
        self.pdf_page_array = None
        self.student_page_map = None
        self.temp_scan_folder = self._ensure_temp_folder()
        self.temp_folder = self.temp_scan_folder / "temp"
        self.temp_path = self.temp_folder / f"merged_{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf"

    def readFiles(self) :
        if len(self.input_files) > 1:
            merger = PdfMerger()
            for file in self.input_files :
                merger.append(file)
            merger.write(self.temp_path)
            merger.close()
            self.logger.info("Merged PDF saved to: " + str(self.temp_path))
            self.fitz_source_pdf = fitz.open(self.temp_path)
        else :
            self.fitz_source_pdf = fitz.open(self.input_files[0])

        self.pdf_page_array = self._read_qr_codes()
        self.student_page_map = self._create_student_page_map()

    def _ensure_temp_folder(self):
        import tkinter as tk
        from tkinter import filedialog
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        temp_folder = Path(f"scan_{timestamp}")
        temp_folder.mkdir(parents=True, exist_ok=True)
        try:
            with open(temp_folder / "test.txt", "w") as f:
                pass
            os.remove(temp_folder / "test.txt")
        except Exception:
            root = tk.Tk()
            root.withdraw()
            selected_folder = filedialog.askdirectory(title="Bitte wählen Sie einen temporären Ordner mit Schreibrechten")
            if not selected_folder:
                raise RuntimeError("Kein temporärer Ordner gewählt. Abbruch.")
            temp_folder = Path(selected_folder)
            temp_folder.mkdir(parents=True, exist_ok=True)
        return temp_folder

    def saveZipFile(self, output_path) : 
        self.summary = []
        preview_pdf = []
        for student in self.student_page_map :
            num_pages, student_file_path = self._create_student_pdf(student)
            self.summary.append({
                "Schüler/-in": student.split("_")[0], 
                "Anzahl Seiten": num_pages}
            )
            preview_pdf.append([student, student_file_path])
        self.summary_path = self._summary_pdf()
        self.preview_path = self._create_preview_pdf(preview_pdf)

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf :
            for file in self.temp_folder.rglob('*'):
                zipf.write(file, file.relative_to(self.temp_folder))
        self.logger.info("ZIP file created: " + output_path)
        self.logger.info(f"Done. Created output for {len(self.student_page_map)} students.")
        
    def close(self):
        self.fitz_source_pdf.close()
        if os.path.exists(str(self.temp_path)):
            os.remove(str(self.temp_path))
        if self.temp_folder.exists() and self.temp_folder.is_dir():
            shutil.rmtree(self.temp_folder)
            
    def _extract_qr_code_from_page (self, page_number):
        img_cv = self._open_page_cv(page_number)
        detector = cv2.QRCodeDetector()
        (h,w) = img_cv.shape[:2]
        center = (w//2, h//2)

        angles = [0] + [i for i in range(-15, 16) if i != 0]
        for angle in angles :
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(img_cv, matrix, (w,h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

            data, points, _ = detector.detectAndDecode(rotated)
            if data == "" :
                continue
            
            self.logger.info(f"QR-Code on page {page_number+1} read. Student: {data.split('_')[0]}{f' (angle {angle})' if angle != 0 else ''}")
            data = data.replace("Teilnehmer/in", "")

            cx = int(points[0][:,0].mean())
            side = "left" if cx < w/2 else "right"
            return (data, side)
            
        return (None, None)
    

    def _open_page_cv (self, page_number) :
        zoom = 3
        mat = fitz.Matrix(zoom, zoom)
        pix = self.fitz_source_pdf.load_page(page_number).get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR) 
        
    
    def get_summary_path(self) -> str:
        return self.summary_path
    
    def _summary_pdf(self):
        summary = self.summary
        if not summary or len(summary) == 0 :
            return False
        
        filename = f"{Path(self.temp_folder).parent}/summary-{time.strftime('%Y%m%d-%H%M%S')}.pdf"

        doc = SimpleDocTemplate(filename, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        title = Paragraph("Zusammenfassung", styles['Title'])
        elements.append(title)
        elements.append(Spacer(1, 0.5*cm))

        # Prepare table data
        if summary and isinstance(summary, list) and isinstance(summary[0], dict):
            headers = list(summary[0].keys())
            data = [headers] + [[str(row.get(h, "")) for h in headers] for row in summary]
        else:
            data = [["Keine Daten"]]

        table = Table(data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))
        elements.append(table)

        doc.build(elements)
        return filename
    
    def _create_preview_pdf(self, preview_pdf) :   
        if not preview_pdf or len(preview_pdf) == 0 :
            return False

        filename = f"{Path(self.temp_folder).parent}/preview-{time.strftime('%Y%m%d-%H%M%S')}.pdf"
        merger = PdfMerger()
        for (student, path) in preview_pdf :
            # Create a one-page PDF with the student's name
            name_pdf_path = os.path.join(str(self.temp_folder), f"{student}_namepage.pdf")
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            c = canvas.Canvas(name_pdf_path, pagesize=A4)
            c.setFont("Helvetica-Bold", 32)
            c.drawCentredString(A4[0]/2, A4[1]/2, f"Schüler/-in: {student.split('_')[0]}")
            c.save()
            merger.append(name_pdf_path)
            merger.append(path)
        merger.write(filename)
        merger.close()
        self.logger.info("Preview PDF created: " + filename)
        return filename

    def get_preview_path(self) -> str:
        return self.preview_path

    def _create_student_pdf(self, student : str) -> int :
        output_pdf = fitz.open()
        i=0

        while (i < len(self.student_page_map[student])):
            page = self.student_page_map[student][i]
            if not self.split_a3 or not page["size"] == "A3" or not i + 1 < len(self.student_page_map[student]):
                output_pdf.insert_pdf(self.fitz_source_pdf, from_page=page["page_num"], to_page=page["page_num"])
                i+=1
                continue

            next_page = self.student_page_map[student][i+1]
            if self._is_splittable_pair(page, next_page) :
                self.logger.info(f"Pages {page['page_num']+1} and {next_page['page_num']+1} will be split.")
                (output_page4, output_page1) = self._split_a3(page)
                (output_page2, output_page3) = self._split_a3(next_page)

                for page in (output_page1, output_page2, output_page3, output_page4) :
                    output_pdf.insert_pdf(page)
                    page.close()
                i+=2
                continue

            else :
                output_pdf.insert_pdf(self.fitz_source_pdf, from_page=page["page_num"], to_page=page["page_num"])
                i+=1
                continue

        num_pages = len(output_pdf)
        student_folder = str(self.temp_folder) + "/"+student
        os.makedirs(student_folder, exist_ok=True)
        output_file_path = os.path.join(student_folder, f"{student}.pdf")
        output_pdf.save(output_file_path)
        output_pdf.close()
        return [num_pages, output_file_path]

    def _is_splittable_pair(self, page1, page2) -> bool : 
        return ( 
            page1["status"] == "read" and
            (page1["side"] == "left" and page2["side"] == "right") or (page2["side"] == "none")
        )

       
    def _split_a3(self, page) :
        fitz_page = self.fitz_source_pdf[page["page_num"]]
        rect = fitz_page.rect
        left_rect = fitz.Rect(rect.x0, rect.y0, rect.x1 / 2, rect.y1)
        right_rect = fitz.Rect(rect.x1 / 2, rect.y0, rect.x1, rect.y1)

        left_page = fitz.open()
        left_page1 = left_page.new_page(width=left_rect.width, height=left_rect.height)
        left_page1.show_pdf_page(left_page1.rect, self.fitz_source_pdf, page["page_num"], clip=left_rect)

        right_page = fitz.open()
        right_page2 = right_page.new_page(width=right_rect.width, height=right_rect.height)
        right_page2.show_pdf_page(right_page2.rect, self.fitz_source_pdf, page["page_num"], clip=right_rect)

        return (left_page, right_page)
            

    def _read_qr_codes(self) :
        pages_info = []
        total_pages = len(self.fitz_source_pdf)
        last_qr = None
        missing_pages = []

        for page_num in range (total_pages) : 
            size = self._detect_page_size(self.fitz_source_pdf[page_num])
            (qr, side) = self._extract_qr_code_from_page(page_num)
            if qr:
                page_info = {"page_num": page_num, "size": size, "status": "read", "value": qr, "side": side}
                pages_info.append(page_info)
                last_qr = qr

            elif self.two_page_scan :
                if not last_qr :
                    self.logger.error(f"Error on page {page_num+1} of merged PDF: There seem to be two consecutive pages without QR-code or the first page does not have a QR code.")
                    missing_pages.append(page_num)
                    continue
                page_info = {"page_num": page_num, "size": size, "status": "from_previous", "value": last_qr, "side": "none"}
                self.logger.info(f"No QR code on page {page_num+1} of merged PDF. Inferred from previous page.")
                pages_info.append(page_info)
                last_qr = None

            else : 
                self.logger.error(f"Read error: Page {page_num+1} has no QR-Code and option two_page_scan is not active.")
                missing_pages.append(page_num)
                continue
            
            if self.progress_callback:
                self.progress_callback((page_num+1)/total_pages)

        if len(missing_pages) > 0:
            self.logger.error("Same pages could not be assigned: " + str(missing_pages))
        else :
            self.logger.info("All QR codes read.")
        return pages_info
    
            
    def _create_student_page_map(self) :
        students = {}
        for page in self.pdf_page_array :
            if not page["value"] in students :
                students[page["value"]] = []

            students[page["value"]].append(page)
        return students

    def _detect_page_size (self, page) :
        width, height = page.rect.width, page.rect.height
        if self._is_a4(width, height):
            return "A4"
        elif self._is_a3(width, height):
            return "A3"
        else:
            return "other"
        
    def _is_a4(self, w, h):
        return self._is_close(w, 595) and self._is_close(h, 842) or self._is_close(w, 842) and self._is_close(h, 595)

    def _is_a3(self, w, h):
        return self._is_close(w, 842) and self._is_close(h, 1191) or self._is_close(w, 1191) and self._is_close(h, 842)

    def _is_close(self, a, b, tol=5):
        return abs(a - b) < tol



