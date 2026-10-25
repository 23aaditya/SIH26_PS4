/**
 * Configurable workflow templates for each AICTE application type.
 * [DEMO] These templates represent MVP implementation based on AICTE APH.
 * Stage status: NOT_STARTED | ASSIGNED | IN_PROGRESS | DEFICIENCY_RAISED |
 *   AWAITING_RESPONSE | RESPONSE_RECEIVED | PASSED | FAILED |
 *   RECOMMENDATION_SUBMITTED | DECISION_RECORDED | COMPLETED | SKIPPED
 * Overall status: DRAFT | SUBMITTED | IN_PROGRESS | AWAITING_INSTITUTE |
 *   AWAITING_AICTE_ACTION | DECISION_PENDING | APPROVED | REJECTED | WITHDRAWN | CLOSED
 */

const STAGE_DEFS = {
  scrutiny: {
    stageKey: "scrutiny", stageName: "Scrutiny Committee Review",
    assignedCommittee: "SCRUTINY", assignedRole: "scrutiny_committee",
    deadlineDays: 14, allowsReturn: true,
    allowedOutcomes: ["PASS", "FAIL", "DEFICIENCY"],
    transitions: { PASS: "evc", DEFICIENCY: "clarification", FAIL: "decision" },
  },
  scrutiny_no_evc: {
    stageKey: "scrutiny", stageName: "Scrutiny Committee Review",
    assignedCommittee: "SCRUTINY", assignedRole: "scrutiny_committee",
    deadlineDays: 14, allowsReturn: true,
    allowedOutcomes: ["PASS", "FAIL", "DEFICIENCY"],
    transitions: { PASS: "committee", DEFICIENCY: "clarification", FAIL: "decision" },
  },
  clarification: {
    stageKey: "clarification", stageName: "Deficiency Resolution (Awaiting Institute)",
    assignedCommittee: null, assignedRole: "institution",
    deadlineDays: 10, allowsReturn: false,
    allowedOutcomes: ["RESPONSE_RECEIVED"],
    transitions: { RESPONSE_RECEIVED: "scrutiny" },
  },
  evc: {
    stageKey: "evc", stageName: "Expert Visit Committee (EVC) Inspection",
    assignedCommittee: "EVC", assignedRole: "evc_coordinator",
    deadlineDays: 21, allowsReturn: false,
    allowedOutcomes: ["FAVORABLE", "PASS", "UNFAVORABLE", "FAIL", "CONDITIONAL"],
    transitions: { FAVORABLE: "committee", PASS: "committee", CONDITIONAL: "committee", UNFAVORABLE: "decision", FAIL: "decision" },
  },
  committee: {
    stageKey: "committee", stageName: "Standing Hearing Committee (SHC) Review",
    assignedCommittee: "SHC", assignedRole: "bureau_officer",
    deadlineDays: 14, allowsReturn: false,
    allowedOutcomes: ["RECOMMENDATION_SUBMITTED", "PASS", "FAIL"],
    transitions: { RECOMMENDATION_SUBMITTED: "decision", PASS: "decision", FAIL: "decision" },
  },
  decision: {
    stageKey: "decision", stageName: "Executive Committee Decision",
    assignedCommittee: "EC", assignedRole: "competent_authority",
    deadlineDays: 7, allowsReturn: false, isFinal: true,
    allowedOutcomes: ["APPROVED", "REJECTED", "CONDITIONAL_APPROVAL", "DEFERRED"],
    transitions: { APPROVED: null, REJECTED: null, CONDITIONAL_APPROVAL: null, DEFERRED: "scrutiny" },
  },
  verification: {
    stageKey: "verification", stageName: "Document and Fee Verification",
    assignedCommittee: null, assignedRole: "bureau_officer",
    deadlineDays: 5, allowsReturn: false,
    allowedOutcomes: ["PASS", "FAIL"],
    transitions: { PASS: "scrutiny", FAIL: "clarification" },
  },
  eligibility_check: {
    stageKey: "eligibility_check", stageName: "ODL/Online Eligibility Verification",
    assignedCommittee: "SCRUTINY", assignedRole: "scrutiny_committee",
    deadlineDays: 7, allowsReturn: false,
    allowedOutcomes: ["ELIGIBLE", "INELIGIBLE"],
    transitions: { ELIGIBLE: "scrutiny", INELIGIBLE: "decision" },
  },
};

