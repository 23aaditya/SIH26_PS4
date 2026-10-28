import os
import pymupdf as fitz

out_dir = os.path.join(os.path.dirname(__file__), "acceptance_fixtures")
os.makedirs(out_dir, exist_ok=True)

# Fixture 1: Valid Affidavit-2 with distinctive fictional values
doc1 = fitz.open()
p1 = doc1.new_page()
p1.insert_text(
    (50, 72),
    "SYNTHETIC TEST DOCUMENT - NOT AN OFFICIAL CERTIFICATE\n\n"
    "AFFIDAVIT (ANNEXURE-2)\n\n"
    "Executed on Rs. 100 Non-Judicial Stamp Paper\n\n"
    "I, Dr. Alex Mercer, Chairman of Fictional Synthetic Educational Trust, do hereby solemnly affirm\n"
    "and state on oath that Fictional Institute of Synthetic Technology (FIST-999) complies with all statutory\n"
    "norms and standards specified in the AICTE Approval Process Handbook (APH) 2024-2027.\n\n"
    "Deponent solemnly affirms that the institution possesses unencumbered title and physical possession.\n"
    "Verified at New Delhi on 15th October 2026.\n",
    fontsize=11
)
doc1.save(os.path.join(out_dir, "fixture_affidavit_2.pdf"))
doc1.close()

# Fixture 2: Valid Fire NOC with future validity
doc2 = fitz.open()
p2 = doc2.new_page()
p2.insert_text(
    (50, 72),
    "SYNTHETIC TEST DOCUMENT - NOT AN OFFICIAL CERTIFICATE\n\n"
    "DIRECTORATE GENERAL OF FIRE AND EMERGENCY SERVICES\n"
    "FIRE SAFETY CLEARANCE CERTIFICATE / NO OBJECTION CERTIFICATE\n\n"
    "Certificate No: DFES/NOC/2026/FIST-999\n"
    "This is to certify that the institutional premises of Fictional Institute of Synthetic Technology (FIST-999)\n"
    "have been inspected by the Chief Fire Officer.\n"
    "The institutional fire safety systems meet the statutory requirements of the National Building Code (NBC).\n"
    "This Fire Safety Certificate is valid until 31st December 2028.\n",
    fontsize=11
)
doc2.save(os.path.join(out_dir, "fixture_fire_noc.pdf"))
doc2.close()

# Fixture 3: Valid Building Occupancy Certificate
doc3 = fitz.open()
p3 = doc3.new_page()
p3.insert_text(
    (50, 72),
    "SYNTHETIC TEST DOCUMENT - NOT AN OFFICIAL CERTIFICATE\n\n"
    "MUNICIPAL CORPORATION TOWN PLANNING DEPARTMENT\n"
    "BUILDING OCCUPANCY AND COMPLETION CERTIFICATE\n\n"
    "Occupancy Clearance Ref: MC/TPD/OCC/2026/999\n"
    "The Competent Local Authority hereby grants Building Occupancy Certificate and permission to occupy\n"
    "the educational buildings situated on Survey No. 999/42 in respect of Fictional Institute of Synthetic Technology.\n"
    "The construction conforms to the approved master building plan and total constructed carpet area.\n"
    "Issued by Municipal Corporation Commissioner on 20th August 2026.\n",
    fontsize=11
)
doc3.save(os.path.join(out_dir, "fixture_occupancy_cert.pdf"))
doc3.close()

# Fixture 4: Blank PDF (valid PDF structure with 0 text characters)
doc4 = fitz.open()
p4 = doc4.new_page()
doc4.save(os.path.join(out_dir, "fixture_blank.pdf"))
doc4.close()

# Fixture 5: Invalid format file (non-PDF bytes with .pdf extension)
with open(os.path.join(out_dir, "fixture_invalid.pdf"), "w", encoding="utf-8") as f:
    f.write("This is a plain text file pretending to be a PDF without the %PDF magic byte header.")

# Fixture 6: Changed version of Affidavit-2 (for testing doc replacement & version hash change)
doc6 = fitz.open()
p6 = doc6.new_page()
p6.insert_text(
    (50, 72),
    "SYNTHETIC TEST DOCUMENT - NOT AN OFFICIAL CERTIFICATE (REVISED VERSION)\n\n"
    "AFFIDAVIT (ANNEXURE-2) - REVISED RE-SUBMISSION\n\n"
    "Executed on Rs. 100 Non-Judicial Stamp Paper\n\n"
    "I, Dr. Alex Mercer, Chairman of Fictional Synthetic Educational Trust, do hereby solemnly affirm\n"
    "that all previously flagged deficiencies have been rectified for Fictional Institute of Synthetic Technology.\n"
    "AICTE Approval Process Handbook (APH) 2024-2027 compliance re-certified on 27th October 2026.\n",
    fontsize=11
)
doc6.save(os.path.join(out_dir, "fixture_affidavit_2_v2.pdf"))
doc6.close()

print("All 6 acceptance fixtures generated in acceptance_fixtures/")
