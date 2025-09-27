from tkinter import filedialog
import customtkinter as ctk
import logging
import threading
from logic.qr_reader import ExamReader
from gui.textbox_logger import TextboxLogger
import os

## For logging
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
console = logging.StreamHandler()
console.setLevel(level=logging.DEBUG)
formatter =  logging.Formatter('%(levelname)s : %(message)s')
console.setFormatter(formatter)
logger.addHandler(console)

class ScanPage(ctk.CTkFrame):
    def __init__(self, main_page, input_files : list[str], back_callback):
        super().__init__(main_page.master)
        self.main_process = main_page.master
        self.main_page = main_page
        self.input_files = input_files
        label_title = ctk.CTkLabel(self, text="PDF Scan Einstellungen", font=("Arial", 16, "bold"))
        label_title.pack(pady=(20,10), anchor="w", padx=20)

        self.two_page_scan = ctk.BooleanVar(value=False)
        checkbox_two_page_scan = ctk.CTkCheckBox(self, text="Automatisch zweiseitiger Scan", variable=self.two_page_scan)
        checkbox_two_page_scan.select()
        checkbox_two_page_scan.pack(anchor="nw", pady=5, padx=(20,10))
        explainer_two_page_scan = ctk.CTkTextbox(self, font=("Arial", 13, "italic"), fg_color="transparent", height=60, wrap="word")
        explainer_two_page_scan.insert("end", text="Das bedeutet: Es genügt, dass sich jeweils auf der ersten von zwei Seiten ein QR-Code befindet. Die folgende Seite ohne QR-Code wird automatisch demselben Schüler zugeordnet. Details siehe Dokumentation.")
        explainer_two_page_scan.configure(state="disabled")
        explainer_two_page_scan.pack(anchor="nw", padx=(50,20), fill="x", expand=True)


        self.split_a3 = ctk.BooleanVar(value=False)
        checkbox_split_a3 = ctk.CTkCheckBox(self, text="A3 automatisch teilen", variable=self.split_a3)
        checkbox_split_a3.select()
        checkbox_split_a3.pack(anchor="nw", pady=5, padx=(20,10))
        explainer_split_a3 = ctk.CTkTextbox(self, font=("Arial", 13, "italic"), fg_color="transparent", height=60, wrap="word")
        explainer_split_a3.insert("end",  text="Das bedeutet: A3 Seiten werden in zwei A4 Seiten geteilt. Bei Bögen muss dazu der QR-Code auf dem Doppelbogen 1/4 ('außen') recht, der für Seiten 2/3 ('innen') rechts angebracht sein. Kann mit zweiseitigem Scan kombiniert werden.")
        explainer_split_a3.configure(state="disabled")
        explainer_split_a3.pack(anchor="nw", padx=(50,20), fill="x", expand=True)

        self.progress_bar = ctk.CTkProgressBar(self)
        self.progress_bar.pack(fill="x", expand=True, padx=20)
        self.progress_bar.set(0)

        log_textarea = ctk.CTkTextbox(self, font=("Arial", 13, "italic"), fg_color="transparent", height=120, wrap="word")
        log_textarea.configure(state="disabled")
        log_textarea.pack(anchor="nw", padx=(50,20), fill="x", expand=True)
        
        self.logger = TextboxLogger(log_textarea)


        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.back_btn = ctk.CTkButton(btn_frame, text="Zurück zur Hauptseite", command=back_callback, fg_color="transparent", border_color="#888", border_width=1, text_color="#888")
        self.back_btn.pack(side="left", padx=(0,10), expand=True, fill="x")
        self.summary_btn = ctk.CTkButton(btn_frame, text="Zusammenfassung anzeigen", command=self.summary)
        self.summary_btn.pack(side="left", padx=(10,0), expand=True, fill="x")
        self.summary_btn.configure(state="disabled")
        self.start_btn = ctk.CTkButton(btn_frame, text="PDFs einlesen", command=self.read_pdf)
        self.start_btn.pack(side="left", padx=(10,0), expand=True, fill="x")
        btn_frame.pack(fill="x", padx=20, pady=20)


    def read_pdf(self) :
        def process_files() :
            try :
                scan_options = {
                    "split_a3": self.split_a3,
                    "two_page_scan": self.two_page_scan
                }
                reader = ExamReader(self.input_files, scan_options, self.logger, self.update_progress)
                reader.readFiles()
                output_path = filedialog.asksaveasfilename(defaultextension=".zip", filetypes=[("ZIP-Dateien", "*.zip")])
                if output_path:
                    reader.saveZipFile(output_path)
                self.summary_path = reader.get_summary_path()
                reader.close()
                self.summary_btn.configure(state="normal")
            except Exception as e:
                    self.logger.error(f"Error during PDF reading: {e}")
                    self.logger.exception(e)

        threading.Thread(target=process_files).start()
        return
    
    def summary(self):
        if not self.summary_path:
            return False
        try:
            os.startfile(self.summary_path)
        except AttributeError:
            import subprocess
            subprocess.Popen(["open", self.summary_path])

            
    
    def update_progress(self, percentage) : 
         self.progress_bar.set(percentage)
    

