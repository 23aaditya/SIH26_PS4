import fitz
from extractor import document_extractor

def test_extract_from_synthetic_pdf():
    # Create an in-memory test PDF using fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), "AICTE Approval Process Handbook 2024-2027 Test Document Content.")
    pdf_bytes = doc.tobytes()
    doc.close()

    result = document_extractor.extract_from_bytes(pdf_bytes, "test_doc.pdf")
    assert result["page_count"] == 1
    assert result["is_scanned"] is False
    assert "Approval Process Handbook" in result["full_text"]
    assert result["total_chars"] > 20

def test_extract_scanned_pdf_detection():
    # Create an in-memory PDF with an empty page (simulating scanned raster without text layer)
    doc = fitz.open()
    doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()

    result = document_extractor.extract_from_bytes(pdf_bytes, "scanned_doc.pdf")
    assert result["page_count"] == 1
    assert result["is_scanned"] is True
    assert result["total_chars"] == 0
