import csv
import io
import re
from PIL import Image
import qrcode
from reportlab.pdfgen import canvas        
from reportlab.lib.pagesizes import A4        
from reportlab.lib.units import cm   
from reportlab.lib.utils import ImageReader

class QRGenerator:
    def __init__(self, csv_content, file_name):
        students = []
        csv_reader = csv.DictReader(io.StringIO(csv_content), delimiter=',')
        string_id = csv_reader.fieldnames[0]
        string_name = csv_reader.fieldnames[1]

        for row in csv_reader:
            row[string_id] = row[string_id].replace("Teilnehmer/in", "")
            students.append({
                'id': row[string_id],
                'name': row[string_name]
            })

        self.students = self.sort_students(students)
        self.class_name = self._guess_class_from_filename(file_name)
    
    def get_students(self):
        return self.students
    
    def set_students(self, students_list):
        """Set a filtered list of students for PDF generation"""
        self.students = students_list
    
    def get_filename(self):
        return "QR-Codes" + self.class_name + ".pdf"

    def _guess_class_from_filename(self, file_name) :
        class_string = re.search(r"_\d{1,2}[a-z]_", file_name)
        if class_string == None :
            return ""
        else :
            return "_" + class_string.group().replace("_", "")

    def create_qr_image(self, id, name):
        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(name + "_" + id)
        qr.make(fit=True)
        img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        qr_size_px = int((3 / 2.54) * 300) 
        img_qr = img_qr.resize((qr_size_px, qr_size_px), Image.LANCZOS)
        return img_qr
    
    def generate_qr_pdf_bytes(self, copies=1, offset_row=1, offset_col=1):
        try:
            python_students = self.students
            
            # Validate we have students
            if not python_students:
                raise ValueError("No students data available for PDF generation")
            
            _, page_height = A4
            buffer = io.BytesIO()
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

            offset = (offset_row - 1) * page_specs['num_cols'] + offset_col - 1
            
            if copies != 1:
                python_students = self._repeat_array(python_students, copies)

            page_specs["qr_per_page"] = page_specs["num_rows"] * page_specs["num_cols"]
            x_start = page_specs["margin-left"] + (page_specs["col_width"] - page_specs["qr_size"]) / 2
            y_start = page_specs["margin-top"] + (page_specs["row_height"] - page_specs["qr_size"] - 0.5 * cm) / 2

            if not python_students:
                c.showPage()
            
            for i, student in enumerate(python_students):
                try:
                    qr_img = self.create_qr_image(student["id"], student["name"])
                    img_buffer = io.BytesIO()
                    qr_img.save(img_buffer, format="PNG")
                    img_buffer.seek(0)
                    img_reader = ImageReader(img_buffer)

                    pos_number = i + offset
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

                    name_to_print = str(student["name"])  # Ensure string
                    if c.stringWidth(name_to_print, "Helvetica", font_size) > (page_specs["col_width"] - 0.3 * cm):
                        names = student["name"].split()
                        for j, name in enumerate(names):  # Changed i to j to avoid conflict
                            if j == 0:
                                name_to_print = name
                                continue
                            name_to_print = name_to_print + " " + name[0] + "."

                    c.drawCentredString(text_x, text_y, name_to_print)
                    
                    # Close image buffer
                    img_buffer.close()
                    
                except Exception as e:
                    print(f"Error processing student {student.get('name', 'unknown')}: {str(e)}")
                    continue  # Skip this student and continue with others

            # Ensure the PDF is properly finalized
            c.save()
            
            # Get the PDF bytes
            pdf_bytes = buffer.getvalue()
            buffer.close()
            
            if len(pdf_bytes) == 0:
                raise ValueError("Generated PDF is empty")
                
            return pdf_bytes
            
        except Exception as e:
            print(f"Error generating PDF: {str(e)}")
            raise

    def sort_students(self, students_unsorted):
        def extract_last_name(student):
            full_name = student['name']
            parts = full_name.strip().split()
            return parts[1] if len(parts) >= 2 else parts[0]
        
        return sorted(students_unsorted, key=extract_last_name)

    def _repeat_array(self, array, number_copies=1):
        result = []
        for element in array:
            result.extend([element] * number_copies)
        return result