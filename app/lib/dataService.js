import { MOCK_APPLICATIONS, MOCK_DOCUMENTS, MOCK_EVC_VISITS, MOCK_INSTITUTIONS, MOCK_UNDERTAKINGS, MOCK_AUDIT_EVENTS, MOCK_NOTIFICATIONS, } from "./mockData.js";
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const DEMO_USER_KEY = "aicte_active_demo_user_id";
function getActiveUid() {
    if (typeof window !== "undefined") {
        return localStorage.getItem(DEMO_USER_KEY) || "inst-user-1";
    }
    return "inst-user-1";
}
async function apiFetch(path, options = {}) {
    const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(options.headers || {});
    if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }
    const uid = getActiveUid();
    if (uid && !headers.has("x-user-id")) {
        headers.set("x-user-id", uid);
    }
    return fetch(url, {
        ...options,
        headers,
        credentials: "include",
    });
}
// In-memory runtime cache synchronized with Express + SQLite backend
let cache = {
    applications: [...MOCK_APPLICATIONS],
    documents: [...MOCK_DOCUMENTS],
    evcVisits: [...MOCK_EVC_VISITS],
    undertakings: [...MOCK_UNDERTAKINGS],
    auditEvents: [...MOCK_AUDIT_EVENTS],
    notifications: [...MOCK_NOTIFICATIONS],
    initialized: false,
};
// Asynchronously sync in-memory cache with SQLite API
async function syncFromServer() {
    if (typeof window === "undefined")
        return;
    try {
        const [appsRes, docsRes, evcRes, utRes, notifRes] = await Promise.all([
            apiFetch("/applications?pageSize=100").catch(() => null),
            apiFetch("/documents").catch(() => null),
            apiFetch("/evc").catch(() => null),
            apiFetch("/undertakings").catch(() => null),
            apiFetch("/notifications").catch(() => null),
        ]);
        if (appsRes && appsRes.ok) {
            const data = await appsRes.json();
            if (data.items) {
                cache.applications = data.items.map((app) => ({
                    ...app,
                    formData: app.formDataJson ? (typeof app.formDataJson === "string" ? JSON.parse(app.formDataJson) : app.formDataJson) : app.formData || {},
                }));
            }
        }
        if (docsRes && docsRes.ok) {
            const data = await docsRes.json();
            if (Array.isArray(data) && data.length > 0) {
                cache.documents = data;
            }
        }
        if (evcRes && evcRes.ok) {
            const data = await evcRes.json();
            if (Array.isArray(data) && data.length > 0) {
                cache.evcVisits = data.map((v) => ({
                    ...v,
                    assignedExperts: v.experts ? v.experts.map((e) => e.name) : v.assignedExperts || [],
                }));
            }
        }
        if (utRes && utRes.ok) {
            const data = await utRes.json();
            if (Array.isArray(data) && data.length > 0) {
                cache.undertakings = data;
            }
        }
        if (notifRes && notifRes.ok) {
            const data = await notifRes.json();
            if (Array.isArray(data) && data.length > 0) {
                cache.notifications = data;
            }
        }
        cache.initialized = true;
    }
    catch (err) {
        console.warn("Express + SQLite background sync notice:", err);
    }
}
// Initial sync on client load
if (typeof window !== "undefined") {
    syncFromServer();
}
export const dataService = {
    /** Trigger explicit server re-fetch */
    async sync() {
        await syncFromServer();
    },
    clearCache() {
        cache = {
            applications: [],
            documents: [],
            evcVisits: [],
            undertakings: [],
            auditEvents: [],
            notifications: [],
            initialized: false,
        };
    },
    getInstitutions() {
        return MOCK_INSTITUTIONS;
    },
    getInstitutionById(id) {
        if (!id) return null;
        const found = MOCK_INSTITUTIONS.find((i) => i.id === id);
        if (found) return found;
        const appWithInst = cache.applications.find((a) => a.institutionId === id && a.institution);
        if (appWithInst?.institution) {
            return appWithInst.institution;
        }
        return {
            id,
            institutionName: "Affiliated Technical Institution",
            institutionCode: id.startsWith("inst-") ? `PID-${id.slice(-6)}` : id,
        };
    },
    getApplications(params) {
        // Fire background sync to ensure latest multi-session changes from SQLite
        if (typeof window !== "undefined" && !cache.initialized) {
            syncFromServer();
        }
        let list = [...cache.applications];
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
            list = list.filter((a) => a.applicationNumber.toLowerCase().includes(q) ||
                a.applicationCategory.toLowerCase().includes(q) ||
                MOCK_INSTITUTIONS.find((i) => i.id === a.institutionId)?.institutionName.toLowerCase().includes(q));
        }
        return list;
    },
    getApplicationById(id) {
        // If exact ID not in cache, trigger quick background refresh
        const found = cache.applications.find((a) => a.id === id || a.applicationNumber === id);
        if (!found && typeof window !== "undefined") {
            syncFromServer();
        }
        return found;
    },
    createApplication(payload) {
        const count = cache.applications.length + 1;
        const padCount = count.toString().padStart(4, "0");
        const appNumber = `APP-2026-${padCount}`;
        const id = `app-2026-${padCount}`;
        const now = new Date().toISOString();
        const newApp = {
            ...payload,
            id,
            applicationNumber: appNumber,
            returnCount: 0,
            createdAt: now,
            updatedAt: now,
            lastActionAt: now,
        };
        // Optimistically update memory cache
        cache.applications = [newApp, ...cache.applications];
        // Persist to Express + SQLite backend
        if (typeof window !== "undefined") {
            apiFetch("/applications", {
                method: "POST",
                body: JSON.stringify({
                    applicationCategory: payload.applicationCategory,
                    workflowDefinitionId: payload.workflowDefinitionId,
                    workflowVersion: payload.workflowVersionId,
                    requiresEvc: payload.requiresEvc,
                    formData: payload.formData,
                }),
            })
                .then(async (res) => {
                if (res.ok) {
                    const data = await res.json();
                    if (data.application) {
                        const idx = cache.applications.findIndex((a) => a.id === id);
                        if (idx !== -1) {
                            cache.applications[idx] = {
                                ...cache.applications[idx],
                                id: data.application.id,
                                applicationNumber: data.application.applicationNumber,
                            };
                        }
                        syncFromServer();
                    }
                }
            })
                .catch((e) => console.error("Error creating application in Express + SQLite:", e));
        }
        return newApp;
    },
    returnForClarification(applicationId, deficiencyNotes, actor) {
        const index = cache.applications.findIndex((a) => a.id === applicationId);
        if (index === -1)
            return null;
        const current = cache.applications[index];
        const now = new Date().toISOString();
        const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
        const updatedApp = {
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
        cache.applications[index] = updatedApp;
        // Send to Express + SQLite backend
        if (typeof window !== "undefined") {
            apiFetch(`/applications/${applicationId}/return`, {
                method: "POST",
                body: JSON.stringify({ deficiencyText: deficiencyNotes }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error sending clarification to Express:", e));
        }
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
    submitClarificationResponse(applicationId, responseText, attachedDocumentIds, actor) {
        const index = cache.applications.findIndex((a) => a.id === applicationId);
        if (index === -1)
            return null;
        const current = cache.applications[index];
        const now = new Date().toISOString();
        const updatedApp = {
            ...current,
            status: "submitted",
            currentStageId: "rescrutiny",
            currentStageName: "Re-Scrutiny Committee Review",
            currentAssigneeRole: "scrutiny_committee",
            lastActionAt: now,
            updatedAt: now,
        };
        cache.applications[index] = updatedApp;
        if (typeof window !== "undefined") {
            apiFetch(`/applications/${applicationId}/clarification`, {
                method: "POST",
                body: JSON.stringify({
                    responseText,
                    attachedDocumentIds,
                }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error submitting clarification to Express:", e));
        }
        this.addAuditEvent({
            applicationId: current.id,
            institutionId: current.institutionId,
            actorUid: actor.uid,
            actorRole: actor.role,
            action: "Clarification Submitted by Institution",
            fromStage: current.currentStageName,
            toStage: "Re-Scrutiny Committee Review",
            reason: responseText,
        });
        return updatedApp;
    },
    advanceStage(applicationId, nextStageId, nextStageName, nextAssigneeRole, status, reason, actor) {
        const index = cache.applications.findIndex((a) => a.id === applicationId);
        if (index === -1)
            return null;
        const current = cache.applications[index];
        const now = new Date().toISOString();
        const updatedApp = {
            ...current,
            status,
            currentStageId: nextStageId,
            currentStageName: nextStageName,
            currentAssigneeRole: nextAssigneeRole,
            lastActionAt: now,
            stageEnteredAt: now,
            updatedAt: now,
        };
        cache.applications[index] = updatedApp;
        // Send to Express + SQLite backend
        if (typeof window !== "undefined") {
            apiFetch(`/applications/${applicationId}/advance`, {
                method: "POST",
                body: JSON.stringify({ reason }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error advancing stage in Express:", e));
        }
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
    recordDecision(applicationId, decision, reason, conditions, actor) {
        const index = cache.applications.findIndex((a) => a.id === applicationId);
        if (index === -1)
            return null;
        const current = cache.applications[index];
        const now = new Date().toISOString();
        const updatedApp = {
            ...current,
            status: decision === "approved" ? "approved" : "rejected",
            currentStageId: decision === "approved" ? "approved_terminal" : "rejected_terminal",
            currentStageName: decision === "approved" ? "Approval Order Issued" : "Application Rejected",
            currentAssigneeRole: "",
            nextActionDescription: decision === "approved" ? "Final Approval Issued" : "Application Rejected with Remarks",
            lastActionAt: now,
            updatedAt: now,
        };
        cache.applications[index] = updatedApp;
        // Send to Express + SQLite backend
        if (typeof window !== "undefined") {
            apiFetch(`/applications/${applicationId}/decision`, {
                method: "POST",
                body: JSON.stringify({
                    decision: decision === "approved" ? "grant_approval" : "reject",
                    remarks: reason,
                    conditions,
                }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error recording decision in Express:", e));
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
    getDocuments(applicationId, institutionId) {
        let docs = [...cache.documents];
        if (applicationId) {
            docs = docs.filter((d) => d.applicationId === applicationId);
        }
        if (institutionId) {
            docs = docs.filter((d) => d.institutionId === institutionId);
        }
        return docs;
    },
    async uploadFile(file, applicationId, documentType) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("applicationId", applicationId);
        formData.append("documentType", documentType);
        const res = await apiFetch("/documents/upload", {
            method: "POST",
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || "File upload failed");
        }
        const data = await res.json();
        await syncFromServer();
        return data.document;
    },
    verifyDocument(docId, status, notes, actor) {
        const index = cache.documents.findIndex((d) => d.id === docId);
        if (index !== -1) {
            cache.documents[index] = {
                ...cache.documents[index],
                verificationStatus: status,
                notes: notes || cache.documents[index].notes,
                verifiedByUid: actor.uid,
                verifiedAt: new Date().toISOString(),
            };
        }
        if (typeof window !== "undefined") {
            apiFetch(`/documents/${docId}/verify`, {
                method: "POST",
                body: JSON.stringify({ status, notes }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error verifying document in Express:", e));
        }
    },
    getEvcVisits() {
        return [...cache.evcVisits];
    },
    scheduleEvc(payload, actor) {
        const now = new Date().toISOString();
        const newVisit = {
            id: `evc-${Date.now()}`,
            ...payload,
            status: "scheduled",
            scheduledByUid: actor.uid,
            createdAt: now,
            updatedAt: now,
        };
        cache.evcVisits.unshift(newVisit);
        if (typeof window !== "undefined") {
            apiFetch("/evc", {
                method: "POST",
                body: JSON.stringify(payload),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error scheduling EVC in Express:", e));
        }
        this.advanceStage(payload.applicationId, "evc_scheduled", "EVC Visit Scheduled", "evc_coordinator", "pending_evc", `Inspection scheduled for ${new Date(payload.scheduledAt).toLocaleDateString()}. Panel: ${payload.assignedExperts.join(", ")}`, actor);
        return newVisit;
    },
    getUndertakings(institutionId) {
        let list = [...cache.undertakings];
        if (institutionId) {
            list = list.filter((u) => u.institutionId === institutionId);
        }
        return list;
    },
    submitUndertakingEvidence(undertakingId, documentId) {
        const index = cache.undertakings.findIndex((u) => u.id === undertakingId);
        if (index !== -1) {
            const existingDocs = cache.undertakings[index].evidenceDocumentIds || [];
            cache.undertakings[index] = {
                ...cache.undertakings[index],
                status: "submitted",
                evidenceDocumentIds: [...existingDocs, documentId],
                submittedAt: new Date().toISOString(),
            };
        }
        if (typeof window !== "undefined") {
            apiFetch(`/undertakings/${undertakingId}/submit`, {
                method: "POST",
                body: JSON.stringify({ documentId }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error submitting undertaking in Express:", e));
        }
    },
    getAuditEvents(applicationId) {
        let list = [...cache.auditEvents];
        if (applicationId) {
            list = list.filter((a) => a.applicationId === applicationId);
        }
        return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    addAuditEvent(event) {
        const newEvent = {
            ...event,
            id: `aud-${Date.now()}`,
            timestamp: new Date().toISOString(),
        };
        cache.auditEvents.unshift(newEvent);
    },
    getNotifications(userUid) {
        let list = [...cache.notifications];
        if (userUid) {
            list = list.filter((n) => n.recipientUid === userUid || !n.recipientUid);
        }
        return list;
    },
    markNotificationRead(notifId) {
        const index = cache.notifications.findIndex((n) => n.id === notifId);
        if (index !== -1) {
            cache.notifications[index].read = true;
        }
        if (typeof window !== "undefined") {
            apiFetch("/notifications", {
                method: "PATCH",
                body: JSON.stringify({ id: notifId }),
            })
                .then(() => syncFromServer())
                .catch((e) => console.error("Error marking notification read in Express:", e));
        }
    },
    async fetchDashboardMetrics() {
        const res = await apiFetch("/dashboard/metrics");
        if (!res.ok)
            throw new Error("Failed to fetch dashboard metrics");
        return res.json();
    },
    async triggerDeadlineProcessor() {
        const res = await apiFetch("/admin/process-deadlines", { method: "POST" });
        if (!res.ok)
            throw new Error("Failed to trigger deadline processor");
        return res.json();
    },
};
