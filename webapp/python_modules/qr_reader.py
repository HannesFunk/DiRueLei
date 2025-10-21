import io
import zipfile
import time
from datetime import datetime
import fitz
import cv2
import js
import asyncio
import traceback
import numpy as np
from PyPDF2 import PdfMerger
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

class ExamReader : 
    def __init__(self, pdf_files_data, scan_options):
            
        options_dict = scan_options.to_py()
        self.split_a3 = options_dict.get("split_a3", False)
        self.two_page_scan = options_dict.get("two_page_scan", False)
        self.quick_and_dirty = options_dict.get("quick_and_dirty", False)
            
        self.pdf_files_data = pdf_files_data
        
        self.summary = []
        self.missing_pages = []
        self.log_callback = None  # Will be set by caller (main thread or worker)
        self.progress_callback = None  # Will be set by caller

        self.logMsg("Reader initialized", "success")

        self.fitz_source_pdf = self._merge_pdf(pdf_files_data)
        self.in_memory_files = {} 

    def logMsg(self, msg, type="info"):
        # Use callback if available (worker mode), otherwise use DOM (main thread mode)
        if self.log_callback:
            self.log_callback(msg, type)
        else:
            try:
                outputDiv = js.document.getElementById("scan-output")
                msgElement = js.document.createElement('div')
                msgElement.classList.add("status-output")
                msgElement.classList.add(type)
                msgElement.innerText = msg
                outputDiv.appendChild(msgElement)
                outputDiv.scrollTop = outputDiv.scrollHeight
            except:
                # Fallback if DOM not available
                print(f"[{type}] {msg}")
        
    async def logMsg_async(self, msg, type="info"):
        self.logMsg(msg, type)
        await asyncio.sleep(0)

    async def update_progress (self, percentage) :
        if self.progress_callback:
            self.progress_callback(percentage)
        await asyncio.sleep(0)

    async def process(self) -> bool:
        # progress_callback should be set by caller before calling process()
        try:
            self.pdf_page_array = await self._read_qr_codes()
            self.student_page_map = self._create_student_page_map()

            self.saveZipFile()
            await self.update_progress(1)
            return True

        except Exception as e:
            self.logMsg(f"Error: {str(e)}, Stack Trace: {traceback.format_exc()}")
            return False


    def _merge_pdf(self, input_files) :
        input_files = input_files.to_py()
        self.logMsg("Input files converted for Python.", "success")
        
        merger = PdfMerger()
        for file in input_files :
            try:
                # File object with binary data
                file_data = file['data']
                if hasattr(file_data, 'to_py'):
                    # Convert Pyodide object to Python
                    file_data = file_data.to_py()
                file_buffer = io.BytesIO(bytes(file_data))
                merger.append(file_buffer)
                self.logMsg(f"Added file {file.get('name', 'unknown')} to merger", "debug")
            except Exception as e:
                self.logMsg(f"Error processing file in merger: {str(e)}", "error")
                continue
        
        merged_buffer = io.BytesIO()
        merger.write(merged_buffer)
        merger.close()
        merged_buffer.seek(0)
        self.logMsg("PDFs merged in memory", "success")
        return fitz.open(stream=merged_buffer.getvalue(), filetype="pdf")

    def saveZipFile(self) : 
        self.summary = []
        preview_pdf = []
        for student in self.student_page_map :
            num_pages, student_file_data = self._create_student_pdf(student)
            self.summary.append({
                "Schüler/-in": student.split("_")[0], 
                "Anzahl Seiten": num_pages}
            )
            preview_pdf.append([student, student_file_data])
        self.summary_data = self._create_summary(preview_pdf)

        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf :
            for file_path, file_data in self.in_memory_files.items():
                zipf.writestr(file_path, file_data)
        
        zip_buffer.seek(0)
        self.zip_data = zip_buffer.getvalue()
        
        self.logMsg("ZIP file created in memory", "info")
        self.logMsg(f"Done. Created output for {len(self.student_page_map)} students.", "info")
        # 1. Alert user if there are missing pages
        if hasattr(self, 'missing_pages') and self.missing_pages:
            warning_msg = f"Achtung: {len(self.missing_pages)} Seite(n) konnten keinem Schüler zugeordnet werden: {[p+1 for p in self.missing_pages]}. Bitte Zusammenfassung prüfen."
            self.logMsg(warning_msg, "warning")
        
        return self.zip_data
    
    def get_zip_bytes(self):
        if hasattr(self, 'zip_data'):
            return self.zip_data
        else:
            self.logMsg("No ZIP data available. Call saveZipFile() first.", "error")
            return None
            
    def close(self):
        self.fitz_source_pdf.close()
        self.in_memory_files.clear()
            
    async def _extract_qr_code_from_page (self, page_number):
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
            
            await self.logMsg_async(f"QR-Code on page {page_number+1} read. Student: {data.split('_')[0]}{f' (angle {angle})' if angle != 0 else ''}", "info")
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
        
    
    def get_summary_bytes(self) -> bytes:
        return self.summary_data
    
    def _fitz_add_data(self, total_fitz, pdf_data) :
        fitz_add = fitz.open(stream=pdf_data, filetype="pdf")
        total_fitz.insert_pdf(fitz_add, from_page=0, to_page=len(fitz_add))
        fitz_add.close()
    
    def _create_summary (self, preview_pdf) :
        summary = self.summary
        summary_title_data = self._build_summary_page()
        summary_fitz = fitz.open()
        self._fitz_add_data(summary_fitz, summary_title_data)

        if hasattr(self, 'missing_pages') and self.missing_pages:
            missing_name_buffer = io.BytesIO()
            c = canvas.Canvas(missing_name_buffer, pagesize=A4)
            c.setFont("Helvetica-Bold", 32)
            c.drawCentredString(A4[0]/2, A4[1]/2, "Nicht eingelesene Seiten")
            c.save()
            missing_name_buffer.seek(0)
            self._fitz_add_data(summary_fitz, missing_name_buffer.getvalue())

            for missing_page_num in self.missing_pages:
                summary_fitz.insert_pdf(self.fitz_source_pdf, from_page=missing_page_num, to_page=missing_page_num)

        for (student, pdf_data) in preview_pdf :
            name_page_buffer = io.BytesIO()
            c = canvas.Canvas(name_page_buffer, pagesize=A4)
            c.setFont("Helvetica-Bold", 32)
            c.drawCentredString(A4[0]/2, A4[1]/2, f"Schüler/-in: {student.split('_')[0]}")
            c.save()
            name_page_buffer.seek(0)
            self._fitz_add_data(summary_fitz, name_page_buffer.getvalue())
            self._fitz_add_data(summary_fitz, pdf_data)

        summary_buffer = io.BytesIO()
        summary_fitz.save(summary_buffer)
        summary_fitz.close()
        summary_buffer.seek(0)
        summary_data = summary_buffer.getvalue()
        
        # Store in in_memory_files for ZIP creation
        self.in_memory_files["summary.pdf"] = summary_data
        self.logMsg("Summary PDF created in memory", "info")
        return summary_data
        
    
    def _build_summary_page (self):
        summary = self.summary
        output_buffer = io.BytesIO()
        doc = SimpleDocTemplate(output_buffer, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        title = Paragraph("Zusammenfassung", styles['Title'])
        elements.append(title)
        elements.append(Spacer(1, 0.5*cm))
        
        num_students = len(self.student_page_map) if hasattr(self, 'student_page_map') else 0
        elements.append(Paragraph(f"<b>Anzahl Schüler/-innen:</b> {num_students}", styles['Normal']))
        elements.append(Spacer(1, 0.3*cm))

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

        elements.append(Spacer(1, 0.5*cm))

        # 2. Add missing pages info to summary
        if hasattr(self, 'missing_pages') and self.missing_pages:
            missing_str = ', '.join(str(p+1) for p in self.missing_pages)
            elements.append(Paragraph(f"<b>Nicht zugeordnete Seiten:</b> {len(self.missing_pages)} Seite(n): {missing_str}", styles['Normal']))
        else :
            elements.append(Paragraph(f"<b>Alle Seiten zugeordnet.</b>", styles['Normal']))

        doc.build(elements)
        output_buffer.seek(0)
        return output_buffer.getvalue()
    
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
                self.logMsg(f"Pages {page['page_num']+1} and {next_page['page_num']+1} will be split.", "info")
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
        # Format: Participant_6028356_assignsubmission_file_
        student_id = student.split("_")[1]
        student_folder = "Participant_" + student_id + "_assignsubmission_file_"
        
        # Save to memory buffer instead of file
        output_buffer = io.BytesIO()
        output_pdf.save(output_buffer)
        output_pdf.close()
        output_buffer.seek(0)
        pdf_data = output_buffer.getvalue()
        
        # Store in in_memory_files for ZIP creation
        output_file_path = f"{student_folder}/{student}.pdf"
        self.in_memory_files[output_file_path] = pdf_data
        
        return [num_pages, pdf_data]
            

    async def _read_qr_codes(self) :
        pages_info = []
        total_pages = len(self.fitz_source_pdf)
        last_qr = None
        self.missing_pages = []
        pdf_manager = PdfManager()

        for page_num in range (total_pages) : 
            size = pdf_manager.detect_page_size(self.fitz_source_pdf[page_num])
            (qr, side) = await self._extract_qr_code_from_page(page_num)
            if qr:
                page_info = {"page_num": page_num, "size": size, "status": "read", "value": qr, "side": side}
                pages_info.append(page_info)
                last_qr = qr

            elif self.two_page_scan :
                if not last_qr :
                    self.logMsg_async(f"Error on page {page_num+1} of merged PDF: There seem to be two consecutive pages without QR-code or the first page does not have a QR code.", "error")
                    self.missing_pages.append(page_num)
                    continue
                page_info = {"page_num": page_num, "size": size, "status": "from_previous", "value": last_qr, "side": "none"}
                await self.logMsg_async(f"No QR code on page {page_num+1} of merged PDF. Inferred from previous page.", "info")
                pages_info.append(page_info)
                last_qr = None

            else : 
                await self.logMsg_async(f"Read error: Page {page_num+1} has no QR-Code and option two_page_scan is not active.", "error")
                self.missing_pages.append(page_num)
                continue
            
            if self.progress_callback:
                await self.update_progress((page_num+1)/(total_pages+1))

        if len(self.missing_pages) > 0:
            await self.logMsg_async("Some pages could not be assigned: " + str([i+1 for i in self.missing_pages]), "error")
        else :
            await self.logMsg_async("All QR codes read.", "info")
        return pages_info
    
            
    def _create_student_page_map(self) :
        students = {}
        for page in self.pdf_page_array :
            if not page["value"] in students :
                students[page["value"]] = []

            students[page["value"]].append(page)
        return students



class PdfManager : 
    def __init__ (self):
        pass

    def detect_page_size (self, page) :
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
    
    def is_splittable_pair(self, page1, page2) -> bool : 
        return (page1["status"] == "read" and
            (page1["side"] == "left" and page2["side"] == "right") or (page2["side"] == "none"))
       
    def split_a3(self, fitz_pdf, page_num) :
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