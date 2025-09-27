import csv
import io
import re
from PIL import Image
import qrcode
from reportlab.pdfgen import canvas        
from reportlab.lib.pagesizes import A4        
from reportlab.lib.units import cm   
from reportlab.lib.utils import ImageReader
import os

class QRGenerator:
    def __init__(self, csv_path: str):
        self.csv_file = open(csv_path, newline='', encoding='utf-8')
        class_string = re.search(r"_\d{1,2}[a-z]_", csv_path)
        self.class_guessed = None if class_string == None else class_string.group().replace("_", "")

    def readData(self) -> list:
        students = []
        reader = csv.DictReader(self.csv_file, delimiter=',')
        string_id = reader.fieldnames[0]
        for row in reader:
            row[string_id] = row[string_id].replace("Teilnehmer/in", "")
            students.append({
                'id': row[string_id],
                'name': row['Vollständiger Name']
            })
        return students
    
    def create_qr_image(self, id: str, name: str) -> Image.Image:
        qr = qrcode.QRCode(
            version=1, box_size=10, border=2
        )
        qr.add_data(name + "_" + id)
        qr.make(fit=True)
        img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")

        # Resize to 3cm x 3cm at 300 DPI
        qr_size_px = int((3 / 2.54) * 300) 
        img_qr = img_qr.resize((qr_size_px, qr_size_px), Image.LANCZOS)

        return img_qr
    
    def generate_qr_pdf(self, students: list[dict], output_file: str, copies : int = 1, offset_array = False):
        _, page_height = A4
        c = canvas.Canvas(output_file, pagesize=A4, bottomup=0)

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

        offset = 0
        if offset_array != False :
            offset = (offset_array['row'] - 1)*page_specs['num_cols'] + offset_array['col'] - 1
        
        if copies != 1 :
            students = self.multiply_students(students, copies)

        page_specs["qr_per_page"] = page_specs["num_rows"]*page_specs["num_cols"]
        x_start = page_specs["margin-left"] + (page_specs["col_width"]-page_specs["qr_size"])/2
        y_start = page_specs["margin-top"] + (page_specs["row_height"]-page_specs["qr_size"]- 0.5 * cm)/2

        for i, student in enumerate(students):
            qr_img = self.create_qr_image(student["id"], student["name"])

            img_buffer = io.BytesIO()
            qr_img.save(img_buffer, format="PNG")
            img_buffer.seek(0)
            img_reader= ImageReader(img_buffer)

            pos_number = i + offset
                        
            col = pos_number % page_specs["num_cols"]
            row = (pos_number // page_specs["num_cols"]) % page_specs["num_rows"]

            if pos_number != 0 and pos_number % page_specs["qr_per_page"] == 0:
                c.showPage()

            x = x_start + page_specs["col_width"] * col + page_specs["col_sep"]*col
            y = y_start + row * page_specs["row_height"] + row * page_specs["row_sep"]

            c.drawImage(img_reader, x, y, page_specs["qr_size"], page_specs["qr_size"])
            font_size = 10
            c.setFont("Helvetica", font_size)

            # Text position: horizontally center under the QR
            text_x = x + (page_specs["qr_size"] / 2)
            text_y = y + page_specs["qr_size"] + 12  # adjust vertical spacing

            name_to_print = student["name"]

            if c.stringWidth(name_to_print, "Helvetica", font_size) > (page_specs["col_width"] - 0.3*cm) :
                names = student["name"].split()

                for i, name in enumerate(names) :
                    if i == 0 :
                        name_to_print = name
                        continue
                    
                    name_to_print = name_to_print + " " + name[0] + "."

            c.drawCentredString(text_x, text_y, name_to_print)

        c.save()
        # Open the generated PDF file with the default application
        try:
            os.startfile(output_file)
        except AttributeError:
            import subprocess
            subprocess.Popen(["open", output_file])

    def sort_students (self, students : list[dict]) -> list[dict]: 
        def extract_last_name (student : dict) -> str:
            full_name = student['name']
            parts = full_name.strip().split()
            return parts[1] if len(parts) >= 2 else parts[0]
        
        return sorted(students, key=extract_last_name)

    def multiply_students (self, students : list[dict], repeat : int = 1) :
        result = []
        for student in students :
            result.extend([student] * repeat)
        return result
    
    def default_file_name(self) : 
        return "QR-Codes"  if self.class_guessed == None else "QR-Codes-" + self.class_guessed