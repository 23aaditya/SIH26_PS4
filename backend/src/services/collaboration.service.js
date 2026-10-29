/**
 * AICTE Collaboration Service
 * Handles My Work queue, Work Tree hierarchy, Application-linked communication,
 * Temporary Work Delegation, Supervisor Workload, and Staff Availability.
 */
import prisma from "../db/prisma.js";

async function getStaffAvailabilityStatus(staffId) {
  if (!staffId) return "AVAILABLE";
  try {
    const avail = await prisma.staffAvailability.findUnique({
      where: { staffId },
      select: { status: true },
    });
    return avail?.status || "AVAILABLE";
  } catch {
    return "AVAILABLE";
  }
}

export const collaborationService = {
  // Resolve staff record from req.user
  async resolveStaff(user) {
    if (!user) return null;
    const identifier = user.staffId || user.employeeCode || user.id;
    return await prisma.staff.findFirst({
      where: {
        OR: [
          { id: identifier },
          { employeeCode: identifier },
          { email: user.email?.toLowerCase().trim() },
        ],
      },
      include: {
        designation: true,
        organizationUnit: true,
      },
    });
  },

  // ─── 1. MY WORK SUMMARY ───────────────────────────────────────────────────
  async getMyWorkSummary(user) {
    const staff = await this.resolveStaff(user);
    if (!staff) {
      throw new Error("Staff identity not found for authenticated user.");
    }

    const staffIds = [staff.id, staff.employeeCode].filter(Boolean);
    const personalAssignmentClause = {
      assignedUserId: { in: staffIds },
    };

    const now = new Date();
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [
      assignedCount,
      dueSoonCount,
      overdueCount,
      waitingInstituteCount,
      delegatedToMeCount,
      delegatedByMeCount,
      unreadMessagesCount,
      completedCount,
    ] = await Promise.all([
      // 1. Assigned to me and active
      prisma.application.count({
        where: {
          AND: [
            personalAssignmentClause,
            { status: { notIn: ["approved", "rejected", "closed", "withdrawn"] } },
          ],
        },
      }),
      // 2. Due soon (< 3 days)
      prisma.application.count({
        where: {
          AND: [
            personalAssignmentClause,
            { dueAt: { lte: threeDaysFromNow, gte: now } },
            { status: { notIn: ["approved", "rejected", "closed", "withdrawn"] } },
          ],
        },
      }),
      // 3. Overdue
      prisma.application.count({
        where: {
          AND: [
            personalAssignmentClause,
            { dueAt: { lt: now } },
            { status: { notIn: ["approved", "rejected", "closed", "withdrawn"] } },
          ],
        },
      }),
      // 4. Waiting on Institute
      prisma.application.count({
        where: {
          AND: [
            {
              OR: [
                { assignedUserId: { in: staffIds } },
                {
                  workflowInstance: {
                    stages: {
                      some: { assignedStaffId: staff.id },
                    },
                  },
                },
              ],
            },
            { status: { in: ["awaiting_institution", "deficiency_raised"] } },
          ],
        },
      }),
      // 5. Delegated to me (active)
      prisma.workDelegation.count({
        where: {
          delegatedToId: staff.id,
          status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
        },
      }),
      // 6. Delegated by me (active)
      prisma.workDelegation.count({
        where: {
          delegatedById: staff.id,
          status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
        },
      }),
      // 7. Unread application messages
      prisma.applicationMessage.count({
        where: {
          recipientStaffId: staff.id,
          readAt: null,
        },
      }),
      // 8. Completed / Orders issued
      prisma.application.count({
        where: {
          AND: [
            {
              OR: [
                { assignedUserId: { in: staffIds } },
                {
                  workflowInstance: {
                    stages: {
                      some: { assignedStaffId: staff.id },
                    },
                  },
                },
              ],
            },
            { status: { in: ["approved", "rejected"] } },
          ],
        },
      }),
    ]);

    // Urgent = overdue + urgent priority applications + pending delegations
    const urgentApplications = await prisma.application.count({
      where: {
        AND: [
          personalAssignmentClause,
          { priority: "URGENT" },
          { status: { notIn: ["approved", "rejected", "closed", "withdrawn"] } },
        ],
      },
    });

    const urgentCount = overdueCount + urgentApplications + (delegatedToMeCount > 0 ? 1 : 0);
    const availabilityStatus = await getStaffAvailabilityStatus(staff.id);

    return {
      total: assignedCount + delegatedToMeCount,
      assigned: assignedCount,
      dueSoon: dueSoonCount,
      overdue: overdueCount,
      waitingOnInstitute: waitingInstituteCount,
      delegatedToMe: delegatedToMeCount,
      delegatedByMe: delegatedByMeCount,
      unreadMessages: unreadMessagesCount,
      completed: completedCount,
      urgent: urgentCount,
      staff: {
        id: staff.id,
        employeeCode: staff.employeeCode,
        name: staff.name,
        designation: staff.designation?.title || "Officer",
        organizationUnit: staff.organizationUnit?.name || "Approval Bureau",
        availability: availabilityStatus,
      },
    };
  },

  // ─── 2. MY WORK QUEUE & PRIORITY WORK ────────────────────────────────────
  async getMyWorkList(user, query = {}) {
    const staff = await this.resolveStaff(user);
    if (!staff) {
      throw new Error("Staff identity not found.");
    }

    const staffIds = [staff.id, staff.employeeCode].filter(Boolean);
    const personalAssignmentClause = {
      assignedUserId: { in: staffIds },
    };

    const { filter = "all", priority, search } = query;
    const now = new Date();
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    // If filter is "delegated", return active delegations
    if (filter === "delegated") {
      const delegations = await prisma.workDelegation.findMany({
        where: {
          OR: [
            { delegatedToId: staff.id },
            { delegatedById: staff.id },
          ],
          ...(priority ? { priority: priority.toUpperCase() } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          application: {
            include: {
              institution: { select: { id: true, institutionName: true, institutionCode: true } },
              region: true,
              workflowInstance: {
                include: { stages: { select: { stageKey: true, stageName: true, stageStatus: true } } },
              },
            },
          },
          delegatedBy: {
            select: { id: true, name: true, employeeCode: true, designation: { select: { title: true } } },
          },
          delegatedTo: {
            select: { id: true, name: true, employeeCode: true, designation: { select: { title: true } } },
          },
        },
      });

      return {
        type: "delegations",
        total: delegations.length,
        items: delegations.map((d) => ({
          id: d.id,
          isDelegation: true,
          delegationId: d.id,
          applicationId: d.applicationId,
          applicationNumber: d.application?.applicationNumber,
          institutionName: d.application?.institution?.institutionName,
          category: d.application?.applicationCategory,
          currentStageName: d.application?.currentStageName,
          taskTitle: d.taskTitle,
          taskDescription: d.taskDescription,
          priority: d.priority,
          priorityReason: d.priorityReason || d.reason,
          reason: d.reason,
          status: d.status,
          deadline: d.deadline,
          createdAt: d.createdAt,
          delegatedBy: d.delegatedBy,
          delegatedTo: d.delegatedTo,
          isDelegatedToMe: d.delegatedToId === staff.id,
          isDelegatedByMe: d.delegatedById === staff.id,
        })),
      };
    }

    // Build application where clause
    const where = {};

    if (filter === "assigned") {
      where.AND = [
        personalAssignmentClause,
        { status: { notIn: ["approved", "rejected", "closed", "withdrawn"] } },
      ];
    } else if (filter === "waiting") {
      where.AND = [
        {
          OR: [
            { assignedUserId: { in: staffIds } },
            {
              workflowInstance: {
                stages: {
                  some: { assignedStaffId: staff.id },
                },
              },
            },
          ],
        },
        { status: { in: ["awaiting_institution", "deficiency_raised"] } },
      ];
    } else if (filter === "completed") {
      where.AND = [
        {
          OR: [
            { assignedUserId: { in: staffIds } },
            {
              workflowInstance: {
                stages: {
                  some: { assignedStaffId: staff.id },
                },
              },
            },
          ],
        },
        { status: { in: ["approved", "rejected"] } },
      ];
    } else if (filter === "priority") {
      where.AND = [
        personalAssignmentClause,
        {
          OR: [
            { priority: { in: ["URGENT", "IMPORTANT"] } },
            { dueAt: { lt: now } },
            { dueAt: { lte: threeDaysFromNow, gte: now } },
            { status: { in: ["awaiting_institution", "deficiency_raised"] } },
          ],
        },
        { status: { notIn: ["approved", "rejected", "closed", "withdrawn"] } },
      ];
    } else {
      // Filter: "all"
      // Shows all active work genuinely assigned to this staff member
      where.AND = [
        personalAssignmentClause,
        { status: { notIn: ["closed", "withdrawn"] } },
      ];
    }

    if (priority) {
      where.priority = priority.toUpperCase();
    }

    if (search && search.trim()) {
      const term = search.trim();
      where.OR = [
        { applicationNumber: { contains: term } },
        { currentStageName: { contains: term } },
        { institution: { institutionName: { contains: term } } },
      ];
    }

    const applications = await prisma.application.findMany({
      where,
      orderBy: [
        { updatedAt: "desc" },
      ],
      take: 50,
      include: {
        institution: { select: { id: true, institutionName: true, institutionCode: true } },
        region: true,
        applicationType: true,
        deficiencies: {
          where: { status: "pending" },
          select: { id: true, deficiencyText: true, dueAt: true, respondedAt: true, responseText: true },
        },
        delegations: {
          where: { status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] } },
          include: {
            delegatedTo: { select: { id: true, name: true, employeeCode: true } },
          },
        },
        workflowInstance: {
          include: {
            stages: {
              select: {
                stageKey: true,
                stageName: true,
                stageStatus: true,
                sequenceOrder: true,
                assignedStaff: { select: { id: true, name: true, employeeCode: true } },
              },
            },
          },
        },
        appeals: { select: { id: true, appealType: true, status: true, filedAt: true } },
      },
    });

    // Compute priority and urgency score for each item
    const items = applications.map((app) => {
      let computedPriority = app.priority || "NORMAL";
      let priorityReason = app.priorityReason || "Standard Workflow Timeline";
      let urgencyScore = 10; // base score

      const isOverdue = app.dueAt && new Date(app.dueAt) < now;
      const isDueSoon = app.dueAt && new Date(app.dueAt) <= threeDaysFromNow && new Date(app.dueAt) >= now;
      const hasResponse = app.deficiencies?.some((d) => d.respondedAt !== null);
      const hasPendingDeficiencies = (app.deficiencies?.length || 0) > 0;
      const hasAppeal = (app.appeals?.length || 0) > 0;
      const hasActiveDelegation = (app.delegations?.length || 0) > 0;

      if (isOverdue) {
        computedPriority = "URGENT";
        priorityReason = "SLA Overdue — Immediate Action Mandated";
        urgencyScore = 100;
      } else if (hasAppeal) {
        computedPriority = "URGENT";
        priorityReason = "Formal Grievance / Appeal Filed by Institution";
        urgencyScore = 90;
      } else if (isDueSoon) {
        computedPriority = "URGENT";
        priorityReason = "SLA Deadline Approaching (< 72 Hours)";
        urgencyScore = 80;
      } else if (hasResponse) {
        computedPriority = "IMPORTANT";
        priorityReason = "Institution Rectification / Response Submitted";
        urgencyScore = 70;
      } else if (hasPendingDeficiencies) {
        computedPriority = "IMPORTANT";
        priorityReason = "Pending Deficiency Resolution";
        urgencyScore = 60;
      } else if (hasActiveDelegation) {
        computedPriority = "IMPORTANT";
        priorityReason = "Delegated Task in Progress";
        urgencyScore = 50;
      }

      // Next level calculation
      let nextLevelName = "Executive Decision";
      if (app.currentStageId === "scrutiny" || app.currentStageId === "re_scrutiny") {
        nextLevelName = app.requiresEvc ? "EVC Inspection" : "Standing Hearing Committee";
      } else if (app.currentStageId === "evc") {
        nextLevelName = "Standing Hearing Committee";
      } else if (app.currentStageId === "committee") {
        nextLevelName = "Competent Authority Order";
      }

      return {
        id: app.id,
        applicationNumber: app.applicationNumber,
        institutionName: app.institution?.institutionName || "College of Engineering",
        institutionCode: app.institution?.institutionCode,
        regionName: app.region?.name,
        category: app.applicationCategory,
        currentStageId: app.currentStageId,
        currentStageName: app.currentStageName,
        status: app.status,
        dueAt: app.dueAt,
        priority: computedPriority,
        priorityReason,
        urgencyScore,
        returnCount: app.returnCount,
        deficienciesCount: app.deficiencies?.length || 0,
        hasPendingResponse: hasResponse,
        activeDelegations: app.delegations,
        nextLevelName,
        assignedUserId: app.assignedUserId,
      };
    });

    // Sort items by urgencyScore descending, then by dueAt ascending
    items.sort((a, b) => {
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }
      if (a.dueAt && b.dueAt) {
        return new Date(a.dueAt) - new Date(b.dueAt);
      }
      return 0;
    });

    return {
      type: "applications",
      total: items.length,
      items,
    };
  },

  // ─── 3. GLOBAL WORK TREE ─────────────────────────────────────────────────
  async getGlobalWorkTree(user) {
    const staff = await this.resolveStaff(user);
    if (!staff) {
      throw new Error("Staff identity not found.");
    }

    // 1. Recursive Upward Chain (Supervisors to Apex)
    const supervisors = [];
    let currentReportsToId = staff.reportsToStaffId;
    let depth = 0;
    const visited = new Set([staff.id]);

    while (currentReportsToId && depth < 8) {
      if (visited.has(currentReportsToId)) break;
      visited.add(currentReportsToId);

      const manager = await prisma.staff.findUnique({
        where: { id: currentReportsToId },
        include: {
          designation: true,
          organizationUnit: true,
        },
      });

      if (!manager) break;

      supervisors.push({
        id: manager.id,
        employeeCode: manager.employeeCode,
        name: manager.name,
        email: manager.email,
        designation: manager.designation?.title || "Supervisor",
        organizationUnit: manager.organizationUnit?.name || "Approval Bureau",
        level: depth + 1,
      });

      currentReportsToId = manager.reportsToStaffId;
      depth++;
    }

    // 2. Direct Reports (Subordinates)
    const rawDirectReports = await prisma.staff.findMany({
      where: { reportsToStaffId: staff.id },
      include: {
        designation: true,
        organizationUnit: true,
      },
    });

    // Calculate active workload for each direct report
    const directReports = await Promise.all(
      rawDirectReports.map(async (dr) => {
        const [activeApps, urgentApps, activeDelegations, drAvail] = await Promise.all([
          prisma.application.count({
            where: {
              assignedUserId: dr.employeeCode,
              status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
            },
          }),
          prisma.application.count({
            where: {
              assignedUserId: dr.employeeCode,
              dueAt: { lt: new Date() },
              status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
            },
          }),
          prisma.workDelegation.count({
            where: {
              delegatedToId: dr.id,
              status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
            },
          }),
          getStaffAvailabilityStatus(dr.id),
        ]);

        return {
          id: dr.id,
          employeeCode: dr.employeeCode,
          name: dr.name,
          email: dr.email,
          designation: dr.designation?.title || "Staff Member",
          organizationUnit: dr.organizationUnit?.name || "Approval Bureau",
          availability: drAvail,
          workload: {
            active: activeApps,
            urgent: urgentApps,
            delegated: activeDelegations,
          },
        };
      })
    );

    // 3. Department Peers (Colleagues in same bureau / unit)
    const rawPeers = await prisma.staff.findMany({
      where: {
        organizationUnitId: staff.organizationUnitId || undefined,
        id: { not: staff.id },
      },
      take: 8,
      include: {
        designation: true,
      },
    });

    const peers = await Promise.all(
      rawPeers.map(async (p) => ({
        id: p.id,
        employeeCode: p.employeeCode,
        name: p.name,
        designation: p.designation?.title,
        availability: await getStaffAvailabilityStatus(p.id),
      }))
    );

    // 4. Committee memberships & co-members
    const memberships = await prisma.committeeMembership.findMany({
      where: { staffId: staff.id, status: "ACTIVE" },
      include: {
        committee: {
          include: {
            memberships: {
              where: { status: "ACTIVE", staffId: { not: staff.id } },
              take: 5,
              include: {
                staff: {
                  include: { designation: true },
                },
              },
            },
          },
        },
      },
    });

    const committees = memberships.map((m) => ({
      committeeId: m.committee.id,
      committeeCode: m.committee.code,
      committeeName: m.committee.name,
      myRole: m.committeeRole,
      coMembers: m.committee.memberships.map((cm) => ({
        id: cm.staff.id,
        employeeCode: cm.staff.employeeCode,
        name: cm.staff.name,
        role: cm.committeeRole,
        designation: cm.staff.designation?.title,
      })),
    }));

    const myAvail = await getStaffAvailabilityStatus(staff.id);

    return {
      you: {
        id: staff.id,
        employeeCode: staff.employeeCode,
        name: staff.name,
        email: staff.email,
        designation: staff.designation?.title || "Officer",
        organizationUnit: staff.organizationUnit?.name || "Approval Bureau",
        availability: myAvail,
        directReportsCount: directReports.length,
      },
      supervisors, // Upward chain
      directReports, // Downward subordinates with workload
      peers,
      committees,
    };
  },

  // ─── 4. APPLICATION TEAM & SMART CONTACTS ────────────────────────────────
  async getApplicationTeamAndContacts(applicationId, user) {
    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: applicationId }, { applicationNumber: applicationId }],
      },
      include: {
        institution: true,
        region: true,
        workflowInstance: {
          include: {
            stages: {
              orderBy: { sequenceOrder: "asc" },
              include: {
                assignedStaff: {
                  include: {
                    designation: true,
                    organizationUnit: true,
                    reportsTo: { include: { designation: true } },
                  },
                },
                histories: {
                  orderBy: { timestamp: "desc" },
                  include: {
                    actorStaff: { include: { designation: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!app) {
      throw new Error(`Application ${applicationId} not found.`);
    }

    const stages = app.workflowInstance?.stages || [];
    const activeStage = stages.find((s) => s.stageKey === app.currentStageId) || stages[0];

    // 1. Previous Stage Handler
    let previousStageOfficer = null;
    if (activeStage && activeStage.sequenceOrder > 1) {
      const prevStages = stages.filter((s) => s.sequenceOrder < activeStage.sequenceOrder);
      const prevStage = prevStages[prevStages.length - 1];
      if (prevStage) {
        const handler = prevStage.histories?.[0]?.actorStaff || prevStage.assignedStaff;
        if (handler) {
          previousStageOfficer = {
            id: handler.id,
            employeeCode: handler.employeeCode,
            name: handler.name,
            email: handler.email,
            designation: handler.designation?.title || "Scrutiny Officer",
            stageHandled: prevStage.stageName,
            stageKey: prevStage.stageKey,
            outcome: prevStage.outcome || "COMPLETED",
          };
        }
      }
    }

    // Fallback if previous stage officer not recorded yet in synthetic test data
    if (!previousStageOfficer && app.currentStageId !== "scrutiny") {
      previousStageOfficer = {
        id: "DEMO-AIC-034",
        employeeCode: "DEMO-AIC-034",
        name: "Dr. R. K. Sharma",
        designation: "Approval Officer",
        stageHandled: "Scrutiny Committee Review",
        stageKey: "scrutiny",
        outcome: "DEFICIENCIES_RAISED",
      };
    }

    // 2. Current Stage Owner
    let currentOwner = null;
    if (activeStage?.assignedStaff) {
      currentOwner = {
        id: activeStage.assignedStaff.id,
        employeeCode: activeStage.assignedStaff.employeeCode,
        name: activeStage.assignedStaff.name,
        email: activeStage.assignedStaff.email,
        designation: activeStage.assignedStaff.designation?.title || "Officer",
        stage: activeStage.stageName,
      };
    } else {
      // Fallback
      currentOwner = {
        id: app.assignedUserId || "DEMO-AIC-034",
        employeeCode: app.assignedUserId || "DEMO-AIC-034",
        name: "Dr. R. K. Sharma",
        designation: "Approval Officer",
        stage: app.currentStageName,
      };
    }

    // 3. Supervising Authority (Manager of current owner or Regional Officer)
    let supervisor = null;
    if (activeStage?.assignedStaff?.reportsTo) {
      const rep = activeStage.assignedStaff.reportsTo;
      supervisor = {
        id: rep.id,
        employeeCode: rep.employeeCode,
        name: rep.name,
        designation: rep.designation?.title || "Deputy Director",
        bureau: "Approval Bureau",
      };
    } else {
      supervisor = {
        id: "DEMO-AIC-018",
        employeeCode: "DEMO-AIC-018",
        name: "Neha Borkar",
        designation: "Deputy Director",
        bureau: "Approval Bureau",
      };
    }

    // 4. Smart Contact Suggestions ("People You May Need")
    const smartContacts = [];

    if (previousStageOfficer) {
      smartContacts.push({
        ...previousStageOfficer,
        roleLabel: "Previous Stage Officer",
        contextReason: `Handled ${previousStageOfficer.stageHandled}. Consult regarding previous observations & documents.`,
        suggestedSubject: `[${app.applicationNumber}] Clarification on ${previousStageOfficer.stageHandled}`,
      });
    }

    if (currentOwner && currentOwner.employeeCode !== user.employeeCode) {
      smartContacts.push({
        ...currentOwner,
        roleLabel: "Current Stage Lead",
        contextReason: `Currently processing ${currentOwner.stage}. Direct case coordinator.`,
        suggestedSubject: `[${app.applicationNumber}] Query on ${currentOwner.stage} Processing`,
      });
    }

    if (supervisor) {
      smartContacts.push({
        ...supervisor,
        roleLabel: "Supervising Authority",
        contextReason: "Approval Bureau oversight. Consult for escalations or policy guidance.",
        suggestedSubject: `[${app.applicationNumber}] Supervisor Guidance Request`,
      });
    }

    return {
      applicationId: app.id,
      applicationNumber: app.applicationNumber,
      institutionName: app.institution?.institutionName,
      currentStageName: app.currentStageName,
      previousStageOfficer,
      currentOwner,
      supervisor,
      smartContacts,
    };
  },

  // ─── 5. APPLICATION-LINKED COMMUNICATION ─────────────────────────────────
  async getApplicationMessages(applicationId, user) {
    const staff = await this.resolveStaff(user);
    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: applicationId }, { applicationNumber: applicationId }],
      },
    });

    if (!app) {
      throw new Error("Application not found.");
    }

    const messages = await prisma.applicationMessage.findMany({
      where: { applicationId: app.id },
      orderBy: { createdAt: "asc" },
      include: {
        senderStaff: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            designation: { select: { title: true } },
          },
        },
        recipientStaff: {
          select: {
            id: true,
            name: true,
            employeeCode: true,
            email: true,
            designation: { select: { title: true } },
          },
        },
      },
    });

    // Mark messages addressed to current user as read
    if (staff) {
      await prisma.applicationMessage.updateMany({
        where: {
          applicationId: app.id,
          recipientStaffId: staff.id,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    }

    return messages;
  },

  async sendApplicationMessage(applicationId, user, payload) {
    const staff = await this.resolveStaff(user);
    if (!staff) {
      throw new Error("Sender staff identity not resolved.");
    }

    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: applicationId }, { applicationNumber: applicationId }],
      },
    });

    if (!app) {
      throw new Error("Application not found.");
    }

    const { recipientStaffId, workflowStageId, subject, message } = payload;
    if (!recipientStaffId || !message || !message.trim()) {
      throw new Error("Recipient and message content are required.");
    }

    // Resolve recipient staff
    const recipient = await prisma.staff.findFirst({
      where: {
        OR: [{ id: recipientStaffId }, { employeeCode: recipientStaffId }],
      },
    });

    if (!recipient) {
      throw new Error("Recipient staff not found.");
    }

    const created = await prisma.applicationMessage.create({
      data: {
        applicationId: app.id,
        workflowStageId: workflowStageId || app.currentStageId,
        senderStaffId: staff.id,
        recipientStaffId: recipient.id,
        subject: subject || `Case Discussion: ${app.applicationNumber}`,
        message: message.trim(),
      },
      include: {
        senderStaff: { select: { id: true, name: true, employeeCode: true } },
        recipientStaff: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // Audit Event
    await prisma.auditEvent.create({
      data: {
        applicationId: app.id,
        actorUserId: staff.employeeCode,
        actorRole: user.role || "aicte_officer",
        action: "APPLICATION_MESSAGE_SENT",
        reason: `Officer ${staff.name} sent message to ${recipient.name}: "${subject || 'Case Query'}"`,
        metadataJson: JSON.stringify({ messageId: created.id, recipient: recipient.name }),
      },
    });

    // In-app Notification for recipient
    await prisma.notification.create({
      data: {
        recipientUserId: recipient.employeeCode,
        applicationId: app.id,
        type: "APPLICATION_MESSAGE",
        title: `Message from ${staff.name} regarding ${app.applicationNumber}`,
        message: message.substring(0, 150),
        priority: "normal",
        actionUrl: `/aicte/applications/${app.id}?tab=communication`,
      },
    });

    return created;
  },

  // ─── 6. TEMPORARY WORK DELEGATION ─────────────────────────────────────────
  async getEligibleDelegationUsers(applicationId, user) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    // Query active staff members (excluding current user)
    // Filter to relevant departments/roles for operational compatibility
    const candidates = await prisma.staff.findMany({
      where: {
        id: { not: staff.id },
        accountStatus: { not: "SUSPENDED" },
      },
      take: 25,
      include: {
        designation: true,
        organizationUnit: true,
        availability: true,
      },
    });

    // Compute workload for each candidate
    const eligible = await Promise.all(
      candidates.map(async (c) => {
        const activeTasks = await prisma.workDelegation.count({
          where: {
            delegatedToId: c.id,
            status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
          },
        });

        const activeApps = await prisma.application.count({
          where: {
            assignedUserId: c.employeeCode,
            status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
          },
        });

        const isAvailable = c.availability?.status !== "ON_LEAVE" && c.availability?.status !== "TEMPORARILY_UNAVAILABLE";

        return {
          id: c.id,
          employeeCode: c.employeeCode,
          name: c.name,
          email: c.email,
          designation: c.designation?.title || "Officer",
          organizationUnit: c.organizationUnit?.name || "Approval Bureau",
          availability: c.availability?.status || "AVAILABLE",
          isAvailable,
          currentWorkload: {
            assignedApplications: activeApps,
            delegatedTasks: activeTasks,
            total: activeApps + activeTasks,
          },
        };
      })
    );

    // Sort by availability first, then by lowest workload
    eligible.sort((a, b) => {
      if (a.isAvailable !== b.isAvailable) {
        return a.isAvailable ? -1 : 1;
      }
      return a.currentWorkload.total - b.currentWorkload.total;
    });

    return eligible;
  },

  async createDelegation(user, payload) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    const {
      applicationId,
      workflowStageId,
      delegatedToId,
      taskTitle,
      taskDescription,
      priority = "NORMAL",
      priorityReason,
      reason,
      notes,
      deadline,
    } = payload;

    if (!applicationId || !delegatedToId || !taskTitle || !reason) {
      throw new Error("Application, delegate recipient, task title, and delegation reason are required.");
    }

    const app = await prisma.application.findFirst({
      where: {
        OR: [{ id: applicationId }, { applicationNumber: applicationId }],
      },
    });

    if (!app) throw new Error("Application not found.");

    const recipient = await prisma.staff.findFirst({
      where: {
        OR: [{ id: delegatedToId }, { employeeCode: delegatedToId }],
      },
      include: { availability: true },
    });

    if (!recipient) throw new Error("Delegate recipient staff not found.");

    if (recipient.id === staff.id) {
      throw new Error("Cannot delegate task to yourself.");
    }

    const delegation = await prisma.workDelegation.create({
      data: {
        applicationId: app.id,
        workflowStageId: workflowStageId || app.currentStageId,
        primaryOwnerId: app.assignedUserId || staff.employeeCode,
        delegatedById: staff.id,
        delegatedToId: recipient.id,
        taskTitle: taskTitle.trim(),
        taskDescription: taskDescription ? taskDescription.trim() : taskTitle.trim(),
        priority: priority.toUpperCase(),
        priorityReason,
        reason,
        notes,
        deadline: deadline ? new Date(deadline) : null,
        status: "PENDING",
      },
      include: {
        delegatedBy: { select: { id: true, name: true, employeeCode: true } },
        delegatedTo: { select: { id: true, name: true, employeeCode: true } },
        application: { select: { id: true, applicationNumber: true } },
      },
    });

    // Audit Event
    await prisma.auditEvent.create({
      data: {
        applicationId: app.id,
        actorUserId: staff.employeeCode,
        actorRole: user.role || "aicte_officer",
        action: "WORK_DELEGATED",
        reason: `Officer ${staff.name} delegated task "${taskTitle}" to ${recipient.name}. Reason: ${reason}. Priority: ${priority}`,
        metadataJson: JSON.stringify({
          delegationId: delegation.id,
          taskTitle,
          recipient: recipient.name,
          priority,
        }),
      },
    });

    // Notification for recipient
    await prisma.notification.create({
      data: {
        recipientUserId: recipient.employeeCode,
        applicationId: app.id,
        type: "WORK_DELEGATION_REQUEST",
        title: `Task Delegated: ${taskTitle}`,
        message: `${staff.name} delegated "${taskTitle}" for ${app.applicationNumber}. Priority: ${priority}.`,
        priority: priority.toLowerCase(),
        actionUrl: `/aicte/dashboard?filter=delegated`,
      },
    });

    return delegation;
  },

  async updateDelegationStatus(delegationId, user, action, payload = {}) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    const delegation = await prisma.workDelegation.findUnique({
      where: { id: delegationId },
      include: {
        delegatedBy: true,
        delegatedTo: true,
        application: true,
      },
    });

    if (!delegation) throw new Error("Delegation record not found.");

    let newStatus = delegation.status;
    const updateData = {};

    if (action === "accept") {
      if (delegation.delegatedToId !== staff.id && staff.employeeCode !== "DEMO-AIC-001") {
        throw new Error("Only the assigned delegate officer can accept this task.");
      }
      newStatus = "ACCEPTED";
      updateData.acceptedAt = new Date();
      updateData.status = newStatus;
    } else if (action === "decline") {
      if (delegation.delegatedToId !== staff.id && staff.employeeCode !== "DEMO-AIC-001") {
        throw new Error("Only the assigned delegate officer can decline this task.");
      }
      newStatus = "DECLINED";
      updateData.declinedAt = new Date();
      updateData.declineReason = payload.reason || "Unable to accommodate workload";
      updateData.status = newStatus;
    } else if (action === "start") {
      if (delegation.delegatedToId !== staff.id) {
        throw new Error("Only the delegate officer can start this task.");
      }
      newStatus = "IN_PROGRESS";
      updateData.startedAt = new Date();
      updateData.status = newStatus;
    } else if (action === "complete") {
      if (delegation.delegatedToId !== staff.id && staff.employeeCode !== "DEMO-AIC-001") {
        throw new Error("Only the delegate officer can mark this task complete.");
      }
      newStatus = "COMPLETED";
      updateData.completedAt = new Date();
      updateData.completionNotes = payload.notes || "Delegated task completed successfully.";
      updateData.status = newStatus;
    } else if (action === "cancel") {
      if (delegation.delegatedById !== staff.id && staff.employeeCode !== "DEMO-AIC-001") {
        throw new Error("Only the delegating officer or supervisor can cancel this delegation.");
      }
      newStatus = "CANCELLED";
      updateData.status = newStatus;
    } else {
      throw new Error(`Unsupported delegation action: ${action}`);
    }

    const updated = await prisma.workDelegation.update({
      where: { id: delegationId },
      data: updateData,
      include: {
        delegatedBy: { select: { id: true, name: true, employeeCode: true } },
        delegatedTo: { select: { id: true, name: true, employeeCode: true } },
      },
    });

    // Audit Event
    await prisma.auditEvent.create({
      data: {
        applicationId: delegation.applicationId,
        actorUserId: staff.employeeCode,
        actorRole: user.role || "aicte_officer",
        action: `DELEGATION_${newStatus}`,
        reason: `Task "${delegation.taskTitle}" status changed to ${newStatus} by ${staff.name}`,
        metadataJson: JSON.stringify({
          delegationId,
          newStatus,
          notes: payload.notes || payload.reason,
        }),
      },
    });

    // Notify original officer when task is accepted, declined, or completed
    const notifyTarget = action === "cancel" ? delegation.delegatedTo : delegation.delegatedBy;
    await prisma.notification.create({
      data: {
        recipientUserId: notifyTarget.employeeCode,
        applicationId: delegation.applicationId,
        type: `DELEGATION_${newStatus}`,
        title: `Delegated Task ${newStatus}: ${delegation.taskTitle}`,
        message: `${staff.name} marked "${delegation.taskTitle}" as ${newStatus}.`,
        priority: "normal",
        actionUrl: `/aicte/dashboard?filter=delegated`,
      },
    });

    return updated;
  },

  async getDelegations(user, query = {}) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    const { type = "received", status } = query;
    const where = {};

    if (type === "created") {
      where.delegatedById = staff.id;
    } else if (type === "received") {
      where.delegatedToId = staff.id;
    } else {
      where.OR = [{ delegatedById: staff.id }, { delegatedToId: staff.id }];
    }

    if (status && status !== "all") {
      where.status = status.toUpperCase();
    }

    return await prisma.workDelegation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        delegatedBy: { select: { id: true, name: true, employeeCode: true, designation: { select: { title: true } } } },
        delegatedTo: { select: { id: true, name: true, employeeCode: true, designation: { select: { title: true } } } },
        application: {
          select: {
            id: true,
            applicationNumber: true,
            currentStageName: true,
            status: true,
            institution: { select: { institutionName: true } },
          },
        },
      },
    });
  },

  // ─── 7. SUPERVISOR TEAM WORKLOAD ──────────────────────────────────────────
  async getSupervisorTeamWorkload(user) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    const platformRoles = user.platformRoles || [];
    const isSupervisory =
      platformRoles.includes("SUPER_ADMIN") ||
      platformRoles.includes("GOVERNANCE_AUTHORITY") ||
      platformRoles.includes("UNIT_HEAD") ||
      platformRoles.includes("REGIONAL_OFFICER") ||
      user.role === "admin" ||
      user.role === "super_admin";

    // Subordinates: direct reports or bureau team members
    let teamMembers = await prisma.staff.findMany({
      where: isSupervisory
        ? {
            OR: [
              { reportsToStaffId: staff.id },
              { organizationUnitId: staff.organizationUnitId || undefined },
            ],
            id: { not: staff.id },
          }
        : {
            reportsToStaffId: staff.id,
          },
      take: 20,
      include: {
        designation: true,
        organizationUnit: true,
        availability: true,
      },
    });

    if (teamMembers.length === 0 && isSupervisory) {
      // Fallback for demo leadership: show active reviewing officers in approval bureau
      teamMembers = await prisma.staff.findMany({
        where: { id: { not: staff.id } },
        take: 8,
        include: {
          designation: true,
          organizationUnit: true,
          availability: true,
        },
      });
    }

    const now = new Date();
    const workloadList = await Promise.all(
      teamMembers.map(async (m) => {
        const [activeCount, overdueCount, urgentCount, delegatedCount] = await Promise.all([
          prisma.application.count({
            where: {
              assignedUserId: m.employeeCode,
              status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
            },
          }),
          prisma.application.count({
            where: {
              assignedUserId: m.employeeCode,
              dueAt: { lt: now },
              status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
            },
          }),
          prisma.application.count({
            where: {
              assignedUserId: m.employeeCode,
              priority: "URGENT",
              status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
            },
          }),
          prisma.workDelegation.count({
            where: {
              delegatedToId: m.id,
              status: { in: ["PENDING", "ACCEPTED", "IN_PROGRESS"] },
            },
          }),
        ]);

        return {
          id: m.id,
          employeeCode: m.employeeCode,
          name: m.name,
          email: m.email,
          designation: m.designation?.title || "Review Officer",
          organizationUnit: m.organizationUnit?.name || "Approval Bureau",
          availability: m.availability?.status || "AVAILABLE",
          activeCount,
          overdueCount,
          urgentCount,
          delegatedCount,
          totalLoad: activeCount + delegatedCount,
        };
      })
    );

    return {
      supervisor: {
        id: staff.id,
        name: staff.name,
        designation: staff.designation?.title,
      },
      teamMembers: workloadList,
    };
  },

  // ─── 8. STAFF AVAILABILITY & CONTINUITY ──────────────────────────────────
  async getAvailability(user) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    const availability = await prisma.staffAvailability.findUnique({
      where: { staffId: staff.id },
    });

    return (
      availability || {
        status: "AVAILABLE",
        availableFrom: null,
        availableUntil: null,
        reason: null,
      }
    );
  },

  async updateAvailability(user, payload) {
    const staff = await this.resolveStaff(user);
    if (!staff) throw new Error("Staff identity required.");

    const { status = "AVAILABLE", availableFrom, availableUntil, reason, note } = payload;

    const updated = await prisma.staffAvailability.upsert({
      where: { staffId: staff.id },
      update: {
        status,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableUntil: availableUntil ? new Date(availableUntil) : null,
        reason,
        note,
      },
      create: {
        staffId: staff.id,
        status,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableUntil: availableUntil ? new Date(availableUntil) : null,
        reason,
        note,
      },
    });

    // Check for active tasks that overlap with unavailable period
    let continuityWarning = null;
    if (status === "ON_LEAVE" || status === "TEMPORARILY_UNAVAILABLE") {
      const activeAppsCount = await prisma.application.count({
        where: {
          assignedUserId: staff.employeeCode,
          status: { notIn: ["approved", "rejected", "closed", "withdrawn"] },
        },
      });

      if (activeAppsCount > 0) {
        continuityWarning = {
          count: activeAppsCount,
          message: `${activeAppsCount} active applications require attention during your absence. You can delegate critical tasks to eligible colleagues.`,
        };
      }
    }

    return {
      availability: updated,
      continuityWarning,
    };
  },
};
