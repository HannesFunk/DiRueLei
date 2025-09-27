import customtkinter as ctk
from gui.main_page import MainPage

ctk.set_appearance_mode("System")
ctk.set_default_color_theme("blue")


class MTGScan(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("LN-Scan-Tool")
        self.geometry("900x600")  # Set a fixed initial size
        self.minsize(900, 600)     # Set minimum size, user can resize larger
        self.main_page = MainPage(
            self,
        )
        self.input_files = None
        self.main_page.pack(fill="both", expand=True)


if __name__ == "__main__":
    app = MTGScan()
    app.mainloop()
