// ─── User roles ───
export const USER_ROLES = [
  "institution",
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_TYPES = ["institution", "aicte"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// ─── User profile stored in Firestore `users/{uid}` ───
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  accountType: AccountType;
  institutionId?: string;
  regionIds?: string[];
  active: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ─── Institution ───
export interface Institution {
  id: string;
  institutionName: string;
  institutionCode: string;
  regionId: string;
  address: string;
  city: string;
  state: string;
  contactEmail: string;
  contactPhone: string;
  ownerUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

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
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// ─── Application categories ───
export const APPLICATION_CATEGORIES = [
  "new_institution",
  "new_program",
  "extension_of_approval",
  "increase_intake",
  "closure",
  "name_change",
] as const;

export type ApplicationCategory = (typeof APPLICATION_CATEGORIES)[number];

export const APPLICATION_CATEGORY_LABELS: Record<ApplicationCategory, string> = {
  new_institution: "New Institution",
  new_program: "New Program",
  extension_of_approval: "Extension of Approval",
  increase_intake: "Increase in Intake",
  closure: "Closure of Institution/Program",
  name_change: "Change of Name/Site",
};

// ─── Application ───
export interface Application {
  id: string;
  applicationNumber: string;
  institutionId: string;
  createdByUid: string;
  applicationCategory: ApplicationCategory;
  workflowDefinitionId: string;
  workflowVersionId: string;
  status: ApplicationStatus;
  currentStageId: string;
  currentStageName: string;
  currentAssigneeRole: UserRole | "";
  assignedUserIds: string[];
  regionId: string;
  submittedAt?: string;
  stageEnteredAt: string;
  dueAt?: string;
  lastActionAt: string;
  nextActionDescription: string;
  requiresEvc: boolean;
  returnCount: number;
  createdAt: string;
  updatedAt: string;
  // Form data stored as a flexible object for various application types
  formData?: Record<string, unknown>;
}

// ─── Application Document ───
export const DOCUMENT_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
  "expired",
  "manual_review_required",
] as const;

export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  institutionId: string;
  documentType: string;
  originalFilename: string;
  storagePath: string;
  uploadedByUid: string;
  uploadedAt: string;
  documentDate?: string;
  expiryDate?: string;
  verificationStatus: DocumentVerificationStatus;
  verifiedByUid?: string;
  verifiedAt?: string;
  notes?: string;
}

// ─── Workflow definitions ───
export interface WorkflowStage {
  stageId: string;
  stageName: string;
  responsibleRole: UserRole;
  deadlineDays?: number;
  allowReturnToInstitution: boolean;
  allowedOutcomes: WorkflowOutcome[];
}

export interface WorkflowOutcome {
  outcomeId: string;
  label: string;
  nextStageId: string | null; // null = terminal
  conditionType?: "always" | "requires_evc" | "no_evc";
  requiresReason: boolean;
}

export interface WorkflowVersion {
  id: string;
  versionNumber: number;
  effectiveDate?: string;
  stages: WorkflowStage[];
  status: "draft" | "active" | "archived";
  createdBy: string;
  createdAt: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  applicationCategory: ApplicationCategory;
  description: string;
  activeVersionId: string;
  active: boolean;
  createdBy: string;
  updatedAt: string;
}

// ─── Task ───
export const TASK_STATUSES = ["open", "in_progress", "completed", "cancelled", "overdue"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  applicationId: string;
  institutionId: string;
  regionId: string;
  taskType: string;
  title: string;
  description: string;
  assignedUserId?: string;
  assignedRole: UserRole;
  status: TaskStatus;
  createdAt: string;
  dueAt?: string;
  completedAt?: string;
  escalationLevel: number;
  sourceStageId: string;
}

// ─── EVC Visit ───
export const EVC_STATUSES = [
  "pending_scheduling",
  "scheduled",
  "visit_completed",
  "report_pending",
  "report_received",
  "delayed",
  "overdue",
] as const;

export type EvcStatus = (typeof EVC_STATUSES)[number];

export interface EvcVisit {
  id: string;
  applicationId: string;
  institutionId: string;
  regionId: string;
  scheduledAt?: string;
  assignedExperts: string[];
  status: EvcStatus;
  scheduledByUid?: string;
  completedAt?: string;
  reportDocumentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Notification ───
export interface AppNotification {
  id: string;
  recipientUid: string;
  applicationId?: string;
  type: string;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "urgent";
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  deduplicationKey?: string;
}

// ─── Audit Event ───
export interface AuditEvent {
  id: string;
  applicationId?: string;
  institutionId?: string;
  actorUid: string;
  actorRole: UserRole;
  action: string;
  fromStage?: string;
  toStage?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  workflowVersionId?: string;
}

// ─── Undertaking ───
export interface Undertaking {
  id: string;
  applicationId: string;
  institutionId: string;
  condition: string;
  description: string;
  dueAt: string;
  status: "pending" | "submitted" | "verified" | "overdue";
  evidenceDocumentIds: string[];
  submittedAt?: string;
  verifiedAt?: string;
  verifiedByUid?: string;
  createdAt: string;
}

// ─── Helpers ───

/** Determine the account type (institution vs aicte) from a role */
export function accountTypeFromRole(role: UserRole): AccountType {
  return role === "institution" ? "institution" : "aicte";
}

/** Human-readable role labels */
export const ROLE_LABELS: Record<UserRole, string> = {
  institution: "Institution User",
  regional_officer: "Regional Officer",
  bureau_officer: "Bureau Officer",
  scrutiny_committee: "Scrutiny Committee",
  evc_coordinator: "EVC Coordinator",
  competent_authority: "Competent Authority",
  admin: "Administrator",
};

/** Status colours for UI badges */
export const STATUS_COLORS: Record<ApplicationStatus, string> = {
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

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
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