export const WORKFLOW_TEMPLATES = {
  new_institution: {
    templateKey: "new_institution", name: "New Technical Institution Approval",
    applicationCategories: ["new_institution"], requiresEvc: true,
    stages: [
      { ...STAGE_DEFS.verification, sequenceOrder: 1 },
      { ...STAGE_DEFS.scrutiny, sequenceOrder: 2 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 3 },
      { ...STAGE_DEFS.evc, sequenceOrder: 4 },
      { ...STAGE_DEFS.committee, sequenceOrder: 5 },
      { ...STAGE_DEFS.decision, sequenceOrder: 6 },
    ],
    initialStageKey: "verification",
  },
  eoa: {
    templateKey: "eoa", name: "Extension of Approval (EoA)",
    applicationCategories: ["eoa", "extension_of_approval", "extension"], requiresEvc: false,
    stages: [
      { ...STAGE_DEFS.scrutiny_no_evc, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.decision, sequenceOrder: 3 },
    ],
    initialStageKey: "scrutiny",
  },
  increase_intake: {
    templateKey: "increase_intake", name: "Increase in Intake",
    applicationCategories: ["increase_intake", "increase"], requiresEvc: true,
    stages: [
      { ...STAGE_DEFS.scrutiny, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.evc, sequenceOrder: 3 },
      { ...STAGE_DEFS.decision, sequenceOrder: 4 },
    ],
    initialStageKey: "scrutiny",
  },
  additional_course: {
    templateKey: "additional_course", name: "Additional Course / New Programme",
    applicationCategories: ["additional_course", "new_programme", "new_program"], requiresEvc: true,
    stages: [
      { ...STAGE_DEFS.scrutiny, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.evc, sequenceOrder: 3 },
      { ...STAGE_DEFS.committee, sequenceOrder: 4 },
      { ...STAGE_DEFS.decision, sequenceOrder: 5 },
    ],
    initialStageKey: "scrutiny",
  },
  reduction_or_closure: {
    templateKey: "reduction_or_closure", name: "Reduction / Closure",
    applicationCategories: ["reduction_intake", "closure_course", "closure_institution", "merger", "closure"], requiresEvc: false,
    stages: [
      { ...STAGE_DEFS.scrutiny_no_evc, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.committee, sequenceOrder: 3 },
      { ...STAGE_DEFS.decision, sequenceOrder: 4 },
    ],
    initialStageKey: "scrutiny",
  },
  change_of_site: {
    templateKey: "change_of_site", name: "Change of Site or Location",
    applicationCategories: ["change_of_site", "change_site"], requiresEvc: true,
    stages: [
      { ...STAGE_DEFS.scrutiny, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.evc, sequenceOrder: 3 },
      { ...STAGE_DEFS.decision, sequenceOrder: 4 },
    ],
    initialStageKey: "scrutiny",
  },
  collaboration_twinning: {
    templateKey: "collaboration_twinning", name: "Collaboration and Twinning",
    applicationCategories: ["collaboration", "twinning"], requiresEvc: false,
    stages: [
      { ...STAGE_DEFS.scrutiny_no_evc, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.decision, sequenceOrder: 3 },
    ],
    initialStageKey: "scrutiny",
  },
  university_approval: {
    templateKey: "university_approval", name: "Approval for Universities",
    applicationCategories: ["university_approval", "university"], requiresEvc: true,
    stages: [
      { ...STAGE_DEFS.verification, sequenceOrder: 1 },
      { ...STAGE_DEFS.scrutiny, sequenceOrder: 2 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 3 },
      { ...STAGE_DEFS.evc, sequenceOrder: 4 },
      { ...STAGE_DEFS.committee, sequenceOrder: 5 },
      { ...STAGE_DEFS.decision, sequenceOrder: 6 },
    ],
    initialStageKey: "verification",
  },
  odl_online: {
    templateKey: "odl_online", name: "ODL / Online Learning",
    applicationCategories: ["odl", "online_learning", "online", "distance"], requiresEvc: false,
    stages: [
      { ...STAGE_DEFS.eligibility_check, sequenceOrder: 1 },
      { ...STAGE_DEFS.scrutiny_no_evc, sequenceOrder: 2 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 3 },
      { ...STAGE_DEFS.decision, sequenceOrder: 4 },
    ],
    initialStageKey: "eligibility_check",
  },
  standard: {
    templateKey: "standard", name: "Standard AICTE Application",
    applicationCategories: [], requiresEvc: false,
    stages: [
      { ...STAGE_DEFS.scrutiny_no_evc, sequenceOrder: 1 },
      { ...STAGE_DEFS.clarification, sequenceOrder: 2 },
      { ...STAGE_DEFS.decision, sequenceOrder: 3 },
    ],
    initialStageKey: "scrutiny",
  },
};

export function resolveWorkflowTemplate(applicationCategory) {
  const cat = (applicationCategory || "").toLowerCase().replace(/[\s\-()]/g, "_");
  for (const [key, template] of Object.entries(WORKFLOW_TEMPLATES)) {
    if (key === "standard") continue;
    if (template.applicationCategories.some((c) => cat.includes(c) || c.includes(cat))) {
      return template;
    }
  }
  return WORKFLOW_TEMPLATES.standard;
}

export function getStageFromTemplate(template, stageKey) {
  return template.stages.find((s) => s.stageKey === stageKey) || null;
}

export function resolveNextStageKey(template, currentStageKey, outcome) {
  const stage = getStageFromTemplate(template, currentStageKey);
  if (!stage) return null;
  const next = (stage.transitions || {})[outcome];
  return next !== undefined ? next : null;
}

export function calculateDeadline(days) {
  const d = new Date();
  d.setDate(d.getDate() + (days || 14));
  return d;
}
