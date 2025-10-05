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
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
import tkinter as tk
from tkinter import filedialog, messagebox
from logic.pdf_manager import PdfManager

## Should the be refactored? Probably yes. Is it working? Also, yes.

class ExamReader : 

    def __init__(self, input_files : list[str], scan_options, logger, progress_callback):
        self.progress_callback = progress_callback
        self.split_a3 = scan_options.get("split_a3", False)
        self.two_page_scan = scan_options.get("two_page_scan", False)
        self.quick_and_dirty = scan_options.get("quick_and_dirty", False)
        self.logger = logger
        self.temp_scan_folder = self._ensure_temp_folder(input_files[0])
        self.temp_folder = self.temp_scan_folder / "temp"
        self.fitz_source_pdf = self._merge_pdf(input_files)

    def readFiles(self) :
        self.pdf_page_array = self._read_qr_codes()
        self.student_page_map = self._create_student_page_map()

    def _merge_pdf(self, input_files) :
        source_path = self.temp_folder / f"merged_{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf"
        if len(input_files) > 1:
            merger = PdfMerger()
            for file in input_files :
                merger.append(file)
            merger.write(source_path)
            merger.close()
            self.logger.info("Merged PDF saved to: " + str(source_path))
            return fitz.open(source_path)
        else :
            return fitz.open(input_files[0])

    def _ensure_temp_folder(self, file : str):
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        temp_folder = Path(file).parent / f"scan_{timestamp}"

        def check_temp_folder_writable (folder) :
            try:
                temp_folder.mkdir(parents=True, exist_ok=True)
                with open(folder / "test.txt", "w") as f:
                    f.close()
                os.remove(folder / "test.txt")
                return True
            except Exception:
                return False
        
        while not temp_folder or not check_temp_folder_writable(temp_folder) :
            root = tk.Tk()
            root.withdraw()
            selected_folder = filedialog.askdirectory(title="Bitte wählen Sie einen temporären Ordner mit Schreibrechten")
            temp_folder = Path(selected_folder) if selected_folder else None

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
        # 1. Alert user if there are missing pages
        if hasattr(self, 'missing_pages') and self.missing_pages:
            warning_msg = f"Achtung: {len(self.missing_pages)} Seite(n) konnten keinem Schüler zugeordnet werden: {[p+1 for p in self.missing_pages]}. Bitte prüfen Sie die Zusammenfassung."
            self.logger.warning(warning_msg)
            try:
                root = tk.Tk()
                root.withdraw()
                messagebox.showwarning("Nicht zugeordnete Seiten", warning_msg)
                root.destroy()
            except Exception as e:
                pass
            
    def close(self):
        self.fitz_source_pdf.close()
        if self.temp_folder.exists() and self.temp_folder.is_dir():
            shutil.rmtree(self.temp_folder)
            
    def _extract_qr_code_from_page (self, page_number):
        img_cv = self._open_page_cv(page_number)
        detector = cv2.QRCodeDetector()
        (h,w) = img_cv.shape[:2]
        center = (w//2, h//2)

        if getattr(self, 'quick_and_dirty', False):
            angles = [0]
        else:
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
        filename = f"{self.temp_folder.parent}/summary-{time.strftime('%Y%m%d-%H%M%S')}.pdf"
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

        # 2. Add missing pages info to summary
        if hasattr(self, 'missing_pages') and self.missing_pages:
            elements.append(Spacer(1, 0.5*cm))
            missing_str = ', '.join(str(p+1) for p in self.missing_pages)
            elements.append(Paragraph(f"<b>Nicht zugeordnete Seiten:</b> {len(self.missing_pages)} Seite(n): {missing_str}", styles['Normal']))

        doc.build(elements)
        return filename
    
    def _create_preview_pdf(self, preview_pdf) :   
        filename = f"{self.temp_folder.parent}/preview-{time.strftime('%Y%m%d-%H%M%S')}.pdf"
        namepages_folder = str(self.temp_folder.parent / "namepages")
        os.makedirs(namepages_folder, exist_ok=True)
        merger = PdfMerger()
        for (student, path) in preview_pdf :
            name_pdf_path = os.path.join(namepages_folder, f"{student}_namepage.pdf")
            c = canvas.Canvas(name_pdf_path, pagesize=A4)
            c.setFont("Helvetica-Bold", 32)
            c.drawCentredString(A4[0]/2, A4[1]/2, f"Schüler/-in: {student.split('_')[0]}")
            c.save()
            merger.append(name_pdf_path)
            merger.append(path)

        if hasattr(self, 'missing_pages') and self.missing_pages:
            missing_name_pdf_path = os.path.join(namepages_folder, "missing_namepage.pdf")
            c = canvas.Canvas(missing_name_pdf_path, pagesize=A4)
            c.setFont("Helvetica-Bold", 32)
            c.drawCentredString(A4[0]/2, A4[1]/2, "Nicht eingelesene Seiten")
            c.save()
            merger.append(missing_name_pdf_path)

            for missing_page_num in self.missing_pages:
                temp_missing_pdf_path = os.path.join(namepages_folder, f"missing_page_{missing_page_num+1}.pdf")
                temp_pdf = fitz.open()
                temp_pdf.insert_pdf(self.fitz_source_pdf, from_page=missing_page_num, to_page=missing_page_num)
                temp_pdf.save(temp_missing_pdf_path)
                temp_pdf.close()
                merger.append(temp_missing_pdf_path)

        merger.write(filename)
        merger.close()
        self.logger.info("Preview PDF created: " + filename)
        shutil.rmtree(namepages_folder)
        return filename

    def get_preview_path(self) -> str:
        return self.preview_path

    def _create_student_pdf(self, student : str) -> int :
        output_pdf = fitz.open()
        pdf_manager = PdfManager()
        i=0

        while (i < len(self.student_page_map[student])):
            page = self.student_page_map[student][i]
            if not self.split_a3 or not page["size"] == "A3" or not i + 1 < len(self.student_page_map[student]):
                output_pdf.insert_pdf(self.fitz_source_pdf, from_page=page["page_num"], to_page=page["page_num"])
                i+=1
                continue

            next_page = self.student_page_map[student][i+1]
            if pdf_manager.is_splittable_pair(page, next_page) :
                self.logger.info(f"Pages {page['page_num']+1} and {next_page['page_num']+1} will be split.")
                (output_page4, output_page1) = pdf_manager.split_a3(self.fitz_source_pdf, page["page_num"])
                (output_page2, output_page3) = pdf_manager.split_a3(self.fitz_source_pdf, next_page["page_num"])

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
        student_folder = str(self.temp_folder) + "/" + student
        os.makedirs(student_folder, exist_ok=True)
        output_file_path = os.path.join(student_folder, f"{student}.pdf")
        output_pdf.save(output_file_path)
        output_pdf.close()
        return [num_pages, output_file_path]
            

    def _read_qr_codes(self) :
        pages_info = []
        total_pages = len(self.fitz_source_pdf)
        last_qr = None
        self.missing_pages = []
        pdf_manager = PdfManager()

        for page_num in range (total_pages) : 
            size = pdf_manager.detect_page_size(self.fitz_source_pdf[page_num])
            (qr, side) = self._extract_qr_code_from_page(page_num)
            if qr:
                page_info = {"page_num": page_num, "size": size, "status": "read", "value": qr, "side": side}
                pages_info.append(page_info)
                last_qr = qr

            elif self.two_page_scan :
                if not last_qr :
                    self.logger.error(f"Error on page {page_num+1} of merged PDF: There seem to be two consecutive pages without QR-code or the first page does not have a QR code.")
                    self.missing_pages.append(page_num)
                    continue
                page_info = {"page_num": page_num, "size": size, "status": "from_previous", "value": last_qr, "side": "none"}
                self.logger.info(f"No QR code on page {page_num+1} of merged PDF. Inferred from previous page.")
                pages_info.append(page_info)
                last_qr = None

            else : 
                self.logger.error(f"Read error: Page {page_num+1} has no QR-Code and option two_page_scan is not active.")
                self.missing_pages.append(page_num)
                continue
            
            if self.progress_callback:
                self.progress_callback((page_num+1)/total_pages)

        if len(self.missing_pages) > 0:
            self.logger.error("Some pages could not be assigned: " + str(self.missing_pages))
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

    