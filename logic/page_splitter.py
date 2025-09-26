import fitz

class PageSplitter : 
    def __init__(self, pdf_path, split_a3 : bool, two_page_scan :bool) :
        self.fitz_source_pdf = fitz.open(pdf_path)
        self.split_a3 = split_a3
        self.two_page_scan = two_page_scan
        pass
    

    
    