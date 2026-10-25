import prisma from "../db/prisma.js";
import { workflowService } from "./workflow.service.js";
import { workflowInstanceService } from "./workflowInstance.service.js";

export const applicationService = {
  async saveDraft(user, data, applicationId = null) {
    let institutionId = user.institutionId;
    if (!institutionId && user.email) {
      const u = await prisma.user.findUnique({ where: { email: user.email } });
      institutionId = u?.institutionId || "inst-001";
    }
    if (!institutionId) {
      institutionId = "inst-001";
    }

    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new Error("Associated institution not found.");
    }

    // Resolve application type if provided
    let appType = null;
    const typeIdentifier = data.applicationTypeId || data.applicationCategory || data.code;
    if (typeIdentifier) {
      appType = await prisma.applicationType.findFirst({
        where: {
          OR: [{ id: typeIdentifier }, { code: typeIdentifier }],
        },
      });
    }

    const category = appType ? appType.name : data.applicationCategory || "Extension of Approval — EoA";

    // 1. If updating an existing draft
    if (applicationId) {
      const existing = await prisma.application.findUnique({
        where: { id: applicationId },
      });
      if (!existing) {
        throw new Error("Application draft not found.");
      }
      if (user.accountType === "institution" && existing.institutionId !== institutionId) {
        const err = new Error("Access denied: You do not own this application.");
        err.status = 403;
        throw err;
      }
      if (existing.status !== "draft") {
        const err = new Error(`Application cannot be edited as draft because its status is '${existing.status}'.`);
        err.status = 400;
        throw err;
      }

      const updated = await prisma.application.update({
        where: { id: applicationId },
        data: {
          formDataJson: data.formData ? JSON.stringify(data.formData) : existing.formDataJson,
          applicationTypeId: appType?.id || existing.applicationTypeId,
          applicationCategory: category,
          lastActionAt: new Date(),
        },
        include: {
          documents: true,
          fieldValues: true,
          applicationType: {
            include: {
              fieldDefinitions: true,
              documentRequirements: true,
            },
          },
        },
      });

      // Synchronize ApplicationFieldValue records
      if (data.formData && typeof data.formData === "object") {
        for (const [key, val] of Object.entries(data.formData)) {
          const stringVal = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
          await prisma.applicationFieldValue.upsert({
            where: {
              applicationId_fieldKey: {
                applicationId: updated.id,
                fieldKey: key,
              },
            },
            update: { fieldValue: stringVal },
            create: {
              applicationId: updated.id,
              fieldKey: key,
              fieldValue: stringVal,
            },
          });
        }
      }

      return updated;
    }

    // 2. Creating a new draft
    const now = new Date();
    const typePrefix = (appType?.code || "app").toUpperCase().slice(0, 4);
    const randSuffix = Math.floor(100000 + Math.random() * 900000);
    const appNumber = `AICTE-2026-${typePrefix}-${randSuffix}`;

    const created = await prisma.application.create({
      data: {
        applicationNumber: appNumber,
        institutionId,
        applicationCategory: category,
        applicationTypeId: appType?.id,
        status: "draft",
        currentStageId: "draft",
        currentStageName: "Application Draft",
        currentAssigneeRole: "institution",
        regionId: institution.regionId,
        workflowDefinitionId: `wf-${appType?.code || "standard"}`,
        workflowVersion: "v-2.4",
        returnCount: 0,
        requiresEvc: appType?.requiresEvc || false,
        formDataJson: data.formData ? JSON.stringify(data.formData) : "{}",
        createdById: user.id || "inst-user-1",
        stageEnteredAt: now,
        lastActionAt: now,
      },
      include: {
        documents: true,
        fieldValues: true,
        applicationType: {
          include: {
            fieldDefinitions: true,
            documentRequirements: true,
          },
        },
      },
    });

    // Save field values
    if (data.formData && typeof data.formData === "object") {
      for (const [key, val] of Object.entries(data.formData)) {
        const stringVal = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
        await prisma.applicationFieldValue.create({
          data: {
            applicationId: created.id,
            fieldKey: key,
            fieldValue: stringVal,
          },
        });
      }
    }

    // Create Audit Event
    await prisma.auditEvent.create({
      data: {
        applicationId: created.id,
        actorUserId: user.id,
        actorRole: user.role || "institution",
        action: "APPLICATION_DRAFT_CREATED",
        fromStage: "none",
        toStage: "draft",
        reason: "New application draft initiated by institution.",
      },
    });

    return created;
  },

  async submitApplication(user, applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        institution: true,
        documents: true,
        applicationType: {
          include: {
            fieldDefinitions: { where: { active: true }, orderBy: { displayOrder: "asc" } },
            documentRequirements: { orderBy: { displayOrder: "asc" } },
          },
        },
      },
    });

    if (!application) {
      throw new Error("Application not found.");
    }

    if (user.accountType === "institution" && user.institutionId && application.institutionId !== user.institutionId) {
      const err = new Error("Access denied: You do not own this application.");
      err.status = 403;
      throw err;
    }

    if (application.status !== "draft") {
      const err = new Error(`Application cannot be submitted because its current status is '${application.status}'.`);
      err.status = 400;
      throw err;
    }

    // Parse entered form fields
    const formData = application.formDataJson ? JSON.parse(application.formDataJson) : {};

    // 1. Mandatory Field Validation
    const missingFields = [];
    const validationErrors = [];

    if (application.applicationType?.fieldDefinitions?.length > 0) {
      for (const field of application.applicationType.fieldDefinitions) {
        if (field.required) {
          const val = formData[field.fieldKey];
          if (
            val === undefined ||
            val === null ||
            val === "" ||
            (field.fieldType === "boolean" && val !== true && val !== "true" && val !== 1)
          ) {
            missingFields.push(field.fieldKey);
          }
        }

        // Custom validation rules
        if (field.validationRule) {
          if (field.validationRule.startsWith("greater_than:")) {
            const compareKey = field.validationRule.split(":")[1];
            const currentVal = Number(formData[field.fieldKey]);
            const targetVal = Number(formData[compareKey]);
            if (!isNaN(currentVal) && !isNaN(targetVal) && currentVal <= targetVal) {
              validationErrors.push(
                `${field.label} (${currentVal}) must be strictly greater than ${compareKey.replace(/_/g, " ")} (${targetVal}).`
              );
            }
          }
          if (field.validationRule.startsWith("less_than:")) {
            const compareKey = field.validationRule.split(":")[1];
            const currentVal = Number(formData[field.fieldKey]);
            const targetVal = Number(formData[compareKey]);
            if (!isNaN(currentVal) && !isNaN(targetVal) && currentVal >= targetVal) {
              validationErrors.push(
                `${field.label} (${currentVal}) must be strictly less than ${compareKey.replace(/_/g, " ")} (${targetVal}).`
              );
            }
          }
        }
      }
    }

    if (missingFields.length > 0) {
      const err = new Error("Required fields are incomplete");
      err.status = 400;
      err.missingFields = missingFields;
      err.validationErrors = validationErrors;
      throw err;
    }

    if (validationErrors.length > 0) {
      const err = new Error(validationErrors.join("; "));
      err.status = 400;
      err.validationErrors = validationErrors;
      throw err;
    }

    // 2. Mandatory Document Validation
    const missingDocuments = [];
    if (application.applicationType?.documentRequirements?.length > 0) {
      for (const reqDoc of application.applicationType.documentRequirements) {
        if (reqDoc.required) {
          const hasDoc = application.documents.some(
            (d) =>
              (d.documentRequirementId && d.documentRequirementId === reqDoc.id) ||
              (d.documentType && d.documentType.toLowerCase().trim() === reqDoc.documentName.toLowerCase().trim())
          );
          if (!hasDoc) {
            missingDocuments.push(reqDoc.documentName);
          }
        }
      }
    }

    if (missingDocuments.length > 0) {
      const err = new Error("Required documents are missing");
      err.status = 400;
      err.missingDocuments = missingDocuments;
      throw err;
    }

    // 3. Resolve Authorized Scrutiny Member
    /* 
    // PRODUCTION POOL SELECTION (Commented out for testing):
    const scrutinyMember = await prisma.staff.findFirst({
      where: {
        committeeMembers: {
          some: {
            committee: { code: "SCRUTINY" },
            status: "ACTIVE",
          },
        },
        employmentStatus: "SYNTHETIC_ACTIVE",
      },
      include: {
        committeeMembers: {
          where: { committee: { code: "SCRUTINY" } },
        },
      },
    });
    */

    // FIXED SINGLE SCRUTINY MEMBER FOR TESTING:
    // Pinned to Dr. Mihir Tiwari (DEMO-AIC-034 / staff034@aicte-demo.test)
    // All submitted applications route directly to this single Scrutiny Member login.
    const scrutinyMember = await prisma.staff.findUnique({
      where: { employeeCode: "DEMO-AIC-034" },
      include: {
        committeeMembers: {
          where: { committee: { code: "SCRUTINY" } },
        },
      },
    });

    const now = new Date();
    const initialStage = workflowService.getStage("scrutiny");
    const deadline = workflowService.calculateDeadline(initialStage.deadlineDays || 14);

    const result = await prisma.$transaction(async (tx) => {
      // 4. Update Application Status to in_review / scrutiny
      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: "in_review",
          currentStageId: "scrutiny",
          currentStageName: "Scrutiny Committee Review",
          currentAssigneeRole: "scrutiny_committee",
          assignedUserId: scrutinyMember?.employeeCode || "DEMO-AIC-034",
          submittedAt: now,
          stageEnteredAt: now,
          dueAt: deadline,
          lastActionAt: now,
        },
        include: {
          documents: true,
          fieldValues: true,
          institution: true,
          applicationType: true,
        },
      });

      // 5. Create Workflow Assignment
      if (scrutinyMember) {
        await tx.workflowAssignment.create({
          data: {
            staffId: scrutinyMember.id,
            applicationId: application.id,
            roleInWorkflow: "SCRUTINY_OFFICER",
            status: "ASSIGNED",
          },
        });
      }

      // 6. Create Workflow Task
      await tx.workflowTask.create({
        data: {
          applicationId: application.id,
          taskType: "scrutiny_review",
          title: `Scrutiny Review for ${application.applicationNumber}`,
          description: `Conduct statutory document verification and scrutiny audit for ${application.institution.institutionName}.`,
          assignedRole: "scrutiny_committee",
          assignedUserId: scrutinyMember?.employeeCode || "DEMO-AIC-034",
          status: "open",
          priority: "normal",
          dueAt: deadline,
          sourceStageId: "scrutiny",
        },
      });

      // 7. Audit Event
      await tx.auditEvent.create({
        data: {
          applicationId: application.id,
          actorUserId: user.id,
          actorRole: user.role || "institution",
          action: "APPLICATION_SUBMITTED",
          fromStage: "draft",
          toStage: "scrutiny",
          reason: "Statutory application verified and formally submitted by institution head.",
          metadataJson: JSON.stringify({
            applicationNumber: application.applicationNumber,
            category: application.applicationCategory,
            assignedOfficer: scrutinyMember?.name || "Scrutiny Committee",
          }),
        },
      });

      // 8. Notification to Institution
      await tx.notification.create({
        data: {
          recipientUserId: application.createdById,
          applicationId: application.id,
          type: "application_submitted",
          title: `Application ${application.applicationNumber} Submitted`,
          message: `Your statutory application for ${application.applicationCategory} has been formally submitted and assigned to AICTE Scrutiny.`,
          priority: "normal",
          actionUrl: `/institution/applications/${application.id}`,
          deduplicationKey: `${application.id}:submit_ack`,
        },
      });

      return updated;
    });

    // 9. Initialize detailed persistent workflow instance
    try {
      await workflowInstanceService.initializeForApplication(result);
    } catch (workflowErr) {
      console.error("Warning: Failed to initialize workflow instance:", workflowErr.message);
    }

    return result;
  },

  async createApplication(user, data) {
    if (data.status === "draft" || !data.isFinalSubmit) {
      return this.saveDraft(user, data);
    }
    const draft = await this.saveDraft(user, data);
    return this.submitApplication(user, draft.id);
  },

  async advanceStage(user, applicationId, reason) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { institution: true },
    });
    if (!application) throw new Error("Application not found.");

    if (user.accountType === "institution") {
      throw new Error("Unauthorized: Institution users cannot advance regulatory stages.");
    }

    const nextStage = workflowService.resolveNextStage(
      application.currentStageId,
      application.requiresEvc
    );

    if (!nextStage) {
      throw new Error(`No subsequent stage found for ${application.currentStageId}.`);
    }

    const now = new Date();
    const newDeadline = workflowService.calculateDeadline(nextStage.deadlineDays);

    return prisma.$transaction(async (tx) => {
      // FIXED SINGLE NEXT-STAGE OFFICER FOR TESTING:
      // Pinned to single dedicated officers so each stage can be inspected from a specific login:
      // - If EVC Inspection required: DEMO-AIC-037 (Neha Rao - EVC Coordinator / staff037@aicte-demo.test)
      // - If Hearing / Final Decision: DEMO-AIC-013 (Karan Sinha - Regional Officer / staff013@aicte-demo.test)
      const nextOfficerCode = nextStage.stageId === "evc" ? "DEMO-AIC-037" : "DEMO-AIC-013";

      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          currentStageId: nextStage.stageId,
          currentStageName: nextStage.stageName,
          currentAssigneeRole: nextStage.responsibleRole,
          assignedUserId: nextOfficerCode,
          stageEnteredAt: now,
          dueAt: newDeadline,
          lastActionAt: now,
          status: nextStage.stageId === "evc" ? "pending_evc" : "in_review",
        },
      });

      // 2. Complete previous open tasks
      await tx.workflowTask.updateMany({
        where: {
          applicationId,
          sourceStageId: application.currentStageId,
          status: "open",
        },
        data: {
          status: "completed",
          completedAt: now,
        },
      });

      // 3. Create next task
      await tx.workflowTask.create({
        data: {
          applicationId,
          taskType: `${nextStage.stageId}_action`,
          title: `${nextStage.stageName}: ${application.applicationNumber}`,
          description: `Action assigned to ${nextStage.responsibleRole} for ${application.institution.institutionName}.`,
          assignedRole: nextStage.responsibleRole,
          status: "open",
          priority: "normal",
          dueAt: newDeadline,
          sourceStageId: nextStage.stageId,
        },
      });

      // 4. Create Audit Event
      await tx.auditEvent.create({
        data: {
          applicationId,
          actorUserId: user.id,
          actorRole: user.role,
          action: "STAGE_ADVANCED",
          fromStage: application.currentStageId,
          toStage: nextStage.stageId,
          reason: reason || "Stage scrutiny completed satisfactorily.",
        },
      });

      // 5. Notify the institution
      await tx.notification.create({
        data: {
          recipientUserId: application.createdById,
          applicationId,
          type: "stage_advanced",
          title: `Application Advanced to ${nextStage.stageName}`,
          message: `Application ${application.applicationNumber} has successfully moved to ${nextStage.stageName}.`,
          priority: "normal",
          actionUrl: `/institution/applications/${application.id}`,
          deduplicationKey: `${application.id}:${nextStage.stageId}:advanced`,
        },
      });

      return updated;
    });
  },

  async returnForClarification(user, applicationId, deficiencyText) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { institution: true },
    });
    if (!application) throw new Error("Application not found.");

    if (user.accountType === "institution") {
      throw new Error("Unauthorized: Institution users cannot issue deficiency notices.");
    }

    const now = new Date();
    // Statutory 10-day deficiency response window
    const deficiencyDeadline = workflowService.calculateDeadline(10);

    return prisma.$transaction(async (tx) => {
      // 1. Update Application status to awaiting_institution
      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: "awaiting_institution",
          currentStageId: "clarification",
          currentStageName: "Clarification / Deficiency Resolution",
          currentAssigneeRole: "institution",
          dueAt: deficiencyDeadline,
          lastActionAt: now,
          returnCount: { increment: 1 },
        },
      });

      // 2. Create Deficiency Request Record
      await tx.deficiencyRequest.create({
        data: {
          applicationId,
          raisedById: user.id,
          deficiencyText,
          status: "pending",
          dueAt: deficiencyDeadline,
        },
      });

      // 3. Create Task for Institution
      await tx.workflowTask.create({
        data: {
          applicationId,
          taskType: "deficiency_response",
          title: `Clarification Required: ${application.applicationNumber}`,
          description: deficiencyText,
          assignedRole: "institution",
          assignedUserId: application.createdById,
          status: "open",
          priority: "high",
          dueAt: deficiencyDeadline,
          sourceStageId: "clarification",
        },
      });

      // 4. Create Audit Event
      await tx.auditEvent.create({
        data: {
          applicationId,
          actorUserId: user.id,
          actorRole: user.role,
          action: "DEFICIENCY_LETTER_ISSUED",
          fromStage: application.currentStageId,
          toStage: "clarification",
          reason: deficiencyText,
        },
      });

      // 5. Send High-Priority Notification to Institution
      await tx.notification.create({
        data: {
          recipientUserId: application.createdById,
          applicationId,
          type: "deficiency_issued",
          title: `Deficiency Letter: ${application.applicationNumber}`,
          message: `AICTE has flagged deficiencies: "${deficiencyText}". You have 10 statutory days to respond.`,
          priority: "urgent",
          actionUrl: `/institution/applications/${application.id}`,
          deduplicationKey: `${application.id}:deficiency:${now.getTime()}`,
        },
      });

      return updated;
    });
  },

  async respondToDeficiency(user, applicationId, responseText) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw new Error("Application not found.");

    if (user.accountType !== "institution" || user.institutionId !== application.institutionId) {
      throw new Error("Unauthorized: Only the applicant institution can respond to deficiencies.");
    }

    const now = new Date();
    const scrutinyStage = workflowService.getStage("scrutiny");
    const newDeadline = workflowService.calculateDeadline(scrutinyStage.deadlineDays);

    return prisma.$transaction(async (tx) => {
      // 1. Mark latest pending deficiency resolved
      const pendingDeficiency = await tx.deficiencyRequest.findFirst({
        where: { applicationId, status: "pending" },
        orderBy: { createdAt: "desc" },
      });

      if (pendingDeficiency) {
        await tx.deficiencyRequest.update({
          where: { id: pendingDeficiency.id },
          data: {
            status: "resolved",
            respondedAt: now,
            responseText,
            respondedById: user.id,
          },
        });
      }

      // 2. Advance application back to Scrutiny
      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: "in_review",
          currentStageId: scrutinyStage.stageId,
          currentStageName: scrutinyStage.stageName,
          currentAssigneeRole: scrutinyStage.responsibleRole,
          dueAt: newDeadline,
          lastActionAt: now,
        },
      });

      // 3. Complete institution deficiency task
      await tx.workflowTask.updateMany({
        where: {
          applicationId,
          sourceStageId: "clarification",
          status: "open",
        },
        data: {
          status: "completed",
          completedAt: now,
        },
      });

      // 4. Create new scrutiny task
      await tx.workflowTask.create({
        data: {
          applicationId,
          taskType: "re_scrutiny",
          title: `Re-evaluate Clarification: ${application.applicationNumber}`,
          description: `Institution replied to deficiency notice: "${responseText}"`,
          assignedRole: scrutinyStage.responsibleRole,
          status: "open",
          priority: "high",
          dueAt: newDeadline,
          sourceStageId: scrutinyStage.stageId,
        },
      });

      // 5. Audit event
      await tx.auditEvent.create({
        data: {
          applicationId,
          actorUserId: user.id,
          actorRole: user.role,
          action: "DEFICIENCY_RESOLVED_BY_INSTITUTION",
          fromStage: "clarification",
          toStage: scrutinyStage.stageId,
          reason: responseText,
        },
      });

      return updated;
    });
  },

  async recordDecision(user, applicationId, decision, remarks, conditions) {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: { institution: true },
    });
    if (!application) throw new Error("Application not found.");

    if (
      user.accountType === "institution" ||
      (user.role !== "bureau_officer" &&
        user.role !== "competent_authority" &&
        user.role !== "admin")
    ) {
      throw new Error(`Unauthorized: Role '${user.role}' cannot issue final approval/rejection orders.`);
    }

    const now = new Date();
    const isApproved = decision === "grant_approval";

    return prisma.$transaction(async (tx) => {
      // 1. Update application status
      const updated = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: isApproved ? "approved" : "rejected",
          currentStageId: "decision",
          currentStageName: isApproved ? "Approval Order Issued" : "Application Rejected",
          currentAssigneeRole: "",
          dueAt: null,
          lastActionAt: now,
        },
      });

      // 2. Complete all remaining open tasks
      await tx.workflowTask.updateMany({
        where: {
          applicationId,
          status: "open",
        },
        data: {
          status: "completed",
          completedAt: now,
        },
      });

      // 3. If approved with conditions, create Undertakings
      if (isApproved && conditions && conditions.length > 0) {
        for (const cond of conditions) {
          if (cond && cond.trim()) {
            const undertakingDeadline = new Date();
            undertakingDeadline.setMonth(undertakingDeadline.getMonth() + 6);

            await tx.undertaking.create({
              data: {
                applicationId,
                institutionId: application.institutionId,
                condition: cond.trim(),
                description: `Statutory condition imposed in Approval Order for ${application.applicationNumber}`,
                dueAt: undertakingDeadline,
                status: "pending",
              },
            });
          }
        }
      }

      // 4. Audit Event
      await tx.auditEvent.create({
        data: {
          applicationId,
          actorUserId: user.id,
          actorRole: user.role,
          action: isApproved ? "APPROVAL_ORDER_ISSUED" : "APPLICATION_REJECTED",
          fromStage: application.currentStageId,
          toStage: "decision",
          reason: remarks,
          metadataJson: JSON.stringify({
            decision,
            conditions: conditions || [],
          }),
        },
      });

      // 5. Notification to Institution
      await tx.notification.create({
        data: {
          recipientUserId: application.createdById,
          applicationId,
          type: isApproved ? "application_approved" : "application_rejected",
          title: isApproved
            ? `Approval Order: ${application.applicationNumber}`
            : `Decision Notice: ${application.applicationNumber}`,
          message: isApproved
            ? `AICTE has GRANTED APPROVAL for ${application.applicationCategory.replace(/_/g, " ")}. Official order is available.`
            : `AICTE has REJECTED petition ${application.applicationNumber}. Remarks: ${remarks}`,
          priority: isApproved ? "high" : "urgent",
          actionUrl: `/institution/applications/${application.id}`,
          deduplicationKey: `${application.id}:final_decision`,
        },
      });

      return updated;
    });
  },
};
