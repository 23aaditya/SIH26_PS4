"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge, DocumentBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { WorkflowStepper, AuditTimeline } from "@/components/shared/WorkflowTimeline";
import { Dialog } from "@/components/ui/dialog";
import { dataService } from "@/lib/dataService";
import {
  APPLICATION_CATEGORY_LABELS,
  ROLE_LABELS,
  Application,
  ApplicationDocument,
  AuditEvent,
  UserRole,
} from "@/lib/types";
import {
  FileText,
  Clock,
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  UploadCloud,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Send,
  Eye,
  UserCheck,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Check,
  X,
  FileCheck2,
} from "lucide-react";

const AICTE_ROLES = [
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
] as const;

function CaseReviewContent() {
  const params = useParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const id = params?.id as string;

  const [app, setApp] = useState<Application | undefined>(undefined);
  const [docs, setDocs] = useState<ApplicationDocument[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "deficiency" | "evc" | "audit">("overview");

  // Modals state
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showEvcModal, setShowEvcModal] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Form states inside modals
  const [deficiencyNotes, setDeficiencyNotes] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [evcDate, setEvcDate] = useState("2026-11-04");
  const [evcExperts, setEvcExperts] = useState("Prof. A. K. Sharma (IIT Delhi), Dr. Vandana Rao (NIT Kurukshetra)");
  const [evcNotes, setEvcNotes] = useState("Physical verification of laboratories, library volume count, and fire exits.");
  const [decisionType, setDecisionType] = useState<"approved" | "rejected">("approved");
  const [decisionReason, setDecisionReason] = useState("Institution satisfies all norms of AICTE Approval Process Handbook (APH) 2026-27.");
  const [decisionConditions, setDecisionConditions] = useState("Submit annual renewed Fire Safety NOC before October 2027; Install barrier-free ramps in Main Admin Block.");
  const [selectedRole, setSelectedRole] = useState<UserRole>("scrutiny_committee");

  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  const reloadData = () => {
    if (!id) return;
    const found = dataService.getApplicationById(id);
    setApp(found);
    if (found) {
      setDocs(dataService.getDocuments(found.id));
      setAuditEvents(dataService.getAuditEvents(found.id));
    }
  };

  useEffect(() => {
    reloadData();
  }, [id]);

  if (!app) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-slate-200">
        <FileText className="h-10 w-10 text-slate-300 mx-auto" />
        <h3 className="mt-3 text-sm font-semibold text-slate-900">Application not found</h3>
        <p className="mt-1 text-xs text-slate-500">The requested application ID does not exist in the official queue.</p>
        <Link href="/aicte/applications">
          <Button variant="outline" size="sm" className="mt-4 text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return to Queue
          </Button>
        </Link>
      </div>
    );
  }

  const institution = dataService.getInstitutionById(app.institutionId);

  // 1. Action: Return for Clarification (Deficiency)
  const handleReturnDeficiency = () => {
    if (!deficiencyNotes.trim()) return;
    dataService.returnForClarification(app.id, deficiencyNotes, {
      uid: userProfile?.uid || "aicte-ro-west",
      role: userProfile?.role || "regional_officer",
    });
    setShowClarifyModal(false);
    setDeficiencyNotes("");
    setNotificationBanner("Deficiency letter successfully issued to institution. Status updated to 'Awaiting Institution'.");
    reloadData();
  };

  // 2. Action: Complete Review / Advance Stage
  const handleAdvanceStage = () => {
    const isNextEvc = app.requiresEvc && app.currentStageId === "scrutiny";
    const nextStageId = isNextEvc ? "evc_evaluation" : "standing_hearing_committee";
    const nextStageName = isNextEvc ? "Expert Visiting Committee (EVC)" : "Standing Hearing Committee Review";
    const nextRole: UserRole = isNextEvc ? "evc_coordinator" : "bureau_officer";

    dataService.advanceStage(
      app.id,
      nextStageId,
      nextStageName,
      nextRole,
      isNextEvc ? "pending_evc" : "awaiting_committee",
      advanceReason || "Scrutiny observations satisfactory. Recommending for next regulatory stage.",
      { uid: userProfile?.uid || "aicte-ro-west", role: userProfile?.role || "regional_officer" }
    );
    setShowAdvanceModal(false);
    setAdvanceReason("");
    setNotificationBanner(`Application advanced to stage: ${nextStageName}`);
    reloadData();
  };

  // 3. Action: Schedule EVC
  const handleScheduleEvc = () => {
    dataService.scheduleEvc(
      {
        applicationId: app.id,
        institutionId: app.institutionId,
        regionId: app.regionId,
        scheduledAt: new Date(evcDate).toISOString(),
        assignedExperts: evcExperts.split(",").map((s) => s.trim()),
        notes: evcNotes,
      },
      { uid: userProfile?.uid || "aicte-evc-1", role: userProfile?.role || "evc_coordinator" }
    );
    setShowEvcModal(false);
    setNotificationBanner(`EVC visit scheduled for ${evcDate}. Panel of experts notified.`);
    reloadData();
  };

  // 4. Action: Record Final Decision
  const handleRecordDecision = () => {
    const condList = decisionConditions
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean);

    dataService.recordDecision(
      app.id,
      decisionType,
      decisionReason,
      condList,
      { uid: userProfile?.uid || "aicte-authority-1", role: userProfile?.role || "competent_authority" }
    );
    setShowDecisionModal(false);
    setNotificationBanner(
      decisionType === "approved"
        ? "Official AICTE Approval Order issued with conditions."
        : "Application officially rejected."
    );
    reloadData();
  };

  // 5. Action: Reassign
  const handleReassign = () => {
    dataService.addAuditEvent({
      applicationId: app.id,
      institutionId: app.institutionId,
      actorUid: userProfile?.uid || "admin",
      actorRole: userProfile?.role || "admin",
      action: `Officer Reassigned to ${ROLE_LABELS[selectedRole]}`,
      reason: `Case workflow assignment transferred to ${ROLE_LABELS[selectedRole]} for regulatory processing.`,
    });
    setShowAssignModal(false);
    setNotificationBanner(`Case reassigned to ${ROLE_LABELS[selectedRole]}`);
    reloadData();
  };

  // Toggle individual document verification status
  const handleToggleDocStatus = (docId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "verified" ? "rejected" : "verified";
    dataService.verifyDocument(
      docId,
      nextStatus as "verified" | "rejected",
      nextStatus === "verified" ? "Verified and found in compliance with APH norms." : "Document flagged during scrutiny.",
      { uid: userProfile?.uid || "aicte-ro-west", role: userProfile?.role || "regional_officer" }
    );
    reloadData();
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-2">
          <Link href="/aicte/applications">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600 px-2">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Work Queue
            </Button>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-mono text-xs font-bold text-slate-900">{app.applicationNumber}</span>
          <StatusBadge status={app.status} />
        </div>

        {/* Action Bar (Top Right) */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAssignModal(true)}
            className="text-xs text-slate-700"
          >
            <UserCheck className="h-3.5 w-3.5 mr-1" /> Reassign
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClarifyModal(true)}
            className="text-xs text-amber-800 border-amber-300 hover:bg-amber-50"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1 text-amber-600" /> Return for Clarification
          </Button>

          {app.requiresEvc && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEvcModal(true)}
              className="text-xs text-purple-800 border-purple-300 hover:bg-purple-50"
            >
              <Calendar className="h-3.5 w-3.5 mr-1 text-purple-600" /> Schedule EVC
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanceModal(true)}
            className="text-xs text-blue-700 border-blue-300 hover:bg-blue-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-blue-600" /> Advance Stage
          </Button>

          <Button
            size="sm"
            onClick={() => setShowDecisionModal(true)}
            className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-xs"
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Record Final Decision
          </Button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notificationBanner && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <span>{notificationBanner}</span>
          </div>
          <button
            onClick={() => setNotificationBanner(null)}
            className="text-blue-500 hover:text-blue-800 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Case Header Strip (Jira Detail Banner) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-900">{institution?.institutionName}</span>
              <span>•</span>
              <span className="font-mono">PID: {institution?.institutionCode}</span>
              <span>•</span>
              <span className="capitalize">{app.regionId} Regional Office</span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {APPLICATION_CATEGORY_LABELS[app.applicationCategory]} — Case Review
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Current Stage: <strong className="text-slate-900">{app.currentStageName}</strong>
            </p>
          </div>

          <div className="flex items-center gap-6 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Regulatory SLA Window
              </p>
              <div className="mt-0.5">
                <SlaCountdown dueAt={app.dueAt} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Assigned Role
              </p>
              <p className="text-xs font-semibold text-slate-900 mt-0.5">
                {app.currentAssigneeRole
                  ? app.currentAssigneeRole.replace(/_/g, " ").toUpperCase()
                  : "Finalized"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Progress Stepper */}
      <WorkflowStepper
        currentStageId={app.currentStageId}
        status={app.status}
        requiresEvc={app.requiresEvc}
      />

      {/* Main 2-Column Inspector Layout (Jira Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Dossier Tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs Navigation */}
          <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 rounded-t-lg">
            {[
              { id: "overview", label: "Dossier & Intake" },
              { id: "documents", label: `Documents (${docs.length})` },
              { id: "deficiency", label: `Observations & Deficiencies (${app.returnCount || 0})` },
              { id: "evc", label: "EVC Inspection" },
              { id: "audit", label: `Audit Log (${auditEvents.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-2.5 text-xs font-medium border-b-2 transition ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-900 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Overview & Data */}
          {activeTab === "overview" && (
            <Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Institutional Profile & Proposal Metrics
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Submitted data for AY 2026-27 approval evaluation
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 block">Department / Discipline</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {String(app.formData?.programName || "Computer Engineering")}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Academic Year</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {String(app.formData?.academicYear || "2026-2027")}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Proposed Intake Capacity</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {String(app.formData?.proposedIntake || "180")} Seats
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Existing Approved Intake</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {String(app.formData?.existingIntake || "120")} Seats
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Instructional Built-up Area</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {String(app.formData?.builtUpAreaSqM || "8400")} sq.m
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Land Holding (Contiguous)</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {String(app.formData?.landAreaAcres || "5.2")} Acres
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <span className="text-slate-500 block font-medium">Justification Statement</span>
                  <p className="mt-1 text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed font-normal">
                    {String(
                      app.formData?.justification ||
                        "Annual Extension of Approval request complying with all accreditation and faculty cadre requirements."
                    )}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tab 2: Document Verification Matrix (Interactive!) */}
          {activeTab === "documents" && (
            <Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Statutory Documents Verification Matrix
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Verify statutory certificates against municipal, revenue, and state council databases
                  </CardDescription>
                </div>
              </CardHeader>
              <div className="divide-y divide-slate-100">
                {docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{doc.documentType}</span>
                        <DocumentBadge status={doc.verificationStatus} />
                      </div>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {doc.originalFilename} • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                      {doc.notes && (
                        <p className="mt-1 text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200">
                          <strong>Note:</strong> {doc.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => alert(`Previewing statutory certificate: ${doc.originalFilename}`)}
                        className="h-7 text-xs px-2 text-slate-600"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View PDF
                      </Button>
                      <Button
                        size="sm"
                        variant={doc.verificationStatus === "verified" ? "default" : "outline"}
                        onClick={() => handleToggleDocStatus(doc.id, doc.verificationStatus)}
                        className={`h-7 text-xs ${
                          doc.verificationStatus === "verified"
                            ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                            : "text-slate-700"
                        }`}
                      >
                        {doc.verificationStatus === "verified" ? (
                          <>
                            <Check className="h-3 w-3 mr-1" /> Verified
                          </>
                        ) : (
                          "Mark Verified"
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Tab 3: Observations & Deficiencies */}
          {activeTab === "deficiency" && (
            <Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Deficiency Letters & Clarifications
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Official queries issued to institution and corresponding rejoinders
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowClarifyModal(true)}
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Issue Deficiency Letter
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                {app.returnCount && app.returnCount > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Deficiency Cycle #{app.returnCount}</span>
                      <span className="text-[11px] text-amber-700">Issued by Regional Scrutiny Officer</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      {app.nextActionDescription}
                    </p>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-800">No deficiencies recorded</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      All submitted documents currently satisfy preliminary checklist criteria.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tab 4: EVC Inspection */}
          {activeTab === "evc" && (
            <Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Expert Visiting Committee (EVC) Schedule
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Physical/virtual infrastructure and laboratory inspection panel
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowEvcModal(true)}
                  className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white"
                >
                  <Calendar className="h-3 w-3 mr-1" /> Schedule / Reschedule EVC
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-slate-500 block">EVC Mandatory Status</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {app.requiresEvc ? "Mandatory for this Category" : "Optional / Waived"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Inspection Status</span>
                    <span className="font-semibold text-purple-700 block mt-0.5">
                      {app.status === "pending_evc" ? "Scheduled / Panel Formed" : "Pending Action"}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-slate-500 block font-medium">Assigned Expert Panel Members:</span>
                  <ul className="mt-2 space-y-1.5 list-disc pl-4 text-slate-800 font-medium">
                    <li>Prof. A. K. Sharma (IIT Delhi, Dept of Mechanical)</li>
                    <li>Dr. Vandana Rao (NIT Kurukshetra, Robotics Center)</li>
                    <li>Er. R. S. Murthy (Director, CSIR-CSIO Chandigarh)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tab 5: Chronological Audit Log */}
          {activeTab === "audit" && (
            <Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Regulatory Case Audit Log
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Tamper-evident chronological timeline of all transitions, comments, and outcomes
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <AuditTimeline events={auditEvents} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column (1 Col): Jira Meta Inspector Panel */}
        <div className="space-y-6">
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Case Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs">
              <div>
                <span className="text-slate-500 block">Workflow State</span>
                <div className="mt-1">
                  <StatusBadge status={app.status} />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Assigned Bureau</span>
                <span className="font-semibold text-slate-900 block mt-0.5 capitalize">
                  {app.regionId} Regional Office
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Handling Officer Role</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.currentAssigneeRole
                    ? app.currentAssigneeRole.replace(/_/g, " ").toUpperCase()
                    : "Terminal"}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">SLA Expiry Date</span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-medium text-slate-800">
                    {app.dueAt ? new Date(app.dueAt).toLocaleDateString("en-IN") : "—"}
                  </span>
                  <SlaCountdown dueAt={app.dueAt} />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Deficiency Cycles Count</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.returnCount || 0} times returned
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Institutional Statutory Profile Box */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-blue-600" />
              Institutional Contact
            </h4>
            <p className="font-semibold text-slate-800">{institution?.institutionName}</p>
            <p className="text-slate-600">{institution?.address}</p>
            <p className="text-slate-600">Email: {institution?.contactEmail}</p>
            <p className="text-slate-600">Phone: {institution?.contactPhone}</p>
          </div>
        </div>
      </div>

      {/* 1. Return for Clarification Dialog */}
      <Dialog
        open={showClarifyModal}
        onOpenChange={setShowClarifyModal}
        title="Issue Deficiency Letter (Return to Institution)"
        description={`Formal statutory deficiency notice for ${app.applicationNumber}`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Deficiency Items & Specific Rectifications Required
            </Label>
            <Textarea
              rows={4}
              value={deficiencyNotes}
              onChange={(e) => setDeficiencyNotes(e.target.value)}
              placeholder="State the non-compliant items per AICTE Approval Process Handbook (e.g. Expired Fire Safety NOC, inadequate cadre ratio, incomplete land deed)..."
              className="text-xs"
            />
          </div>

          <div className="rounded-md bg-amber-50 p-3 border border-amber-200 text-amber-800">
            <p className="font-semibold">Notice:</p>
            <p className="mt-0.5">
              The institution will receive an automated email alert and 10 days to upload rectified evidence before the portal closes.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowClarifyModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!deficiencyNotes.trim()}
              onClick={handleReturnDeficiency}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Dispatch Deficiency Letter
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 2. Advance Stage Dialog */}
      <Dialog
        open={showAdvanceModal}
        onOpenChange={setShowAdvanceModal}
        title="Advance Workflow Stage"
        description={`Confirm progression of ${app.applicationNumber} to next regulatory phase`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Officer Scrutiny Observation & Recommendation Endorsement
            </Label>
            <Textarea
              rows={3}
              value={advanceReason}
              onChange={(e) => setAdvanceReason(e.target.value)}
              placeholder="All primary documents scrutinized and verified against statutory criteria..."
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanceModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdvanceStage} className="bg-blue-600 text-white">
              Confirm & Advance Case
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 3. Schedule EVC Dialog */}
      <Dialog
        open={showEvcModal}
        onOpenChange={setShowEvcModal}
        title="Schedule Expert Visiting Committee (EVC)"
        description={`Constitutes inspection panel for ${app.applicationNumber}`}
      >
        <div className="space-y-3.5 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Proposed Inspection Date</Label>
            <Input
              type="date"
              value={evcDate}
              onChange={(e) => setEvcDate(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Assigned Expert Committee Members (Comma-separated)
            </Label>
            <Input
              value={evcExperts}
              onChange={(e) => setEvcExperts(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Special Inspection Directives</Label>
            <Textarea
              rows={3}
              value={evcNotes}
              onChange={(e) => setEvcNotes(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowEvcModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleScheduleEvc} className="bg-purple-700 text-white">
              Confirm & Dispatch Orders
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 4. Record Final Decision Dialog */}
      <Dialog
        open={showDecisionModal}
        onOpenChange={setShowDecisionModal}
        title="Record Final Regulatory Decision"
        description={`Executive order for ${app.applicationNumber}`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Decision Outcome</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  checked={decisionType === "approved"}
                  onChange={() => setDecisionType("approved")}
                />
                <span className="font-bold text-emerald-700">Grant Approval (Issue EoA Order)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="decision"
                  checked={decisionType === "rejected"}
                  onChange={() => setDecisionType("rejected")}
                />
                <span className="font-bold text-rose-700">Reject Application</span>
              </label>
            </div>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Executive Rationale & Committee Findings
            </Label>
            <Textarea
              rows={3}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
              className="text-xs"
            />
          </div>

          {decisionType === "approved" && (
            <div>
              <Label className="font-semibold text-slate-800 block mb-1">
                Post-Approval Conditions / Undertakings (Semicolon-separated)
              </Label>
              <Textarea
                rows={2}
                value={decisionConditions}
                onChange={(e) => setDecisionConditions(e.target.value)}
                className="text-xs"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                These conditions will automatically generate enforceable compliance undertakings for the institution.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowDecisionModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRecordDecision}
              className={
                decisionType === "approved"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-rose-600 hover:bg-rose-700 text-white"
              }
            >
              Seal and Execute Decision
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 5. Reassign Dialog */}
      <Dialog
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        title="Reassign Case Handler"
        description={`Transfer regulatory responsibility for ${app.applicationNumber}`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Target Officer Role</Label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="w-full h-8 px-2 rounded border border-slate-200 text-xs text-slate-800"
            >
              {AICTE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleReassign} className="bg-slate-900 text-white">
              Reassign Case
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function CaseReviewPage() {
  return (
    <RequireRole roles={[...AICTE_ROLES]}>
      <CaseReviewContent />
    </RequireRole>
  );
}
