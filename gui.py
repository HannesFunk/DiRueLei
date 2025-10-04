import customtkinter as ctk
import shutil
from gui.main_page import MainPage

ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")


class MTGScan(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("LN-Scan-Tool")
        self.geometry("900x600")  
        self.minsize(900, 600)     
        self.main_page = MainPage(self)
        self.input_files = None
        self.main_page.pack(fill="both", expand=True)
        self.temp_folders = []

    def add_temp_folder(self, folder_path):
        self.temp_folders.append(folder_path)

    def cleanup(self):
        for temp_folder in self.temp_folders:
            try:
                shutil.rmtree(temp_folder)
            except Exception as e:
                print(f"Error removing temporary folder {temp_folder}: {e}")
                pass
        self.destroy()

if __name__ == "__main__":
    app = MTGScan()
    app.protocol("WM_DELETE_WINDOW", app.cleanup)
    app.mainloop()
