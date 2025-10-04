import customtkinter as ctk
import os
from tkinter import filedialog
from logic.qr_generator import QRGenerator
from gui.qr_generation_page import QRGenerationPage
from gui.scan_page import ScanPage

class NumberedBox(ctk.CTkFrame):
    def __init__(self, master, number: int, headline: str, text: str, button_text="", button_command=None, **kwargs):
        super().__init__(master, **kwargs)
        self.configure(height=100)
        self.grid_columnconfigure(1, weight=1)
        circle = ctk.CTkLabel(self, text=str(number), width=40, height=40,
                              font=("Arial", 16, "bold"), corner_radius=20, fg_color="#3366cc", text_color="white")
        circle.grid(row=0, column=0, rowspan=3, padx=10, pady=10)
        headline_label = ctk.CTkLabel(self, text=headline, font=("Arial", 14, "bold"))
        headline_label.grid(row=0, column=1, sticky="w", pady=(10, 0))
        text_label = ctk.CTkLabel(self, text=text, font=("Arial", 12))
        text_label.grid(row=1, column=1, sticky="w", pady=(0, 10))

        if button_text != "" and button_command:
            button = ctk.CTkButton(self, text=button_text, command=button_command)
            button.grid(row=0, column=2, padx=10, pady=10)

    
class MainPage(ctk.CTkFrame):
    def __init__(self, master):
        super().__init__(master, bg_color="transparent", fg_color="transparent")
        self.master = master
        self.csv_path = None
        self.pack(fill="both", expand=True, padx=20, pady=20)

        def open_instructions() :
            instructions_path = os.path.join(os.path.dirname(__file__), "instructions.pdf")
            try:
                os.startfile(instructions_path)
            except AttributeError:
                import subprocess
                subprocess.Popen(["open", instructions_path])

        box1 = NumberedBox(self, number=1, headline="Abgabe im Mebis-Kurs erstellen", text="Bitte mit den Einstellungen aus der Anleitung eine Abgabe im Mebis-Kurs einrichten.", button_text="Anleitung", button_command=open_instructions)
        box1.pack(fill="both", expand=True, pady=(0, 10))

        box2 = NumberedBox(self, number=2, headline="QR-Codes erzeugen", text="Bitte CSV-Datei gemäß der Anleitung auswählen. QR-Codes werden dann als PDF-Datei erzeugt.", button_text=".csv auswählen", button_command=self.select_csv)
        box2.pack(fill="both", expand=True, pady=(0, 10))

        box3 = NumberedBox(self, number=3, headline="LN bekleben und scannen", text="Auf jeder Seite genau einen QR-Code anbringen")
        box3.pack(fill="both", expand=True, pady=(0, 10))

        box4 = NumberedBox(self, number=4, headline="Scan ", text="Gescannte Datei(en) auswählen", button_text="Scan(s) auswählen", button_command=self.select_scan_files)
        box4.pack(fill="both", expand=True)
        

    def select_csv(self) :
        path = filedialog.askopenfilename(filetypes=[("CSV Files", "*.csv")])
        if not path:
            return
        
        qr_generator = QRGenerator(path)
        for child in self.master.winfo_children():
            child.pack_forget()

        self.qr_generation_page = QRGenerationPage(self.master, qr_generator, back_callback=self.back_to_main)
        self.qr_generation_page.pack(fill="both", expand=True)

    def back_to_main(self):
        if hasattr(self, 'qr_generation_page'):
            self.qr_generation_page.pack_forget()
        if hasattr(self, 'scan_page'):
            self.scan_page.pack_forget()
        self.pack(fill="both", expand=True, padx=20, pady=20)


    def select_scan_files(self):
        input_files = filedialog.askopenfilenames(filetypes=[("PDF files", "*.pdf")])
        if not input_files:
            return
        
        for child in self.master.winfo_children():
            child.pack_forget()
        self.scan_page = ScanPage(self.master, input_files, back_callback=self.back_to_main)
        self.scan_page.pack(fill="both", expand=True)



