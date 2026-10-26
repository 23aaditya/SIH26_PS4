import pymupdf as fitz
from typing import Dict, Any, List

class DocumentExtractor:
    @staticmethod
    def extract_from_bytes(pdf_bytes: bytes, filename: str = "document.pdf") -> Dict[str, Any]:
        """
        Extract text, page count, and metadata from raw PDF bytes using PyMuPDF.
        Accurately detects scanned/image-only PDFs where digital text is absent.
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            # Fallback for plain text or simulated seed files
            try:
                decoded = pdf_bytes.decode("utf-8", errors="ignore")
                return {
                    "filename": filename,
                    "page_count": 1,
                    "total_chars": len(decoded.strip()),
                    "is_scanned": False,
                    "pages": [{"page_number": 1, "text": decoded}],
                    "full_text": decoded,
                    "metadata": {"title": filename, "format": "text-stream"},
                }
            except Exception:
                return {
                    "filename": filename,
                    "page_count": 0,
                    "total_chars": 0,
                    "is_scanned": True,
                    "pages": [],
                    "full_text": "",
                    "metadata": {"error": f"Failed to parse document: {str(e)}"},
                }

        page_count = len(doc)
        pages_data: List[Dict[str, Any]] = []
        full_text_parts: List[str] = []
        total_chars = 0

        for page_idx in range(page_count):
            page = doc[page_idx]
            page_text = page.get_text("text") or ""
            clean_text = page_text.strip()
            total_chars += len(clean_text)
            pages_data.append({
                "page_number": page_idx + 1,
                "text": clean_text,
            })
            full_text_parts.append(clean_text)

        meta = doc.metadata or {}
        doc.close()

        # Pure scanned document check: minimal extractable text characters across pages
        is_scanned = total_chars < 40

        return {
            "filename": filename,
            "page_count": page_count,
            "total_chars": total_chars,
            "is_scanned": is_scanned,
            "pages": pages_data,
            "full_text": "\n\n".join(full_text_parts),
            "metadata": {
                "title": meta.get("title") or filename,
                "author": meta.get("author") or "",
                "subject": meta.get("subject") or "",
                "creation_date": meta.get("creationDate") or "",
            },
        }

document_extractor = DocumentExtractor()
