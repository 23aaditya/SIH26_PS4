import prisma from "../db/prisma.js";

export const deadlineService = {
  async processDeadlines() {
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const results = {
      overdueTasksMarked: 0,
      escalatedCount: 0,
      remindersSent: 0,
    };

    // 1. Find open tasks that have passed their deadline
    const overdueTasks = await prisma.workflowTask.findMany({
      where: {
        status: { in: ["open", "in_progress"] },
        dueAt: { lt: now },
      },
      include: {
        application: { include: { createdBy: true, institution: true } },
      },
    });

    for (const task of overdueTasks) {
      const nextEscalation = task.escalationLevel + 1;
      await prisma.workflowTask.update({
        where: { id: task.id },
        data: {
          status: "overdue",
          escalationLevel: nextEscalation,
        },
      });
      results.overdueTasksMarked++;
      results.escalatedCount++;

      const dedupKey = `${task.application.applicationNumber}:${task.sourceStageId}:overdue:level${nextEscalation}`;
      const recipientId =
        task.assignedUserId ||
        (task.assignedRole === "institution" ? task.application.createdById : "aicte-ro-west");

      await prisma.notification.upsert({
        where: { deduplicationKey: dedupKey },
        create: {
          recipientUserId: recipientId,
          applicationId: task.applicationId,
          type: "sla_breach_escalation",
          title: `SLA OVERDUE: ${task.application.applicationNumber}`,
          message: `Statutory Citizens Charter deadline exceeded for task "${task.title}". Escalation level: ${nextEscalation}.`,
          priority: "urgent",
          actionUrl: `/aicte/applications/${task.applicationId}`,
          deduplicationKey: dedupKey,
        },
        update: {},
      });
      results.remindersSent++;
    }

    // 2. Find tasks due within 3 days
    const dueSoonTasks = await prisma.workflowTask.findMany({
      where: {
        status: "open",
        dueAt: {
          gte: now,
          lte: threeDaysFromNow,
        },
      },
      include: {
        application: { include: { createdBy: true } },
      },
    });

    for (const task of dueSoonTasks) {
      const dedupKey = `${task.application.applicationNumber}:${task.sourceStageId}:duesoon:warning`;
      const recipientId =
        task.assignedUserId ||
        (task.assignedRole === "institution" ? task.application.createdById : "aicte-ro-west");

      await prisma.notification.upsert({
        where: { deduplicationKey: dedupKey },
        create: {
          recipientUserId: recipientId,
          applicationId: task.applicationId,
          type: "sla_warning",
          title: `Upcoming Deadline: ${task.application.applicationNumber}`,
          message: `Only 3 days remaining before statutory deadline on "${task.title}".`,
          priority: "high",
          actionUrl: `/aicte/applications/${task.applicationId}`,
          deduplicationKey: dedupKey,
        },
        update: {},
      });
      results.remindersSent++;
    }

    return results;
  },
};
