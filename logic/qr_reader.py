import shutil
import cv2
from datetime import datetime
import fitz
import logging
import numpy as np
from pathlib import Path
from PyPDF2 import PdfMerger
import os
from PIL import Image
import zipfile

## For logging
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
console = logging.StreamHandler()
console.setLevel(level=logging.DEBUG)
formatter =  logging.Formatter('%(levelname)s : %(message)s')
console.setFormatter(formatter)
logger.addHandler(console)

class ExamReader : 
    def __init__(self, input_files : list[str], scan_options, progress_callback=None):
        self.input_files = input_files
        self.progress_callback = progress_callback
        self.split_a3 = scan_options["split_a3"] 
        self.two_page_scan = scan_options["two_page_scan"]

    ### First main method - processes data and should be accessed from other files ###
    def readFiles(self) :
        temp_string = f"temp_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}"
        temp_filename = temp_string + ".pdf"
        temp_path = Path(self.input_files[0]).with_name(temp_filename)
        temp_folder = Path(temp_path).parent / temp_string

        ## Merge Several files into one
        if len(self.input_files) > 1:
            merger = PdfMerger()
            for file in self.input_files :
                merger.append(file)
            merger.write(temp_path)
            merger.close()
            logging.info("Merged PDF saved to: " + str(temp_path))
            self.fitz_source_pdf = fitz.open(temp_path)
        else :
            self.fitz_source_pdf = fitz.open(self.input_files[0])

        self.pdf_page_array = self._read_qr_codes()

        self.student_array = self._create_student_array()
        self.temp_path = temp_path
        self.temp_folder = temp_folder

    ### Second main method - create the output ZIP ###
    def saveZipFile(self, output_path) : 
        self._create_zip_structure()

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf :
            for file in self.temp_folder.rglob('*'):
                zipf.write(file, file.relative_to(self.temp_folder))
        logging.info("ZIP file created: " + output_path)

    ### End processing ###
    def close(self):
        self.fitz_source_pdf.close()
        if os.path.exists(str(self.temp_path)):
            os.remove(str(self.temp_path))
        if self.temp_folder.exists() and self.temp_folder.is_dir():
            shutil.rmtree(self.temp_folder)
            
    
    # ### Private Methods ###

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
                logging.info("QR-Code on page " + str(page_number) + " read at angle " + str(angle) + ". Value: " + data)
                data = data + "_assignsubmission_file_"

                quad = points[0]

                cx = int(quad[:,0].mean())
                cy = int(quad[:,1].mean())

                # check left or right half
                side = "left" if cx < w/2 else "right"

                return (data, side)
            
        logging.warning("QR-Code on page " + str(page_number) + " could not be read.")
        return (None, None)
    
    def _create_zip_structure(self) :
        source_pdf = self.fitz_source_pdf
        temp_folder = self.temp_folder
        ordered_array = self.array

        logging.info("Order-Array: "+ str(ordered_array))

        for student_id in ordered_array:
            output_pdf = fitz.open()

            for page in ordered_array[student_id]:
                output_pdf.insert_pdf(source_pdf, from_page=page, to_page=page)

            student_folder = str(temp_folder) + "/"+student_id
            os.makedirs(student_folder, exist_ok=True)
            output_file_path = os.path.join(student_folder, f"{student_id}.pdf")

            logging.info("Saving PDF" + output_file_path)
            output_pdf.save(output_file_path)

    def _split_a3_doc (self, doc_path) :
        doc = fitz.open(doc_path)
        page_sizes = self._detect_page_sizes(doc)
       
        a3_doc = fitz.open()
        for page_num in page_sizes["A3"] :
            a3_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)

        a3_doc.save(os.join(self.temp_folder,"a3_doc.pdf")) # maybe we don't even need to save this?

        doc.close()

            

    def _read_qr_codes(self) :
        pages_info = []
        doc = self.fitz_source_pdf
        total_pages = len(self.fitz_source_pdf)
        last_qr = None

        for page_num in range (total_pages) : 
            size = self._detect_page_size(doc, page_num)
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
                logger.info(f"Page {page_num+1} read: {qr}")

            elif self.two_page_scan :
                if not last_qr :
                    logger.error(f"Error on page {page_num+1}: There seem to be two consecutive pages without QR-code or the first page does not have a QR code.")
                    return False
                page_info = {"page_num": page_num,
                             "size": size,
                             "status": "from_previous",
                             "value": last_qr, 
                             }
                pages_info.append(page_info)
                last_qr = None

            else : 
                logger.error(f"Read error: Page {page_num+1} has no QR-Code and option two_page_scan is not active.")
                return False
            
            if self.progress_callback:
                self.progress_callback((page_num+1)/total_pages)

        return pages_info
            

    def _create_student_array(self) :
        students = {}
        for page in self.pdf_page_array :
            if not page["value"] in students :
                students[page["value"]] = []

            students[page["value"]].append(page)
        return students


    def _detect_page_size (self, doc, page_num) :
        page = doc[page_num]
        width, height = page.rect.width, page.rect.height
        logger.debug(f"Page: {width:.2f} x {height:.2f} pt")

        if self._is_a4(width, height):
            return "A4"
        elif self._is_a3(width, height):
            return "A3"
        else:
            return "other"



    def _detect_page_sizes(self, doc) :
        a3_pages = []
        a4_pages = []
        other_pages = [] 
        for i, page in enumerate(doc):
            width, height = page.rect.width, page.rect.height
            logger.debug(f"Page {i+1}: {width:.2f} x {height:.2f} pt")

            if self._is_a4(width, height):
                a4_pages.append(i)
            elif self.is_a3(width, height):
                a3_pages.append(i)
            else:
                other_pages.append(i)

        return {
            "A4": a4_pages,
            "A3": a3_pages,
            "other": other_pages
            }

    def _is_a4(self, w, h):
        return self._is_close(w, 595) and self._is_close(h, 842) or self._is_close(w, 842) and self._is_close(h, 595)

    def _is_a3(self, w, h):
        return self._is_close(w, 842) and self._is_close(h, 1191) or self._is_close(w, 1191) and self._is_close(h, 842)

    def _is_close(self, a, b, tol=5):
        return abs(a - b) < tol



