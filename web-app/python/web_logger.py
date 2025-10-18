from js import console, document

class WebLogger:
    def __init__(self, element_id):
        self.element_id = element_id
        
    def info(self, message):
        console.log(f"INFO: {message}")
        self._append_log(message, "info")
        
    def error(self, message):
        console.log(f"ERROR: {message}")
        self._append_log(message, "error")
        
    def warning(self, message):
        console.log(f"WARNING: {message}")
        self._append_log(message, "warning")
        
    def _append_log(self, message, level):
        log_element = document.getElementById(self.element_id)
        if log_element:
            color = {"info": "#00ff00", "error": "#ff6b6b", "warning": "#ffa500"}.get(level, "#00ff00")
            log_element.innerHTML += f'<div style="color: {color}">[{level.upper()}] {message}</div>'
            log_element.scrollTop = log_element.scrollHeight

# Global logger instance
web_logger = None

def set_logger(element_id):
    global web_logger
    web_logger = WebLogger(element_id)
    return web_logger