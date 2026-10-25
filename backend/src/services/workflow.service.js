export const WORKFLOW_STAGES = {
  scrutiny: {
    stageId: "scrutiny",
    stageName: "Scrutiny Committee Review",
    responsibleRole: "scrutiny_committee",
    deadlineDays: 14,
    allowsReturn: true,
    nextDefaultStageId: "committee",
    evcStageId: "evc",
  },
  evc: {
    stageId: "evc",
    stageName: "Expert Visiting Committee (EVC)",
    responsibleRole: "evc_coordinator",
    deadlineDays: 21,
    allowsReturn: false,
    nextDefaultStageId: "committee",
  },
  committee: {
    stageId: "committee",
    stageName: "Regional Hearing Committee",
    responsibleRole: "bureau_officer",
    deadlineDays: 10,
    allowsReturn: true,
    nextDefaultStageId: "decision",
  },
  decision: {
    stageId: "decision",
    stageName: "Competent Authority Decision",
    responsibleRole: "competent_authority",
    deadlineDays: 7,
    allowsReturn: false,
    nextDefaultStageId: null, // Terminal stage
  },
  clarification: {
    stageId: "clarification",
    stageName: "Deficiency Resolution",
    responsibleRole: "institution",
    deadlineDays: 10,
    allowsReturn: false,
    nextDefaultStageId: "scrutiny",
  },
};

export const workflowService = {
  getStage(stageId) {
    return WORKFLOW_STAGES[stageId];
  },

  resolveNextStage(currentStageId, requiresEvc, customOutcome) {
    if (customOutcome === "return_clarification") {
      return WORKFLOW_STAGES["clarification"];
    }

    if (currentStageId === "clarification") {
      return WORKFLOW_STAGES["scrutiny"];
    }

    if (currentStageId === "scrutiny") {
      if (requiresEvc) {
        return WORKFLOW_STAGES["evc"];
      }
      return WORKFLOW_STAGES["committee"];
    }

    if (currentStageId === "evc") {
      return WORKFLOW_STAGES["committee"];
    }

    if (currentStageId === "committee") {
      return WORKFLOW_STAGES["decision"];
    }

    if (currentStageId === "decision") {
      return null;
    }

    return null;
  },

  calculateDeadline(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  },
};
