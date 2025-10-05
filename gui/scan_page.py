from tkinter import filedialog
import customtkinter as ctk
import threading
from logic.qr_reader import ExamReader
from gui.textbox_logger import TextboxLogger
import os
from pathlib import Path

class ScanPage(ctk.CTkFrame):
    def __init__(self, master, input_files : list[str], back_callback):
        super().__init__(master)
        self.master = master
        self.input_files = input_files

        label_title = ctk.CTkLabel(self, text="PDF Scan Einstellungen", font=("Arial", 16, "bold"))
        label_title.pack(pady=(20,10), anchor="w", padx=20)

        self.two_page_scan = ctk.BooleanVar(value=False)
        self.add_checkbox_with_explainer(self, "Zweiseitiger Scan", self.two_page_scan, "Das bedeutet: Es genügt, dass sich jeweils auf der ersten von zwei Seiten ein QR-Code befindet. Die folgende Seite ohne QR-Code wird automatisch demselben Schüler zugeordnet.")
                                         
        self.split_a3 = ctk.BooleanVar(value=False)
        self.add_checkbox_with_explainer(self, "A3-Bögen teilen", self.split_a3, "Das bedeutet: A3 Seiten werden in zwei A4 Seiten geteilt. Der QR-Code muss dabei außen angebracht sein." \
        "" \
        "Wer unbedingt innen und außen einen QR-Code aufkleben möchte: dann bitte innen links (Seite 2) und außen rechts (Seite 4).")

        self.quick_and_dirty = ctk.BooleanVar(value=False)
        self.add_checkbox_with_explainer(self, "Quick and dirty", self.quick_and_dirty, "Das bedeutet: Auf der Folgeseite einer Seite mit QR-Code wird nur oberflächlich nach einem neuen Code gesucht und diese schneller gescannt und dem vorherigen zugeordnet. (Obacht!)", enabled=False)

        self.progress_bar = ctk.CTkProgressBar(self)
        self.progress_bar.pack(fill="x", expand=True, padx=20)
        self.progress_bar.set(0)

        log_textarea = ctk.CTkTextbox(self, font=("Arial", 13, "italic"), fg_color="transparent", height=120, wrap="word", border_color="grey", border_width=1)
        log_textarea.configure(state="disabled")
        log_textarea.pack(anchor="nw", padx=(50,20), fill="x", expand=True)
        
        self.logger = TextboxLogger(log_textarea)

        btn_frame = ctk.CTkFrame(self, fg_color="transparent")

        self.back_btn = ctk.CTkButton(btn_frame, text="Zurück zur Hauptseite", command=back_callback, fg_color="transparent", border_color="#888", border_width=1, text_color="#1f6aa5", hover_color="#888")
        self.back_btn.pack(side="left", padx=(0,10), expand=True, fill="x")

        self.summary_btn = ctk.CTkButton(btn_frame, text="Zusammenfassung anzeigen", command=self.summary, fg_color="transparent", border_color="#888", border_width=1, text_color="#1f6aa5")
        self.summary_btn.pack(side="left", padx=(10,0), expand=True, fill="x")
        self.summary_btn.configure(state="disabled")

        self.start_btn = ctk.CTkButton(btn_frame, text="PDFs einlesen", command=self.read_pdf)
        self.start_btn.pack(side="left", padx=(10,0), expand=True, fill="x")

        btn_frame.pack(fill="x", padx=20, pady=20)


    def read_pdf(self) :
        # Ask for output path in main thread
        output_path = filedialog.asksaveasfilename(defaultextension=".zip", filetypes=[("ZIP-Dateien", "*.zip")])
        if not output_path:
            return
        def process_files() :
            try :
                scan_options = {
                    "split_a3": self.split_a3.get(),
                    "two_page_scan": self.two_page_scan.get(),
                    "quick_and_dirty": self.quick_and_dirty.get()
                }
                reader = ExamReader(self.input_files, scan_options, self.logger, self.update_progress)
                reader.readFiles()
                reader.saveZipFile(output_path)
                self.summary_path = reader.get_summary_path()
                reader.close()
                if self.summary_path :
                    self.master.add_temp_folder(Path(self.summary_path).parent)
                    self.summary_btn.configure(state="normal")

            except Exception as e:
                    self.logger.error(f"Error during PDF reading: {e}")
                    self.logger.exception(e)

        threading.Thread(target=process_files).start()
        return
    
    def add_checkbox_with_explainer(self, parent, text, variable, explainer_text="", enabled=True):
        checkbox = ctk.CTkCheckBox(parent, text=text, variable=variable)
        if enabled :
            checkbox.select()
        checkbox.pack(anchor="nw", pady=5, padx=(20,10))
        if explainer_text == "" :
            return checkbox, None
        
        explainer = ctk.CTkTextbox(parent, font=("Arial", 13, "italic"), fg_color="transparent", height=60, wrap="word")
        explainer.insert("end", explainer_text)
        explainer.configure(state="disabled")
        explainer.pack(anchor="nw", padx=(50,20), fill="x", expand=True)
        return checkbox, explainer
    
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
