import os
import sys
import hashlib
from pathlib import Path
import sqlite3
import fitz  # PyMuPDF

DB_PATH = Path(__file__).resolve().parent / "prisma" / "dev.db"
BASE_DIR = Path(__file__).resolve().parent

DOC_TEMPLATES = {
    "Governing_Body_Resolution_2026.pdf": {
        "title": "GOVERNING BODY RESOLUTION EXTRACT (SYNTHETIC SAMPLE)",
        "subject": "Resolution for Extension of Approval and Intake Expansion for Academic Year 2026-2027",
        "sections": [
            ("1. Quorum and Meeting Particulars", "The 48th Ordinary Meeting of the Governing Body was convened on January 14, 2026. A statutory quorum of 9 members was present including University Nominees and Industry Experts."),
            ("2. Deliberations on Approval Expansion", "Resolved unanimously that the institution shall apply to the All India Council for Technical Education (AICTE) for Extension of Approval (EoA) and an increase in undergraduate intake in Computer Science & Engineering and allied branches."),
            ("3. Financial & Infrastructure Allocation", "The Governing Body hereby allocates an additional budgetary capital expenditure of INR 1.85 Crores for laboratory expansion, computing clusters, and high-speed campus networking."),
            ("4. Statutory Undertaking", "The Member Secretary is authorized to sign, submit affidavits, and upload all requisite documentation onto the AICTE regulatory portal in strict compliance with the Approval Process Handbook.")
        ]
    },
    "GB_Res_2026.pdf": {
        "title": "GOVERNING BODY RESOLUTION EXTRACT (SYNTHETIC SAMPLE)",
        "subject": "Resolution for Extension of Approval and Intake Expansion for Academic Year 2026-2027",
        "sections": [
            ("1. Quorum and Meeting Particulars", "The 48th Ordinary Meeting of the Governing Body was convened on January 14, 2026. A statutory quorum of 9 members was present including University Nominees and Industry Experts."),
            ("2. Deliberations on Approval Expansion", "Resolved unanimously that the institution shall apply to the All India Council for Technical Education (AICTE) for Extension of Approval (EoA) and an increase in undergraduate intake in Computer Science & Engineering and allied branches."),
            ("3. Financial & Infrastructure Allocation", "The Governing Body hereby allocates an additional budgetary capital expenditure of INR 1.85 Crores for laboratory expansion, computing clusters, and high-speed campus networking."),
            ("4. Statutory Undertaking", "The Member Secretary is authorized to sign, submit affidavits, and upload all requisite documentation onto the AICTE regulatory portal in strict compliance with the Approval Process Handbook.")
        ]
    },
    "NBA_Accreditation_Certificate.pdf": {
        "title": "NATIONAL BOARD OF ACCREDITATION STATUS (SYNTHETIC SAMPLE)",
        "subject": "Summary Statement of Accreditation Status for Technical Programs",
        "sections": [
            ("1. Program Scope", "Undergraduate Engineering Programs in Computer Engineering and Mechanical Engineering."),
            ("2. Accreditation Validity", "Accredited under Tier-II Washington Accord guidelines for academic cycles 2024-2025 through 2026-2027."),
            ("3. Outcome Evaluation", "Outcome Assessment confirmed compliance across all 9 criteria with aggregate assessment score exceeding 675/1000 marks."),
            ("4. Periodic Compliance", "Subject to mandatory annual submission of compliance status and student graduation outcome metrics.")
        ]
    },
    "Instructional_Carpet_Area_Layout_Plan.pdf": {
        "title": "INSTRUCTIONAL & ADMINISTRATIVE CARPET AREA SCHEDULE (SYNTHETIC SAMPLE)",
        "subject": "Architectural Carpet Area Statement and Floor Space Schedule",
        "sections": [
            ("1. Instructional Carpet Area", "Classrooms: 18 units @ 66 sq.m each (1,188 sq.m); Tutorial Rooms: 4 units @ 33 sq.m each (132 sq.m); Laboratories: 14 units @ 75 sq.m each (1,050 sq.m); Total Instructional Area: 2,370 sq.m."),
            ("2. Administrative Area", "Principal Office: 35 sq.m; Board Room: 45 sq.m; Central Office: 160 sq.m; Faculty Cabins: 320 sq.m; Total Administrative Area: 560 sq.m."),
            ("3. Amenities & Circulation", "Central Library & Reading Room: 420 sq.m; Computer Center: 180 sq.m; Cafeteria, Restrooms, and Corridors: 850 sq.m."),
            ("4. Architect Certification", "Certified that the spatial layout adheres strictly to norms prescribed in Appendix 4 of the AICTE Approval Process Handbook (APH 2024-2027).")
        ]
    },
    "Faculty_Cadre_Allocation_&_Recruitment_Undertaking.pdf": {
        "title": "FACULTY CADRE RATIO & APPOINTMENT UNDERTAKING (SYNTHETIC SAMPLE)",
        "subject": "Statutory Statement of Teaching Cadre and Student-to-Faculty Ratio (SFR)",
        "sections": [
            ("1. Student-to-Faculty Ratio (SFR)", "Approved Student Intake: 720; Sanctioned Faculty Strength: 36 full-time faculty members maintaining an overall SFR of 1:20 in compliance with AICTE norms."),
            ("2. Cadre Distribution", "Professors: 4; Associate Professors: 8; Assistant Professors: 24 (adhering to cadre ratio 1:2:6)."),
            ("3. Qualifications & Pay Scales", "All appointed faculty possess AICTE/UGC prescribed minimum qualifications with 7th Central Pay Commission (CPC) allowances."),
            ("4. Legal Declaration", "The undersigned Head of Institution undertakes that all faculty data uploaded on the portal is authentic, verified against biometric attendance, and free from ghost/proxy appointments.")
        ]
    }
}

