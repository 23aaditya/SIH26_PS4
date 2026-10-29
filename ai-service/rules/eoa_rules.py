"""
Extension of Approval (EoA) Statutory Rules.
Maintains backward compatibility with tests and legacy imports
while routing to common statutory rule definitions.
"""
from rules.common_rules import (
    parse_date_safely,
    check_affidavit_2,
    check_fire_safety_noc,
    check_occupancy_certificate,
    check_land_and_fsi,
    check_faculty_student_ratio,
)

__all__ = [
    "parse_date_safely",
    "check_affidavit_2",
    "check_fire_safety_noc",
    "check_occupancy_certificate",
    "check_land_and_fsi",
    "check_faculty_student_ratio",
]
