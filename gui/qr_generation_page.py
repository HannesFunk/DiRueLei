from tkinter import filedialog
from logic.qr_generator import QRGenerator
import customtkinter as ctk
import logging

## For logging
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
console = logging.StreamHandler()
console.setLevel(level=logging.DEBUG)
formatter =  logging.Formatter('%(levelname)s : %(message)s')
console.setFormatter(formatter)
logger.addHandler(console)

# Suppress debug/info logs from PIL and reportlab
logging.getLogger("PIL").setLevel(logging.WARNING)
logging.getLogger("reportlab").setLevel(logging.WARNING)


class QRGenerationPage(ctk.CTkFrame):
    def __init__(self, master, qr_generator : QRGenerator, back_callback=None, **kwargs):
        super().__init__(master, **kwargs)
        self.qr_generator = qr_generator
        self.back_callback = back_callback
        self.students = self.qr_generator.readData()
        self.students = self.qr_generator.sort_students(self.students)

        # Make main column and table row expandable
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(5, weight=1)

        self.label_title = ctk.CTkLabel(self, text="Einstellungen", font=("Arial", 16, "bold"))
        self.label_title.grid(row=0, column=0, padx=20, pady=20, sticky="w")

        copies_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.label1 = ctk.CTkLabel(copies_frame, text="Anzahl QR-Codes pro Schüler-/in:")
        self.label1.grid(row=0, column=0, sticky="w", padx=20)
        self.entry1 = ctk.CTkEntry(copies_frame, width=80, placeholder_text="1")
        self.entry1.grid(row=0, column=1, sticky="w")
        copies_frame.grid(row=1, column=0, sticky="w")

        self.check_offset = ctk.CTkCheckBox(self, text="Ersten QR-Code an bestimmter Position (nicht links oben) setzen", command=self.on_toggle_offset)
        self.check_offset.grid(row=2, column=0, padx=20, sticky="w", pady=(0,10))

        self.offset_details_frame = ctk.CTkFrame(self, fg_color="transparent")
        label_offset_row = ctk.CTkLabel(self.offset_details_frame, text="Zeile: ")
        label_offset_row.grid(row=0, column=0, padx=(20,10))
        self.entry_offset_row = ctk.CTkEntry(self.offset_details_frame, width=80)
        self.entry_offset_row.grid(row=0, column=1, padx=20)

        label_offset_col = ctk.CTkLabel(self.offset_details_frame, text="Spalte: ")
        label_offset_col.grid(row=0, column=2, padx=(20,10))
        self.entry_offset_col = ctk.CTkEntry(self.offset_details_frame, width=80)
        self.entry_offset_col.grid(row=0, column=3, padx=20)

        self.check_selection = ctk.CTkCheckBox(self, text="Nur für bestimmte Schüler-/innen QR-Codes erstellen", command=self.on_toggle_selection)
        self.check_selection.grid(row=4, column=0, padx=20, sticky="w", pady=(0,20))

        # === Scrollable table (initially hidden) ===
        self.table_frame = ctk.CTkScrollableFrame(self, label_text="Auswahl")

        self.generate_button = ctk.CTkButton(self, text="QR-Codes erzeugen", command=self.generate_qr)
        self.generate_button.grid(row=6, column=1, pady=(0,20))

        self.back_to_main_button = ctk.CTkButton(self, text="Zurück zur Hauptseite", command=self.back_to_main, 
                                                 fg_color="transparent", border_color="#888", border_width=1, text_color="#888")
        self.back_to_main_button.grid(row=6, column=0, pady=(0,20))

        self.populate_table() 

    def on_toggle_selection(self):
        if self.check_selection.get() :
            self.table_frame.grid(row=5, column=0, columnspan=5, sticky="nsew", padx=20, pady=(0, 10))
        else:
            self.table_frame.grid_forget()

    def on_toggle_offset (self) :
        if self.check_offset.get() :
            self.offset_details_frame.grid(row=3, column=0, columnspan=4, padx=(20,10), sticky="w")
        else :
            self.offset_details_frame.grid_forget()
    
    def back_to_main(self) : 
        if self.back_callback:
            self.pack_forget()
            self.back_callback()

    def populate_table(self):
        def check_all_none() :
            is_checked = self.check_all_none.get()
            for student in self.students :
                if is_checked : 
                    student["checkbox"].select()
                else :
                    student["checkbox"].deselect()

        self.check_all_none = ctk.CTkCheckBox(self.table_frame, text="Alle an-/abwählen", font=("Arial", 12, "italic"), command=check_all_none)
        self.check_all_none.select()
        self.check_all_none.grid(row=0, column=0, padx=5, pady=5, sticky="ew")

        for i, student in enumerate(self.students): 
            checkbox = ctk.CTkCheckBox(self.table_frame, text=student["name"])
            checkbox.select()
            checkbox.grid(row=i+1, column=0, padx=5, pady=2, sticky="ew")
            student["checkbox"] = checkbox

            self.table_frame.grid_columnconfigure(0, weight=1)

    def generate_qr(self) :
        default_file_name = self.qr_generator.default_file_name()

        output_file = filedialog.asksaveasfilename(defaultextension=".pdf", 
                        filetypes=[("PDF Files", "*.pdf")], initialfile=default_file_name)
        
        copies_input = self.entry1.get()
        if copies_input.isnumeric and len(copies_input) > 0 :
            copies = int(copies_input)
        else :
            copies = 1

        if self.check_offset.get() :
            offset = {
                'col': int(self.entry_offset_col.get()) if self.entry_offset_col.get().isnumeric else 0,
                'row': int(self.entry_offset_row.get()) if self.entry_offset_row.get().isnumeric else 0,
            }
        else :
            offset = False

        students_selected = []
        if self.check_selection.get() :
            students_selected = [student for student in self.students if student["checkbox"].get()]
        else :
            students_selected = self.students

        if not output_file:
            return
        try:
            self.qr_generator.generate_qr_pdf(students_selected, output_file, copies, offset)
        except Exception as e:
            logger.error(e)