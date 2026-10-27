// ─── User roles ───
export const USER_ROLES = [
  "institution",
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
];

export const ACCOUNT_TYPES = ["institution", "aicte"];

// ─── Application statuses ───
export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "awaiting_institution",
  "pending_evc",
  "awaiting_committee",
  "decision_recorded",
  "approved",
  "rejected",
  "closed",
];

// ─── Application categories ───
export const APPLICATION_CATEGORIES = [
  "new_institution",
  "new_program",
  "extension_of_approval",
  "increase_intake",
  "closure",
  "name_change",
];

export const APPLICATION_CATEGORY_LABELS = {
  new_institution: "New Institution",
  new_program: "New Program",
  extension_of_approval: "Extension of Approval",
  increase_intake: "Increase in Intake",
  closure: "Closure of Institution/Program",
  name_change: "Change of Name/Site",
  // Database stored category variants and aliases
  "Extension of Approval — EoA": "Extension of Approval",
  "Extension of Approval": "Extension of Approval",
  "EOA": "Extension of Approval",
  "EoA": "Extension of Approval",
  "Increase in Intake": "Increase in Intake",
  "New Institution": "New Institution",
  "New Program": "New Program",
  "Closure of Institution/Program": "Closure of Institution/Program",
  "Change of Name/Site": "Change of Name/Site",
};

/**
 * Safely resolves an application category code or string to its human-readable label.
 * Always returns a non-empty string; falls back to category value or 'Application'.
 * @param {string | null | undefined} category
 * @returns {string}
 */
export function getApplicationCategoryLabel(category) {
  if (!category) return "Application";
  return (
    APPLICATION_CATEGORY_LABELS[category] ||
    APPLICATION_CATEGORY_LABELS[category.toLowerCase?.()] ||
    category ||
    "Application"
  );
}

// ─── Application Document ───
export const DOCUMENT_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "expired",
  "manual_review_required",
];

// ─── Task ───
export const TASK_STATUSES = ["open", "in_progress", "completed", "cancelled", "overdue"];

// ─── EVC Visit ───
export const EVC_STATUSES = [
  "pending_scheduling",
  "scheduled",
  "visit_completed",
  "report_pending",
  "report_received",
  "delayed",
  "overdue",
];

// ─── Helpers ───

/** Determine the account type (institution vs aicte) from a role */
export function accountTypeFromRole(role) {
  return role === "institution" ? "institution" : "aicte";
}

/** Human-readable role labels */
export const ROLE_LABELS = {
  institution: "Institution User",
  regional_officer: "Regional Officer",
  bureau_officer: "Bureau Officer",
  scrutiny_committee: "Scrutiny Committee",
  evc_coordinator: "EVC Coordinator",
  competent_authority: "Competent Authority",
  admin: "Administrator",
};

/**
 * Safely resolves a role key to its human-readable label.
 * Falls back to a formatted version of the role string, or 'AICTE Officer' on missing/null.
 * @param {string | null | undefined} role
 * @returns {string}
 */
export function getRoleLabel(role) {
  if (!role) return "AICTE Officer";
  return (
    ROLE_LABELS[role] ||
    ROLE_LABELS[role.toLowerCase?.()] ||
    role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "AICTE Officer"
  );
}

/** Status colours for UI badges */
export const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  in_review: "bg-amber-100 text-amber-700",
  awaiting_institution: "bg-orange-100 text-orange-700",
  pending_evc: "bg-purple-100 text-purple-700",
  awaiting_committee: "bg-indigo-100 text-indigo-700",
  decision_recorded: "bg-cyan-100 text-cyan-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  closed: "bg-gray-200 text-gray-500",
};

export const STATUS_LABELS = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "Under Review",
  awaiting_institution: "Awaiting Institution",
  pending_evc: "Pending EVC",
  awaiting_committee: "Awaiting Committee",
  decision_recorded: "Decision Recorded",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};
