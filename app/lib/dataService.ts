import {
  Application,
  ApplicationDocument,
  AuditEvent,
  EvcVisit,
  Institution,
  Undertaking,
  UserProfile,
  ApplicationStatus,
  UserRole,
} from "./types";
import {
  MOCK_APPLICATIONS,
  MOCK_DOCUMENTS,
  MOCK_EVC_VISITS,
  MOCK_INSTITUTIONS,
  MOCK_UNDERTAKINGS,
  MOCK_AUDIT_EVENTS,
  MOCK_NOTIFICATIONS,
} from "./mockData";

const STORAGE_KEYS = {
  APPLICATIONS: "aicte_applications_store",
  DOCUMENTS: "aicte_documents_store",
  EVC_VISITS: "aicte_evc_store",
  UNDERTAKINGS: "aicte_undertakings_store",
  AUDIT_EVENTS: "aicte_audit_store",
  NOTIFICATIONS: "aicte_notifications_store",
};

// Helper for client-side localStorage access with SSR safety
function loadStored<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T[];
  } catch (e) {
    console.warn(`Error reading ${key} from storage:`, e);
    return fallback;
  }
}

function saveStored<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Error saving ${key} to storage:`, e);
  }
}

export const dataService = {
  getInstitutions(): Institution[] {
    return MOCK_INSTITUTIONS;
  },

  getInstitutionById(id: string): Institution | undefined {
    return MOCK_INSTITUTIONS.find((i) => i.id === id);
  },

  getApplications(params?: {
    institutionId?: string;
    status?: string;
    stageId?: string;
    category?: string;
    query?: string;
  }): Application[] {
    let list = loadStored<Application>(STORAGE_KEYS.APPLICATIONS, MOCK_APPLICATIONS);

    if (params?.institutionId) {
      list = list.filter((a) => a.institutionId === params.institutionId);
    }
    if (params?.status && params.status !== "all") {
      list = list.filter((a) => a.status === params.status);
    }
    if (params?.stageId) {
      list = list.filter((a) => a.currentStageId === params.stageId);
    }
    if (params?.category && params.category !== "all") {
      list = list.filter((a) => a.applicationCategory === params.category);
    }
    if (params?.query && params.query.trim()) {
      const q = params.query.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.applicationNumber.toLowerCase().includes(q) ||
          a.applicationCategory.toLowerCase().includes(q) ||
          MOCK_INSTITUTIONS.find((i) => i.id === a.institutionId)?.institutionName.toLowerCase().includes(q)
      );
    }

    return list;
  },

  getApplicationById(id: string): Application | undefined {
    const list = loadStored<Application>(STORAGE_KEYS.APPLICATIONS, MOCK_APPLICATIONS);
    return list.find((a) => a.id === id || a.applicationNumber === id);
  },

  createApplication(
    payload: Omit<Application, "id" | "applicationNumber" | "createdAt" | "updatedAt" | "lastActionAt" | "returnCount">
  ): Application {
    const list = loadStored<Application>(STORAGE_KEYS.APPLICATIONS, MOCK_APPLICATIONS);
    const count = list.length + 1;
    const padCount = count.toString().padStart(4, "0");
    const appNumber = `APP-2026-${padCount}`;
    const id = `app-2026-${padCount}`;
    const now = new Date().toISOString();

    const newApp: Application = {
      ...payload,
      id,
      applicationNumber: appNumber,
      returnCount: 0,
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
    };

    const updated = [newApp, ...list];
    saveStored(STORAGE_KEYS.APPLICATIONS, updated);

    // Record audit event
    this.addAuditEvent({
      applicationId: newApp.id,
      institutionId: newApp.institutionId,
      actorUid: payload.createdByUid,
      actorRole: "institution",
      action: "Application Created & Submitted",
      toStage: payload.currentStageName,
      reason: "Initial submission by institution portal wizard.",
    });

    return newApp;
  },

  returnForClarification(
    applicationId: string,
    deficiencyNotes: string,
    actor: { uid: string; role: UserRole }
  ): Application | null {
    const list = loadStored<Application>(STORAGE_KEYS.APPLICATIONS, MOCK_APPLICATIONS);
    const index = list.findIndex((a) => a.id === applicationId);
    if (index === -1) return null;

    const current = list[index];
    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days

    const updatedApp: Application = {
      ...current,
      status: "awaiting_institution",
      currentStageId: "clarification",
      currentStageName: "Clarification / Deficiency Resolution",
      currentAssigneeRole: "institution",
      dueAt: deadline,
      lastActionAt: now,
      returnCount: (current.returnCount || 0) + 1,
      nextActionDescription: `Deficiency issued: ${deficiencyNotes.slice(0, 100)}...`,
      updatedAt: now,
    };

    list[index] = updatedApp;
    saveStored(STORAGE_KEYS.APPLICATIONS, list);

    this.addAuditEvent({
      applicationId: current.id,
      institutionId: current.institutionId,
      actorUid: actor.uid,
      actorRole: actor.role,
      action: "Returned for Clarification (Deficiency Issued)",
      fromStage: current.currentStageName,
      toStage: "Clarification / Deficiency Resolution",
      reason: deficiencyNotes,
    });

    return updatedApp;
  },

  advanceStage(
    applicationId: string,
    nextStageId: string,
    nextStageName: string,
    nextAssigneeRole: UserRole,
    status: ApplicationStatus,
    reason: string,
    actor: { uid: string; role: UserRole }
  ): Application | null {
    const list = loadStored<Application>(STORAGE_KEYS.APPLICATIONS, MOCK_APPLICATIONS);
    const index = list.findIndex((a) => a.id === applicationId);
    if (index === -1) return null;

    const current = list[index];
    const now = new Date().toISOString();

    const updatedApp: Application = {
      ...current,
      status,
      currentStageId: nextStageId,
      currentStageName: nextStageName,
      currentAssigneeRole: nextAssigneeRole,
      lastActionAt: now,
      stageEnteredAt: now,
      updatedAt: now,
    };

    list[index] = updatedApp;
    saveStored(STORAGE_KEYS.APPLICATIONS, list);

    this.addAuditEvent({
      applicationId: current.id,
      institutionId: current.institutionId,
      actorUid: actor.uid,
      actorRole: actor.role,
      action: `Stage Advanced to ${nextStageName}`,
      fromStage: current.currentStageName,
      toStage: nextStageName,
      reason,
    });

    return updatedApp;
  },

  recordDecision(
    applicationId: string,
    decision: "approved" | "rejected",
    reason: string,
    conditions: string[],
    actor: { uid: string; role: UserRole }
  ): Application | null {
    const list = loadStored<Application>(STORAGE_KEYS.APPLICATIONS, MOCK_APPLICATIONS);
    const index = list.findIndex((a) => a.id === applicationId);
    if (index === -1) return null;

    const current = list[index];
    const now = new Date().toISOString();

    const updatedApp: Application = {
      ...current,
      status: decision === "approved" ? "approved" : "rejected",
      currentStageId: decision === "approved" ? "approved_terminal" : "rejected_terminal",
      currentStageName: decision === "approved" ? "Approval Order Issued" : "Application Rejected",
      currentAssigneeRole: "",
      nextActionDescription: decision === "approved" ? "Final Approval Issued" : "Application Rejected with Remarks",
      lastActionAt: now,
      updatedAt: now,
    };

    list[index] = updatedApp;
    saveStored(STORAGE_KEYS.APPLICATIONS, list);

    // If approved with conditions, create undertakings
    if (decision === "approved" && conditions && conditions.length > 0) {
      const undertakings = loadStored<Undertaking>(STORAGE_KEYS.UNDERTAKINGS, MOCK_UNDERTAKINGS);
      conditions.forEach((c, i) => {
        if (c.trim()) {
          undertakings.push({
            id: `ut-auto-${Date.now()}-${i}`,
            applicationId: current.id,
            institutionId: current.institutionId,
            condition: c.trim(),
            description: `Statutory condition imposed at time of AICTE Approval Order: ${c}`,
            dueAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            status: "pending",
            evidenceDocumentIds: [],
            createdAt: now,
          });
        }
      });
      saveStored(STORAGE_KEYS.UNDERTAKINGS, undertakings);
    }

    this.addAuditEvent({
      applicationId: current.id,
      institutionId: current.institutionId,
      actorUid: actor.uid,
      actorRole: actor.role,
      action: decision === "approved" ? "Final Approval Granted" : "Application Rejected",
      fromStage: current.currentStageName,
      toStage: decision === "approved" ? "Approval Order Issued" : "Application Rejected",
      reason: reason || (decision === "approved" ? "Approved per AICTE Approval Process Handbook" : "Rejected"),
    });

    return updatedApp;
  },

  getDocuments(applicationId?: string, institutionId?: string): ApplicationDocument[] {
    let docs = loadStored<ApplicationDocument>(STORAGE_KEYS.DOCUMENTS, MOCK_DOCUMENTS);
    if (applicationId) {
      docs = docs.filter((d) => d.applicationId === applicationId);
    }
    if (institutionId) {
      docs = docs.filter((d) => d.institutionId === institutionId);
    }
    return docs;
  },

  verifyDocument(
    docId: string,
    status: "verified" | "rejected" | "pending",
    notes: string,
    actor: { uid: string; role: UserRole }
  ): void {
    const docs = loadStored<ApplicationDocument>(STORAGE_KEYS.DOCUMENTS, MOCK_DOCUMENTS);
    const index = docs.findIndex((d) => d.id === docId);
    if (index !== -1) {
      docs[index] = {
        ...docs[index],
        verificationStatus: status,
        notes: notes || docs[index].notes,
        verifiedByUid: actor.uid,
        verifiedAt: new Date().toISOString(),
      };
      saveStored(STORAGE_KEYS.DOCUMENTS, docs);
    }
  },

  getEvcVisits(): EvcVisit[] {
    return loadStored<EvcVisit>(STORAGE_KEYS.EVC_VISITS, MOCK_EVC_VISITS);
  },

  scheduleEvc(
    payload: {
      applicationId: string;
      institutionId: string;
      regionId: string;
      scheduledAt: string;
      assignedExperts: string[];
      notes?: string;
    },
    actor: { uid: string; role: UserRole }
  ): EvcVisit {
    const visits = loadStored<EvcVisit>(STORAGE_KEYS.EVC_VISITS, MOCK_EVC_VISITS);
    const now = new Date().toISOString();
    const newVisit: EvcVisit = {
      id: `evc-${Date.now()}`,
      ...payload,
      status: "scheduled",
      scheduledByUid: actor.uid,
      createdAt: now,
      updatedAt: now,
    };
    visits.unshift(newVisit);
    saveStored(STORAGE_KEYS.EVC_VISITS, visits);

    // Update application stage to EVC Scheduled
    this.advanceStage(
      payload.applicationId,
      "evc_scheduled",
      "EVC Visit Scheduled",
      "evc_coordinator",
      "pending_evc",
      `Inspection scheduled for ${new Date(payload.scheduledAt).toLocaleDateString()}. Panel: ${payload.assignedExperts.join(", ")}`,
      actor
    );

    return newVisit;
  },

  getUndertakings(institutionId?: string): Undertaking[] {
    let list = loadStored<Undertaking>(STORAGE_KEYS.UNDERTAKINGS, MOCK_UNDERTAKINGS);
    if (institutionId) {
      list = list.filter((u) => u.institutionId === institutionId);
    }
    return list;
  },

  submitUndertakingEvidence(undertakingId: string, documentId: string): void {
    const list = loadStored<Undertaking>(STORAGE_KEYS.UNDERTAKINGS, MOCK_UNDERTAKINGS);
    const index = list.findIndex((u) => u.id === undertakingId);
    if (index !== -1) {
      const existingDocs = list[index].evidenceDocumentIds || [];
      list[index] = {
        ...list[index],
        status: "submitted",
        evidenceDocumentIds: [...existingDocs, documentId],
        submittedAt: new Date().toISOString(),
      };
      saveStored(STORAGE_KEYS.UNDERTAKINGS, list);
    }
  },

  getAuditEvents(applicationId?: string): AuditEvent[] {
    let list = loadStored<AuditEvent>(STORAGE_KEYS.AUDIT_EVENTS, MOCK_AUDIT_EVENTS);
    if (applicationId) {
      list = list.filter((a) => a.applicationId === applicationId);
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  addAuditEvent(event: Omit<AuditEvent, "id" | "timestamp">): void {
    const list = loadStored<AuditEvent>(STORAGE_KEYS.AUDIT_EVENTS, MOCK_AUDIT_EVENTS);
    const newEvent: AuditEvent = {
      ...event,
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    list.unshift(newEvent);
    saveStored(STORAGE_KEYS.AUDIT_EVENTS, list);
  },

  getNotifications(userUid?: string): typeof MOCK_NOTIFICATIONS {
    let list = loadStored<typeof MOCK_NOTIFICATIONS[0]>(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    if (userUid) {
      list = list.filter((n) => n.recipientUid === userUid || !n.recipientUid);
    }
    return list;
  },

  markNotificationRead(notifId: string): void {
    const list = loadStored<typeof MOCK_NOTIFICATIONS[0]>(STORAGE_KEYS.NOTIFICATIONS, MOCK_NOTIFICATIONS);
    const index = list.findIndex((n) => n.id === notifId);
    if (index !== -1) {
      list[index].read = true;
      saveStored(STORAGE_KEYS.NOTIFICATIONS, list);
    }
  },
};
