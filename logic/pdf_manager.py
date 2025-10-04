import fitz

class PdfManager : 
    def __init__ (self):
        pass

    def detect_page_size (self, page) :
        width, height = page.rect.width, page.rect.height
        if self._is_a4(width, height):
            return "A4"
        elif self._is_a3(width, height):
            return "A3"
        else:
            return "other"
        
    def _is_a4(self, w, h):
        return self._is_close(w, 595) and self._is_close(h, 842) or self._is_close(w, 842) and self._is_close(h, 595)

    def _is_a3(self, w, h):
        return self._is_close(w, 842) and self._is_close(h, 1191) or self._is_close(w, 1191) and self._is_close(h, 842)

    def _is_close(self, a, b, tol=5):
        return abs(a - b) < tol
    
    def is_splittable_pair(self, page1, page2) -> bool : 
        return (page1["status"] == "read" and
            (page1["side"] == "left" and page2["side"] == "right") or (page2["side"] == "none"))
       
    def split_a3(self, page) :
        fitz_page = self.fitz_source_pdf[page["page_num"]]
        rect = fitz_page.rect
        left_rect = fitz.Rect(rect.x0, rect.y0, rect.x1 / 2, rect.y1)
        right_rect = fitz.Rect(rect.x1 / 2, rect.y0, rect.x1, rect.y1)

        left_page = fitz.open()
        left_page1 = left_page.new_page(width=left_rect.width, height=left_rect.height)
        left_page1.show_pdf_page(left_page1.rect, self.fitz_source_pdf, page["page_num"], clip=left_rect)

        right_page = fitz.open()
        right_page2 = right_page.new_page(width=right_rect.width, height=right_rect.height)
        right_page2.show_pdf_page(right_page2.rect, self.fitz_source_pdf, page["page_num"], clip=right_rect)

        return (left_page, right_page)