DEFAULT_TEMPLATE = {
    "title": "STATUTORY REGULATORY ATTACHMENT (SYNTHETIC SAMPLE)",
    "subject": "Demonstration Document Fixture for AICTE Scrutiny Assistant",
    "sections": [
        ("1. Purpose", "This file is a synthetic test fixture generated for development testing and automated regulatory scrutiny evaluation."),
        ("2. Verification Notice", "Does not represent an actual statutory clearance certificate. Provided solely for automated verification workflows."),
        ("3. Authenticity Disclaimer", "All names, figures, and statements contained herein are fictional demo data.")
    ]
}

def generate_pdf(doc_info: dict, out_path: Path) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4 size

    template = DOC_TEMPLATES.get(doc_info["originalFilename"], DEFAULT_TEMPLATE)

    # 1. Top Banner / Watermark
    r_banner = fitz.Rect(20, 20, 575, 60)
    page.draw_rect(r_banner, color=(0.85, 0.2, 0.2), fill=(0.98, 0.94, 0.94), width=1.5)
    page.insert_textbox(
        r_banner,
        "DEMO REGULATORY DOCUMENT - SYNTHETIC TEST FIXTURE\nNOT AN OFFICIAL GOVERNMENT OR STATUTORY CERTIFICATE",
        fontsize=9,
        fontname="helv",
        color=(0.8, 0.1, 0.1),
        align=fitz.TEXT_ALIGN_CENTER
    )

    # 2. Main Title & Subject
    y = 80
    r_title = fitz.Rect(30, y, 565, y + 45)
    page.insert_textbox(
        r_title,
        template["title"],
        fontsize=13,
        fontname="helv",
        color=(0.1, 0.1, 0.3),
        align=fitz.TEXT_ALIGN_CENTER
    )
    y += 50

    r_subj = fitz.Rect(30, y, 565, y + 25)
    page.insert_textbox(
        r_subj,
        f"Subject: {template['subject']}",
        fontsize=10,
        fontname="helv",
        color=(0.2, 0.2, 0.2),
        align=fitz.TEXT_ALIGN_LEFT
    )
    y += 30

    # 3. Metadata Table
    r_meta_box = fitz.Rect(30, y, 565, y + 90)
    page.draw_rect(r_meta_box, color=(0.7, 0.7, 0.7), fill=(0.96, 0.96, 0.98), width=1)
    
    meta_text = (
        f"Document ID: {doc_info['id']}\n"
        f"Application Number: {doc_info['applicationNumber']}\n"
        f"Original Filename: {doc_info['originalFilename']}\n"
        f"Document Type: {doc_info['documentType']}\n"
        f"Date of Generation: 2026-10-26 (Simulated)\n"
        f"Regulatory Handbook: AICTE Approval Process Handbook (APH 2024-2027)"
    )
    page.insert_textbox(
        fitz.Rect(40, y + 8, 555, y + 82),
        meta_text,
        fontsize=8.5,
        fontname="helv",
        color=(0.2, 0.2, 0.3)
    )
    y += 105

    # 4. Sections
    for sec_title, sec_body in template["sections"]:
        r_sec = fitz.Rect(30, y, 565, y + 65)
        page.insert_textbox(
            fitz.Rect(30, y, 565, y + 16),
            sec_title,
            fontsize=10,
            fontname="helv",
            color=(0.1, 0.2, 0.5)
        )
        page.insert_textbox(
            fitz.Rect(30, y + 18, 565, y + 65),
            sec_body,
            fontsize=9,
            fontname="helv",
            color=(0.25, 0.25, 0.25)
        )
        y += 70

    # 5. Footer
    r_footer = fitz.Rect(30, 790, 565, 825)
    page.draw_line(fitz.Point(30, 785), fitz.Point(565, 785), color=(0.8, 0.8, 0.8), width=1)
    footer_text = (
        "CONFIDENTIAL & SYNTHETIC - FOR TECHNICAL SCRUTINY DEMONSTRATION ONLY\n"
        "AICTE Smart Automated Scrutiny Portal (SIH 2026 Problem Statement 26262)"
    )
    page.insert_textbox(
        r_footer,
        footer_text,
        fontsize=7.5,
        fontname="helv",
        color=(0.5, 0.5, 0.5),
        align=fitz.TEXT_ALIGN_CENTER
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_bytes = doc.tobytes()
    doc.close()
    
    with open(out_path, "wb") as f:
        f.write(pdf_bytes)
        
    return pdf_bytes

def main():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT d.id, d.originalFilename, d.storagePath, d.documentType, a.applicationNumber
        FROM ApplicationDocument d
        LEFT JOIN Application a ON d.applicationId = a.id
    """)
    rows = cursor.fetchall()
    print(f"Found {len(rows)} ApplicationDocument records in DB.")

    updated_count = 0
    for row in rows:
        doc_id, filename, storage_path, doc_type, app_num = row
        if not storage_path:
            storage_path = f"uploads/applications/{doc_id}/{filename}"
        
        full_path = (BASE_DIR / storage_path).resolve()
        
        doc_info = {
            "id": doc_id,
            "originalFilename": filename or "document.pdf",
            "storagePath": storage_path,
            "documentType": doc_type or "STATUTORY_DOC",
            "applicationNumber": app_num or "AICTE-2026-DEMO",
        }

        # Generate readable synthetic PDF
        pdf_bytes = generate_pdf(doc_info, full_path)
        sha256 = hashlib.sha256(pdf_bytes).hexdigest()
        size = len(pdf_bytes)

        # Update DB record with verified checksum and size
        cursor.execute("""
            UPDATE ApplicationDocument
            SET storagePath = ?, checksum = ?, fileSize = ?, mimeType = 'application/pdf'
            WHERE id = ?
        """, (storage_path, sha256, size, doc_id))
        updated_count += 1
        print(f"Generated & linked: {filename} ({size} bytes, sha256: {sha256[:10]}...) -> {storage_path}")

    conn.commit()
    conn.close()
    print(f"Successfully processed and updated {updated_count} documents.")

if __name__ == "__main__":
    main()
