import customtkinter as ctk
from logic.qr_generator import QRGenerator
import logging
from tkinter import filedialog 
from logic.qr_reader import ExamReader
from gui.qr_generation_page import QRGenerationPage
from gui.main_page import MainPage

ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")

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

class MTGScan(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("LN-Scan-Tool")
        self.geometry("900x600")  # Set a fixed initial size
        self.minsize(900, 600)     # Set minimum size, user can resize larger
        self.selection_page = None
        self.main_page = MainPage(
            self,
        )
        self.input_files = None
        # Ensure main_page fills the window
        self.main_page.pack(fill="both", expand=True)


if __name__ == "__main__":
    app = MTGScan()
    app.mainloop()
