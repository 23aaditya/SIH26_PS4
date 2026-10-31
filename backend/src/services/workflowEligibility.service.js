/**
 * Workflow Eligibility Service (Phase 4.3)
 * Authoritative single source of truth for workflow action eligibility.
 * Evaluates whether an application is permitted to advance, record final decisions,
 * schedule EVC visits, or issue deficiency notices.
 *
 * Enforces the Active Deficiency Gate: While an official deficiency notice is
 * pending institutional response, all forward transitions and decisions are strictly locked.
 */

import prisma from "../db/prisma.js";

export const workflowEligibilityService = {
  /**
   * Evaluates complete action eligibility for an application and user.
   */
  async getEligibility(applicationId, user = null) {
    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: applicationId }, { applicationNumber: applicationId }],
      },
      include: {
        deficiencies: {
          orderBy: { createdAt: "desc" },
        },
        workflowInstance: {
          include: {
            stages: { orderBy: { sequenceOrder: "asc" } },
          },
        },
      },
    });

    if (!app) {
      throw Object.assign(new Error("Application not found."), { status: 404 });
    }

    // 1. Identify active unresolved deficiency
    const pendingDeficiency = (app.deficiencies || []).find((d) => d.status === "pending");
    const isAwaitingInstitution = app.status === "awaiting_institution" || app.currentStageId === "clarification";
    const hasActiveDeficiency = Boolean(pendingDeficiency || isAwaitingInstitution);

    const activeDeficiencyInfo = pendingDeficiency
      ? {
          id: pendingDeficiency.id,
          status: pendingDeficiency.status,
          cycleNumber: app.returnCount || 1,
          raisedById: pendingDeficiency.raisedById,
          dueAt: pendingDeficiency.dueAt || app.dueAt,
          createdAt: pendingDeficiency.createdAt,
          hasRejoinder: Boolean(pendingDeficiency.rejoinderText || pendingDeficiency.rejoinderAt),
        }
      : isAwaitingInstitution && app.deficiencies?.length > 0
      ? {
          id: app.deficiencies[0].id,
          status: app.deficiencies[0].status,
          cycleNumber: app.returnCount || 1,
          raisedById: app.deficiencies[0].raisedById,
          dueAt: app.deficiencies[0].dueAt || app.dueAt,
          createdAt: app.deficiencies[0].createdAt,
          hasRejoinder: Boolean(app.deficiencies[0].rejoinderText || app.deficiencies[0].rejoinderAt),
        }
      : null;

    // 2. State classification
    const isTerminal = ["approved", "rejected", "closed"].includes(app.status);
    const isInstitution = user?.accountType === "institution";

    // 3. Forward advancement eligibility (Send to Next Level)
    let canAdvance = true;
    let advanceBlockedReason = null;
    let advanceBlockedMessage = null;

    if (isTerminal) {
      canAdvance = false;
      advanceBlockedReason = "TERMINAL_STATE";
      advanceBlockedMessage = `Application is in terminal state '${app.status}'. No further transitions permitted.`;
    } else if (hasActiveDeficiency) {
      canAdvance = false;
      advanceBlockedReason = "DEFICIENCY_RESPONSE_PENDING";
      advanceBlockedMessage = `Official Deficiency Notice (Cycle #${app.returnCount || 1}) is awaiting institutional response. Forward advancement is locked until the institution submits its clarification and scrutiny review is completed.`;
    } else if (isInstitution) {
      canAdvance = false;
      advanceBlockedReason = "INSUFFICIENT_PERMISSIONS";
      advanceBlockedMessage = "Only designated AICTE Scrutiny Officers can pass applications to next regulatory level.";
    }

    // 4. Final decision eligibility (Record Final Decision)
    let canIssueDecision = true;
    let decisionBlockedReason = null;
    let decisionBlockedMessage = null;

    const perms = user?.permissions || [];
    const canDecideRole =
      !user || // If no user passed, check state only
      perms.includes("ISSUE_FINAL_DECISION") ||
      user?.role === "competent_authority" ||
      user?.role === "admin" ||
      user?.platformRoles?.includes("SUPER_ADMIN");

    if (isTerminal) {
      canIssueDecision = false;
      decisionBlockedReason = "TERMINAL_STATE";
      decisionBlockedMessage = `Application is already decided (${app.status}).`;
    } else if (hasActiveDeficiency) {
      canIssueDecision = false;
      decisionBlockedReason = "DEFICIENCY_RESPONSE_PENDING";
      decisionBlockedMessage = `Official Deficiency Notice (Cycle #${app.returnCount || 1}) is awaiting institutional response. Final regulatory decisions cannot be recorded while queries are outstanding.`;
    } else if (!canDecideRole) {
      canIssueDecision = false;
      decisionBlockedReason = "INSUFFICIENT_PERMISSIONS";
      decisionBlockedMessage = "User lacks statutory authority to record final regulatory decisions.";
    }

    // 5. EVC scheduling eligibility
    let canScheduleEvc = true;
    let evcBlockedReason = null;
    let evcBlockedMessage = null;

    if (isTerminal || hasActiveDeficiency || isInstitution) {
      canScheduleEvc = false;
      evcBlockedReason = hasActiveDeficiency
        ? "DEFICIENCY_RESPONSE_PENDING"
        : isTerminal
        ? "TERMINAL_STATE"
        : "INSUFFICIENT_PERMISSIONS";
      evcBlockedMessage = hasActiveDeficiency
        ? `Cannot schedule EVC inspection while an official deficiency notice (Cycle #${app.returnCount || 1}) is pending institutional response.`
        : isTerminal
        ? "Application is in terminal state."
        : "Institution users cannot schedule EVC visits.";
    }

    // 6. Deficiency creation eligibility (Return for Clarification)
    let canIssueDeficiency = true;
    let deficiencyBlockedReason = null;
    let deficiencyBlockedMessage = null;

    if (isTerminal || hasActiveDeficiency || isInstitution) {
      canIssueDeficiency = false;
      deficiencyBlockedReason = hasActiveDeficiency
        ? "DEFICIENCY_ALREADY_ACTIVE"
        : isTerminal
        ? "TERMINAL_STATE"
        : "INSUFFICIENT_PERMISSIONS";
      deficiencyBlockedMessage = hasActiveDeficiency
        ? `An official deficiency notice (Cycle #${app.returnCount || 1}) has already been issued and is awaiting institutional response. Cannot issue duplicate notice.`
        : isTerminal
        ? "Application is in terminal state."
        : "Institution users cannot issue deficiency notices.";
    }

    // 7. Permitted monitoring and administrative actions (remain available)
    const allowedAdministrativeActions = [];
    if (!isInstitution) {
      allowedAdministrativeActions.push(
        "delegate_task",
        "reassign_officer",
        "send_message",
        "view_dossier",
        "view_audit_history",
        "view_deficiencies"
      );
    }

    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      status: app.status,
      currentStageId: app.currentStageId,
      currentStageName: app.currentStageName,
      returnCount: app.returnCount || 0,
      hasActiveDeficiency,
      activeDeficiency: activeDeficiencyInfo,
      canAdvance,
      advanceBlockedReason,
      advanceBlockedMessage,
      canIssueDecision,
      decisionBlockedReason,
      decisionBlockedMessage,
      canScheduleEvc,
      evcBlockedReason,
      evcBlockedMessage,
      canIssueDeficiency,
      deficiencyBlockedReason,
      deficiencyBlockedMessage,
      allowedAdministrativeActions,
    };
  },

  /**
   * Asserts that an application is eligible to advance to the next level.
   * Throws HTTP 409 if an active deficiency is pending institutional response.
   */
  async assertCanAdvance(applicationId, user = null) {
    const eligibility = await this.getEligibility(applicationId, user);
    if (!eligibility.canAdvance) {
      const status = eligibility.advanceBlockedReason === "DEFICIENCY_RESPONSE_PENDING" ? 409 : 403;
      throw Object.assign(
        new Error(eligibility.advanceBlockedMessage || "Application cannot be advanced at this time."),
        {
          status,
          code: eligibility.advanceBlockedReason,
          activeDeficiency: eligibility.activeDeficiency,
        }
      );
    }
    return eligibility;
  },

  /**
   * Asserts that a final regulatory decision can be recorded.
   * Throws HTTP 409 if an active deficiency is pending institutional response.
   */
  async assertCanDecide(applicationId, user = null) {
    const eligibility = await this.getEligibility(applicationId, user);
    if (!eligibility.canIssueDecision) {
      const status = eligibility.decisionBlockedReason === "DEFICIENCY_RESPONSE_PENDING" ? 409 : 403;
      throw Object.assign(
        new Error(eligibility.decisionBlockedMessage || "Final decision cannot be recorded at this time."),
        {
          status,
          code: eligibility.decisionBlockedReason,
          activeDeficiency: eligibility.activeDeficiency,
        }
      );
    }
    return eligibility;
  },

  /**
   * Asserts that an EVC inspection visit can be scheduled.
   * Throws HTTP 409 if an active deficiency is pending institutional response.
   */
  async assertCanScheduleEvc(applicationId, user = null) {
    const eligibility = await this.getEligibility(applicationId, user);
    if (!eligibility.canScheduleEvc) {
      const status = eligibility.evcBlockedReason === "DEFICIENCY_RESPONSE_PENDING" ? 409 : 403;
      throw Object.assign(
        new Error(eligibility.evcBlockedMessage || "Cannot schedule EVC visit at this time."),
        {
          status,
          code: eligibility.evcBlockedReason,
          activeDeficiency: eligibility.activeDeficiency,
        }
      );
    }
    return eligibility;
  },

  /**
   * Asserts that a new deficiency notice can be issued.
   * Throws HTTP 400 if an active deficiency notice is already pending.
   */
  async assertCanIssueDeficiency(applicationId, user = null) {
    const eligibility = await this.getEligibility(applicationId, user);
    if (!eligibility.canIssueDeficiency) {
      throw Object.assign(
        new Error(eligibility.deficiencyBlockedMessage || "Cannot issue deficiency notice at this time."),
        {
          status: 400,
          code: eligibility.deficiencyBlockedReason,
          activeDeficiency: eligibility.activeDeficiency,
        }
      );
    }
    return eligibility;
  },

  /**
   * Authorized, audited reconciliation mechanism for applications whose persisted
   * status desynchronized from an active official deficiency notice.
   * Restores status to 'awaiting_institution' and stage to 'clarification'.
   * Preserves full historical audit events without deletion or cycle increment.
   */
  async reconcileApplicationDeficiencyState(applicationIdOrNumber, actor = null) {
    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: applicationIdOrNumber }, { applicationNumber: applicationIdOrNumber }],
      },
      include: {
        deficiencies: {
          where: { status: "pending" },
          orderBy: { createdAt: "desc" },
        },
        workflowInstance: true,
      },
    });

    if (!app) {
      throw Object.assign(new Error("Application not found."), { status: 404 });
    }

    const pendingDef = app.deficiencies?.[0];
    if (!pendingDef) {
      return {
        reconciled: false,
        message: "No active pending deficiency found. Persisted state is already consistent.",
        application: app,
      };
    }

    // If state is already awaiting_institution and clarification, no reconciliation needed
    if (app.status === "awaiting_institution" && app.currentStageId === "clarification") {
      return {
        reconciled: false,
        message: "Application state already reflects active deficiency notice.",
        application: app,
      };
    }

    const now = new Date();
    const previousStatus = app.status;
    const previousStage = app.currentStageId;

    return prisma.$transaction(async (tx) => {
      // 1. Restore application state
      const updatedApp = await tx.application.update({
        where: { id: app.id },
        data: {
          status: "awaiting_institution",
          currentStageId: "clarification",
          currentStageName: "Deficiency Resolution Required",
          currentAssigneeRole: "institution",
          dueAt: pendingDef.dueAt || app.dueAt,
          lastActionAt: now,
          returnCount: app.returnCount || 1, // Preserve Cycle #1, do not increment!
        },
      });

      // 2. Restore WorkflowInstance if present
      if (app.workflowInstance) {
        await tx.workflowInstance.update({
          where: { id: app.workflowInstance.id },
          data: {
            currentStageKey: "clarification",
            overallStatus: "AWAITING_INSTITUTE",
          },
        });
      }

      // 3. Reconcile tasks: cancel erroneously created scrutiny action tasks
      await tx.workflowTask.updateMany({
        where: {
          applicationId: app.id,
          taskType: { in: ["scrutiny_action", "scrutiny_review"] },
          status: "open",
        },
        data: {
          status: "cancelled",
          completedAt: now,
        },
      });

      // 4. Record official immutable AuditEvent documenting the authorized state correction
      await tx.auditEvent.create({
        data: {
          applicationId: app.id,
          actorUserId: actor?.id || "SYSTEM_RECONCILIATION",
          actorRole: actor?.role || "system",
          action: "APPLICATION_STATE_RECONCILED_DEFICIENCY_ACTIVE",
          fromStage: previousStage,
          toStage: "clarification",
          reason: `Reconciled application state to 'awaiting_institution' per active official Deficiency Notice #${pendingDef.id} (Cycle #${app.returnCount || 1}). Erroneous intermediate forward transition corrected.`,
          metadataJson: JSON.stringify({
            reconciliationType: "ACTIVE_DEFICIENCY_STATE_RESTORE",
            deficiencyId: pendingDef.id,
            deficiencyCycle: app.returnCount || 1,
            previousStatus,
            previousStage,
            restoredStatus: "awaiting_institution",
            restoredStage: "clarification",
            actionId: "act-78b6f9e742a5",
          }),
        },
      });

      return {
        reconciled: true,
        message: `Successfully reconciled application ${app.applicationNumber} to 'awaiting_institution'.`,
        application: updatedApp,
        deficiencyId: pendingDef.id,
      };
    });
  },
};
