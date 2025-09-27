import shutil
import cv2
from datetime import datetime
import fitz
import numpy as np
from pathlib import Path
from PyPDF2 import PdfMerger
import os
from PIL import Image
import zipfile
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import time 


class ExamReader : 

    def __init__(self, input_files : list[str], scan_options, logger, progress_callback=None):
        self.input_files = input_files
        self.progress_callback = progress_callback
        self.split_a3 = scan_options["split_a3"] 
        self.two_page_scan = scan_options["two_page_scan"]
        self.logger = logger
        self.pdf_page_array = None
        self.student_array = None

    def readFiles(self) :
        temp_string = f"temp_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
        temp_filename = temp_string + ".pdf"
        temp_path = Path(self.input_files[0]).with_name(temp_filename)
        self.temp_path = temp_path
        self.temp_folder = Path(temp_path).parent / temp_string

        if len(self.input_files) > 1:
            merger = PdfMerger()
            for file in self.input_files :
                merger.append(file)
            merger.write(temp_path)
            merger.close()
            self.logger.info("Merged PDF saved to: " + str(temp_path))
            self.fitz_source_pdf = fitz.open(temp_path)
        else :
            self.fitz_source_pdf = fitz.open(self.input_files[0])

        self.pdf_page_array = self._read_qr_codes()
        self.student_array = self._create_student_array()

    def saveZipFile(self, output_path) : 
        self.summary = []
        for student in self.student_array :
            num_pages = self._create_student_pdf(student)
            self.summary.append({
                "Schüler/-in": student.split("_")[0], 
                "Anzahl Seiten": num_pages}
            )
        self._summary_pdf()

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf :
            for file in self.temp_folder.rglob('*'):
                zipf.write(file, file.relative_to(self.temp_folder))
        self.logger.info("ZIP file created: " + output_path)
        self.logger.info(f"Done. Created output for {len(self.student_array)} students.")
        
    def close(self):
        self.fitz_source_pdf.close()
        if os.path.exists(str(self.temp_path)):
            os.remove(str(self.temp_path))
        if self.temp_folder.exists() and self.temp_folder.is_dir():
            shutil.rmtree(self.temp_folder)
            
    def _extract_qr_code_from_page (self, source_pdf, page_number):
        zoom = 3
        mat = fitz.Matrix(zoom, zoom)
        pix = source_pdf.load_page(page_number).get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        detector = cv2.QRCodeDetector()
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR) 
        angles = np.concatenate([
            np.array([0]), 
            np.array(range(-15, 15, 1))
        ])
        _, indices = np.unique(angles, return_index=True)
        angles = angles[np.sort(indices)]

        (h,w) = img_cv.shape[:2]
        center = (w//2, h//2)

        for angle in angles :
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            rotated = cv2.warpAffine(img_cv, matrix, (w,h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

            data, points, _ = detector.detectAndDecode(rotated)
            if not data == "" :
                self.logger.info("QR-Code on page " + str(page_number+1) + " read at angle " + str(angle) + ". Value: " + data.split("_")[0])
                data = data.replace("Teilnehmer/in", "") + "_assignsubmission_file_"

                quad = points[0]
                cx = int(quad[:,0].mean())
                cy = int(quad[:,1].mean())
                side = "left" if cx < w/2 else "right"
                return (data, side)
            
        return (None, None)
    
    def get_summary_path(self) -> str:
        return self.summary_path
    
    def _summary_pdf(self):
        summary = self.summary
        if not summary or len(summary) == 0 :
            return False
        
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        filename = str(Path(self.temp_path).parent) + "/summary-"+timestamp +".pdf"

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
        self.summary_path = filename
    
    
    def _create_student_pdf(self, student : str) -> int :
        output_pdf = fitz.open()
        i=0

        while (i < len(self.student_array[student])):
            page = self.student_array[student][i]
            if not self.split_a3 or not page["size"] == "A3" or not i + 1 < len(self.student_array[student]):
                output_pdf.insert_pdf(self.fitz_source_pdf, from_page=page["page_num"], to_page=page["page_num"])
                i+=1
                continue

            next_page = self.student_array[student][i+1]
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
        return num_pages



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

        # Bottom half
        right_page = fitz.open()
        right_page2 = right_page.new_page(width=right_rect.width, height=right_rect.height)
        right_page2.show_pdf_page(right_page2.rect, self.fitz_source_pdf, page["page_num"], clip=right_rect)

        return (left_page, right_page)
            

    def _read_qr_codes(self) :
        pages_info = []
        doc = self.fitz_source_pdf
        total_pages = len(self.fitz_source_pdf)
        last_qr = None
        missing_pages = []

        for page_num in range (total_pages) : 
            size = self._detect_page_size(doc[page_num])
            (qr, side) = self._extract_qr_code_from_page(doc, page_num)
            if qr:
                page_info = {"page_num": page_num,
                            "size": size,
                             "status": "read",
                             "value": qr, 
                             "side": side
                             }
                pages_info.append(page_info)
                last_qr = qr

            elif self.two_page_scan :
                if not last_qr :
                    self.logger.error(f"Error on page {page_num+1} of merged PDF: There seem to be two consecutive pages without QR-code or the first page does not have a QR code.")
                    missing_pages.append(page_num)
                    continue
                page_info = {"page_num": page_num,
                             "size": size,
                             "status": "from_previous",
                             "value": last_qr, 
                             "side": "none"
                             }
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
            self.logger.info("QR codes read completely.")
        return pages_info
            
    def _create_student_array(self) :
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



