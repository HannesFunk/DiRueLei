import logging
import customtkinter as ctk

class TextboxLogger:
    def __init__(self, textbox: ctk.CTkTextbox):
        self.textbox = textbox
        self.logger = logging.getLogger("TextboxLogger")

    def _write(self, message: str, tag: str = None):
        self.textbox.configure(state="normal")
        if tag:
            self.textbox.insert("end", message + "\n", tag)
        else:
            self.textbox.insert("end", message + "\n")
        self.textbox.configure(state="disabled")
        self.textbox.see("end")

    def debug(self, message: str):
        self.logger.debug(message)

    def info(self, message: str):
        self.logger.info(message)
        self._write(message)

    def warning(self, message: str):
        self.logger.warning(message)
        self._write("WARNING: " + message)

    def error(self, message: str):
        self.logger.error(message)
        self._write("ERROR: " + message, tag="error")

    def exception(self, e) :
        self.logger.exception(e)
        self._write("EXCEPTION: " + str(e))

    def setup_tags(self):
        # Call this after creating the textbox and before logging errors
        self.textbox.tag_configure("error", foreground="red")
