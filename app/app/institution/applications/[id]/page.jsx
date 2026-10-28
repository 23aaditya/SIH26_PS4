"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, DocumentBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { WorkflowStepper, AuditTimeline } from "@/components/shared/WorkflowTimeline";
import { Dialog } from "@/components/ui/dialog";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORY_LABELS } from "@/lib/types";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Download,
  UploadCloud,
  ArrowLeft,
  ShieldCheck,
  Send,
  Eye,
  Check,
  AlertCircle,
  Clock,
  Loader2,
  Scale,
  Gavel,
  ArrowRight,
  CornerDownRight,
  RotateCcw,
  User,
  UserCheck,
} from "lucide-react";

const KNOWN_OFFICERS = {
  "DEMO-AIC-034": {
    name: "Dr. R. K. Sharma",
    code: "DEMO-AIC-034",
    role: "Scrutiny Committee Member",
    bureau: "Approval Bureau (Western/Northern)",
  },
  "DEMO-AIC-037": {
    name: "Dr. Neha Rao",
    code: "DEMO-AIC-037",
    role: "EVC Inspection Coordinator",
    bureau: "Regional Inspection Committee",
  },
  "DEMO-AIC-013": {
    name: "Shri Karan Sinha",
    code: "DEMO-AIC-013",
    role: "Regional Officer / Bureau Officer",
    bureau: "Standing Hearing & Approval Bureau",
  },
  "DEMO-AIC-001": {
    name: "Super Administrator",
    code: "DEMO-AIC-001",
    role: "AICTE Headquarter Executive",
    bureau: "Central Governance Council",
  },
};

function getWorkingOfficer(app) {
  if (!app) return null;
  if (app.workflowInstance?.stages) {
    const activeStage =
      app.workflowInstance.stages.find(
        (s) =>
          (s.stageKey === app.currentStageId || s.stageKey === app.workflowInstance?.currentStageKey) &&
          !["COMPLETED", "SKIPPED"].includes(s.stageStatus)
      ) ||
      app.workflowInstance.stages.find(
        (s) => s.stageStatus === "ASSIGNED" || s.stageStatus === "IN_PROGRESS"
      );

    if (activeStage?.assignedStaff) {
      return {
        name: activeStage.assignedStaff.name,
        code: activeStage.assignedStaff.employeeCode || activeStage.assignedStaff.id,
        role: activeStage.assignedStaff.role || activeStage.stageName,
        stage: activeStage.stageName,
      };
    }
  }

  if (app.assignedUserId && KNOWN_OFFICERS[app.assignedUserId]) {
    return {
      ...KNOWN_OFFICERS[app.assignedUserId],
      stage: app.currentStageName || "Current Processing Stage",
    };
  }

  if (app.currentStageId === "scrutiny" || app.status === "in_review") {
    return {
      ...KNOWN_OFFICERS["DEMO-AIC-034"],
      stage: app.currentStageName || "Scrutiny Committee Review",
    };
  } else if (app.currentStageId === "evc" || app.status === "pending_evc") {
    return {
      ...KNOWN_OFFICERS["DEMO-AIC-037"],
      stage: app.currentStageName || "Expert Visit Committee (EVC)",
    };
  } else if (app.currentStageId === "committee" || app.currentStageId === "decision") {
    return {
      ...KNOWN_OFFICERS["DEMO-AIC-013"],
      stage: app.currentStageName || "Standing Hearing Committee",
    };
  }

  return {
    name: "Dr. R. K. Sharma",
    code: app.assignedUserId || "DEMO-AIC-034",
    role: app.currentAssigneeRole?.replace(/_/g, " ").toUpperCase() || "Scrutiny Committee Officer",
    stage: app.currentStageName || "Under Review",
  };
}

function getNextLevelInfo(app) {
  if (!app) {
    return {
      stageName: "Expert Visit Committee (EVC)",
      assignedOfficer: "Dr. Neha Rao (DEMO-AIC-037)",
    };
  }

  const currentKey = app.currentStageId || "scrutiny";

  if (currentKey === "verification") {
    return {
      stageName: "Scrutiny Committee Review",
      assignedOfficer: "Dr. R. K. Sharma (DEMO-AIC-034)",
    };
  }

  if (currentKey === "scrutiny" || currentKey === "re_scrutiny") {
    if (app.requiresEvc) {
      return {
        stageName: "Expert Visit Committee (EVC) Inspection",
        assignedOfficer: "Dr. Neha Rao (DEMO-AIC-037)",
      };
    } else {
      return {
        stageName: "Standing Hearing Committee (SHC) Review",
        assignedOfficer: "Shri Karan Sinha (DEMO-AIC-013)",
      };
    }
  }

  if (currentKey === "evc") {
    return {
      stageName: "Standing Hearing Committee (SHC) Review",
      assignedOfficer: "Shri Karan Sinha (DEMO-AIC-013)",
    };
  }

  if (currentKey === "committee") {
    return {
      stageName: "Executive Committee Final Decision",
      assignedOfficer: "Executive Committee / Competent Authority",
    };
  }

  return {
    stageName: "Executive Committee Final Decision",
    assignedOfficer: "Competent Authority Panel",
  };
}

function formatFieldKey(key) {
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
}

function ApplicationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const id = params?.id;

  const [app, setApp] = useState(undefined);
  const [docs, setDocs] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Deficiency response state
  const [clarificationText, setClarificationText] = useState("");
  const [clarifyFile, setClarifyFile] = useState(null);
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [submittingClarify, setSubmittingClarify] = useState(false);
  const [clarifySuccess, setClarifySuccess] = useState(false);

  // Grievance / Appeal state
  const [showGrievanceModal, setShowGrievanceModal] = useState(false);
  const [grievanceCategory, setGrievanceCategory] = useState("Statutory Compliance Disputed (APH Norms Met)");
  const [grievanceText, setGrievanceText] = useState("");
  const [grievanceFile, setGrievanceFile] = useState(null);
  const [submittingGrievance, setSubmittingGrievance] = useState(false);
  const [grievanceSuccess, setGrievanceSuccess] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const reloadData = async () => {
    if (!id) return;
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/applications/${id}`, {
        headers: {
          "x-user-id": userProfile?.uid || userProfile?.email || "principal@pict.edu",
        },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        setApp(data);
        setDocs(data.documents || []);
        setAuditEvents(data.auditEvents || []);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.warn("Backend fetch failed, checking local dataService:", err);
    }

    // Fallback to dataService
    const found = dataService.getApplicationById(id);
    setApp(found);
    if (found) {
      setDocs(dataService.getDocuments(found.id));
      setAuditEvents(dataService.getAuditEvents(found.id));
    }
    setLoading(false);
  };

  useEffect(() => {
    reloadData();
  }, [id, userProfile]);

  if (loading) {
    return (
      <div className="p-12 text-center bg-white rounded-lg border border-slate-200">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
        <h3 className="mt-3 text-sm font-semibold text-slate-900">Loading Application Dossier...</h3>
        <p className="mt-1 text-xs text-slate-500">Retrieving official AICTE case records</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="p-8 text-center bg-white rounded-lg border border-slate-200">
        <FileText className="h-10 w-10 text-slate-300 mx-auto" />
        <h3 className="mt-3 text-sm font-semibold text-slate-900">Application not found</h3>
        <p className="mt-1 text-xs text-slate-500">The requested application ID does not exist in the record.</p>
        <Link href="/institution/applications">
          <Button variant="outline" size="sm" className="mt-4 text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return to Applications
          </Button>
        </Link>
      </div>
    );
  }

  const institution = app.institution || dataService.getInstitutionById(app.institutionId);
  const workingOfficer = getWorkingOfficer(app);
  const nextLevel = getNextLevelInfo(app);
  const isAwaitingInstitution = app.status === "awaiting_institution" || app.status === "deficiency_raised";
  const isRejected = app.status === "rejected";
  const hasDeficiencies = (app.deficiencies && app.deficiencies.length > 0) || docs.some((d) => d.verificationStatus === "issue_found");
  const isScrutinyContested = isAwaitingInstitution || isRejected || hasDeficiencies;
  const typeLabel =
    app.applicationType?.name ||
    APPLICATION_CATEGORY_LABELS[app.applicationCategory] ||
    app.applicationCategory ||
    "Statutory Approval Application";

  const handleClarificationSubmit = async () => {
    if (!clarificationText.trim()) return;
    setSubmittingClarify(true);

    try {
      // 1. If replacement file attached, upload it first
      let attachedDocId = null;
      if (clarifyFile) {
        const formData = new FormData();
        formData.append("file", clarifyFile);
        formData.append("documentType", "Revised Statutory Evidence");

        const uploadRes = await fetch(`${API_BASE}/applications/${app.id}/documents`, {
          method: "POST",
          headers: {
            "x-user-id": userProfile?.uid || userProfile?.email || "principal@pict.edu",
          },
          credentials: "include",
          body: formData,
        });

        if (uploadRes.ok) {
          const upJson = await uploadRes.json();
          attachedDocId = upJson.document?.id;
        }
      }

      // 2. Submit deficiency response
      const res = await fetch(`${API_BASE}/applications/${app.id}/deficiency-response`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userProfile?.uid || userProfile?.email || "principal@pict.edu",
        },
        credentials: "include",
        body: JSON.stringify({
          responseText: clarificationText,
          attachedDocumentIds: attachedDocId ? [attachedDocId] : [],
        }),
      });

      if (res.ok) {
        setShowClarifyModal(false);
        setClarifySuccess(true);
        setClarificationText("");
        setClarifyFile(null);
        await reloadData();
      } else {
        // Fallback to dataService if API route returned error
        dataService.advanceStage(
          app.id,
          "scrutiny",
          "Scrutiny Committee Re-Evaluation",
          "scrutiny_committee",
          "in_review",
          `Institution submitted clarification: ${clarificationText}`,
          { uid: userProfile?.uid || "inst-user-1", role: "institution" }
        );
        setShowClarifyModal(false);
        setClarifySuccess(true);
        setClarificationText("");
        reloadData();
      }
    } catch (err) {
      console.error("Deficiency response submission error:", err);
  const handleGrievanceSubmit = async () => {
    if (!grievanceText.trim()) return;
    setSubmittingGrievance(true);
    try {
      let attachedDocId = null;
      if (grievanceFile) {
        const formData = new FormData();
        formData.append("file", grievanceFile);
        formData.append("documentType", "Grievance Legal / Statutory Evidence");

        const uploadRes = await fetch(`${API_BASE}/applications/${app.id}/documents`, {
          method: "POST",
          headers: {
            "x-user-id": userProfile?.uid || userProfile?.email || "principal@pict.edu",
          },
          credentials: "include",
          body: formData,
        });

        if (uploadRes.ok) {
          const upJson = await uploadRes.json();
          attachedDocId = upJson.document?.id;
        }
      }

      const res = await fetch(`${API_BASE}/applications/${app.id}/grievance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userProfile?.uid || userProfile?.email || "principal@pict.edu",
        },
        credentials: "include",
        body: JSON.stringify({
          groundsText: grievanceText.trim(),
          category: grievanceCategory,
          grievanceType: "GRIEVANCE_SCRUTINY",
          attachedDocumentId: attachedDocId,
        }),
      });

      if (res.ok) {
        setShowGrievanceModal(false);
        setGrievanceSuccess(true);
        setGrievanceText("");
        setGrievanceFile(null);
        await reloadData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || "Failed to register formal grievance with AICTE.");
      }
    } catch (err) {
      console.error("Grievance submission error:", err);
      alert("Error submitting grievance: " + err.message);
    } finally {
      setSubmittingGrievance(false);
    }
  };

  const handleDownloadDoc = async (doc) => {
    if (!doc.id) {
      alert(`Viewing local document reference: ${doc.originalFilename}`);
      return;
    }
    try {
      const authUid = userProfile?.uid || userProfile?.email || "principal@pict.edu";
      const res = await fetch(`${API_BASE}/documents/${doc.id}/download?inline=true&token=${encodeURIComponent(authUid)}`, {
        headers: {
          "x-user-id": authUid,
        },
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Document file payload unavailable on server storage (HTTP ${res.status}).`);
        return;
      }

      const rawBlob = await res.blob();
      const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);
      window.open(url, "_blank");
    } catch (err) {
      alert(`Could not fetch document: ${err.message}`);
    }
  };

  const formDataEntries = Object.entries(app.formData || {}).filter(
    ([k]) => !k.startsWith("_") && k !== "declaration"
  );

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-2">
          <Link href="/institution/applications">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600 px-2">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Applications
            </Button>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-mono text-xs font-bold text-slate-900">{app.applicationNumber}</span>
          <StatusBadge status={app.status} />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => alert(`Generated Application Summary Dossier for ${app.applicationNumber}`)}
          >
            <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
            Download Summary
          </Button>

          {isScrutinyContested && (
            <>
              <Button
                size="sm"
                onClick={() => setShowClarifyModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs shadow-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Send for Re-Scrutiny
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowGrievanceModal(true)}
                className="border-purple-300 text-purple-800 hover:bg-purple-50 text-xs shadow-xs font-semibold flex items-center gap-1.5"
              >
                <Scale className="h-3.5 w-3.5" />
                Raise Grievance
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Header Banner with Active Officer & Pipeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>{institution?.institutionName || "Pune Institute of Computer Technology"}</span>
              <span>•</span>
              <span className="font-mono">PID: {institution?.institutionCode || "1-482910381"}</span>
              <span>•</span>
              <span className="capitalize">{app.regionId || "Western"} Region</span>
            </div>
            <h1 className="mt-1 text-lg sm:text-xl font-bold text-slate-900">
              {typeLabel}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Current Stage: <strong className="text-slate-900">{app.currentStageName || "Scrutiny Review"}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-5">
            {/* Working Officer */}
            <div className="min-w-[130px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Working Officer
              </p>
              <p className="text-xs font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                {workingOfficer?.name}
                <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-100 rounded text-slate-600 border border-slate-200">
                  {workingOfficer?.code}
                </span>
              </p>
              <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{workingOfficer?.role}</p>
            </div>

            {/* Next Approval Level */}
            <div className="min-w-[130px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 flex items-center gap-1">
                <ArrowRight className="h-2.5 w-2.5" /> Next Level
              </p>
              <p className="text-xs font-bold text-blue-900 mt-0.5 truncate max-w-[160px]">
                {nextLevel.stageName}
              </p>
              <p className="text-[10px] text-slate-500 truncate max-w-[160px]">{nextLevel.assignedOfficer}</p>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Regulatory SLA
              </p>
              <div className="mt-0.5">
                <SlaCountdown dueAt={app.dueAt} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Submitted On
              </p>
              <p className="text-xs font-medium text-slate-800 mt-0.5">
                {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString("en-IN") : "Draft Mode"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Stepper */}
      <WorkflowStepper currentStageId={app.currentStageId || "scrutiny"} status={app.status} requiresEvc={app.requiresEvc} />

      {/* Statutory Action Center: Scrutiny Response & Dispute Resolution */}
      {isScrutinyContested && (
        <div className="rounded-xl border-2 border-amber-300/80 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-800" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Take Action: Scrutiny Findings & Committee Resolution
                </h3>
                <p className="text-xs text-slate-600">
                  {isRejected
                    ? "Application decision recorded as rejected. You have the statutory right to appeal."
                    : "The Scrutiny Committee has raised observations/deficiencies requiring institutional action."}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-1 rounded-full border border-amber-200 shrink-0 font-mono">
              Action Required
            </span>
          </div>

          {/* Scrutiny Observation Snippet */}
          <div className="bg-amber-100/50 rounded-lg p-3 text-xs border border-amber-200/60 text-slate-800">
            <span className="font-bold text-amber-950 uppercase tracking-wide text-[10px] block mb-0.5">
              Latest Scrutiny Note / Deficiency Reason:
            </span>
            <p className="leading-relaxed">
              {app.nextActionDescription ||
                (app.deficiencies && app.deficiencies.length > 0
                  ? app.deficiencies[0].deficiencyText
                  : "Observations noted during statutory scrutiny against AICTE Approval Process Handbook (APH 2024-27) norms.")}
            </p>
          </div>

          {/* 2 Clear Action Pathways */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Pathway 1: Send for Re-Scrutiny */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition shadow-2xs flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-blue-700">
                  <RotateCcw className="h-4 w-4" />
                  <h4 className="font-bold text-xs uppercase tracking-wide">
                    Option 1: Send for Re-Scrutiny
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  If you have rectified the flagged documentary deficiencies or obtained renewed statutory certificates, upload replacement evidence and return the case to the Scrutiny Committee for re-verification.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowClarifyModal(true)}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-8 flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                Rectify & Send for Re-Scrutiny
              </Button>
            </div>

            {/* Pathway 2: Raise Grievance / Appeal */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 hover:border-purple-300 transition shadow-2xs flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-purple-700">
                  <Scale className="h-4 w-4" />
                  <h4 className="font-bold text-xs uppercase tracking-wide">
                    Option 2: Raise Grievance / Appeal
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  If you dispute the scrutiny committee's observation or maintain that your institution is already fully compliant with APH norms, file a formal grievance to the Standing Hearing / Appellate Committee (SAC).
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowGrievanceModal(true)}
                className="mt-4 w-full border-purple-300 text-purple-800 hover:bg-purple-50 text-xs font-semibold h-8 flex items-center justify-center gap-1.5"
              >
                <Gavel className="h-3.5 w-3.5" />
                Raise Formal Grievance / Appeal
              </Button>
            </div>
          </div>
        </div>
      )}

      {clarifySuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-xs text-emerald-800 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Clarification successfully submitted. Application returned to Scrutiny Committee for verification.</span>
        </div>
      )}

      {grievanceSuccess && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 flex items-center gap-2 text-xs text-purple-900 shadow-2xs">
          <CheckCircle2 className="h-4 w-4 text-purple-600 shrink-0" />
          <span>Formal grievance successfully registered with AICTE. Your case has been referred to the Standing Hearing Committee (SHC) / Standing Appellate Committee (SAC) for statutory review.</span>
        </div>
      )}

      {/* 2-Column Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section: Application Data / Dossier */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Application Specifications & Dynamic Dossier
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Statutory form fields configured for {typeLabel}
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {formDataEntries.length} configured fields
              </span>
            </CardHeader>
            <CardContent className="p-4">
              {formDataEntries.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No specific form fields recorded.</p>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 text-xs">
                  {formDataEntries.map(([key, val]) => (
                    <div key={key} className="border-b border-slate-100 pb-2">
                      <dt className="text-slate-500 font-medium">{formatFieldKey(key)}</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 break-words">
                        {typeof val === "boolean" ? (val ? "Yes" : "No") : String(val || "—")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>

          {/* Section: Uploaded Statutory Documents */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900">
                Uploaded Statutory Documents ({docs.length})
              </CardTitle>
              <span className="text-[11px] text-slate-500">Official Repository • Max 10MB per file</span>
            </CardHeader>
            <div className="divide-y divide-slate-100">
              {docs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No documents found for this application record.
                </div>
              ) : (
                docs.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 flex items-center justify-between hover:bg-slate-50/60 transition text-xs"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{d.documentType}</span>
                        <DocumentBadge status={d.verificationStatus || "pending"} />
                      </div>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                        {d.originalFilename}
                        {d.fileSize ? ` • ${(d.fileSize / (1024 * 1024)).toFixed(2)} MB` : ""}
                      </p>
                      {d.notes && (
                        <p className="mt-1 text-[11px] text-amber-800 bg-amber-50/70 p-1.5 rounded border border-amber-200">
                          <strong>Scrutiny Officer Note:</strong> {d.notes}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadDoc(d)}
                        className="h-7 text-xs px-2 text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View Document
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Section: Registered Grievances & Formal Appeals */}
          {app.appeals && app.appeals.length > 0 && (
            <Card className="border border-purple-200 bg-white shadow-2xs">
              <CardHeader className="p-4 border-b border-purple-100 flex flex-row items-center justify-between bg-purple-50/50">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-purple-700" />
                  <CardTitle className="text-sm font-semibold text-purple-950">
                    Registered Grievances & Formal Appeals ({app.appeals.length})
                  </CardTitle>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-purple-100 text-purple-800 px-2 py-0.5 rounded border border-purple-200">
                  Standing Hearing Committee Docket
                </span>
              </CardHeader>
              <div className="divide-y divide-slate-100">
                {app.appeals.map((appeal) => (
                  <div key={appeal.id} className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{appeal.appealType}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        appeal.status === "FILED" ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-emerald-100 text-emerald-800"
                      }`}>
                        {appeal.status}
                      </span>
                    </div>
                    <p className="text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed font-mono text-[11px]">
                      {appeal.groundsText}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Filed on {new Date(appeal.filedAt || appeal.createdAt).toLocaleDateString("en-IN")} • Referred to Standing Appellate Committee (SAC)
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Section: Chronological Audit Trail */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-900">
                Audit Trail & Workflow Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <AuditTimeline events={auditEvents} />
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Metadata Card */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Workflow Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs">
              <div>
                <span className="text-slate-500 block">Current Assignee Role</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.currentAssigneeRole
                    ? app.currentAssigneeRole.replace(/_/g, " ").toUpperCase()
                    : "SCRUTINY COMMITTEE"}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">AICTE Regional Bureau</span>
                <span className="font-semibold text-slate-900 block mt-0.5 capitalize">
                  {app.regionId || "Western"} Regional Office
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Returns for Clarification</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.returnCount || 0} deficiency cycle(s)
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Workflow Engine Status</span>
                <span className="font-mono text-slate-700 block mt-0.5">
                  Active • Transaction Logged
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Quick Help & Guidance */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
            <h4 className="font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              AICTE Regulatory Guarantee
            </h4>
            <p className="leading-relaxed">
              Applications are protected under the AICTE Citizens Charter. Automatic escalation to Bureau Officer occurs if scrutiny exceeds statutory timelines.
            </p>
          </div>
        </div>
      </div>

      {/* Clarification Response Dialog */}
      <Dialog
        open={showClarifyModal}
        onOpenChange={setShowClarifyModal}
        title="Respond to Scrutiny Deficiency"
        description={`Provide clarification statement and attach renewed documents for ${app.applicationNumber}`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Institutional Clarification Statement *
            </label>
            <textarea
              rows={4}
              value={clarificationText}
              onChange={(e) => setClarificationText(e.target.value)}
              placeholder="Explain how the flagged deficiencies have been rectified in detail..."
              className="w-full p-2.5 rounded border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Attach Updated Document / Certificate (Optional)
            </label>
            <div className="border border-dashed border-slate-300 rounded-lg p-4 text-center bg-slate-50">
              <UploadCloud className="h-6 w-6 text-slate-400 mx-auto" />
              <p className="text-xs font-medium text-slate-700 mt-1">
                {clarifyFile ? clarifyFile.name : "Select Revised PDF or Image"}
              </p>
              <p className="text-[11px] text-slate-400">PDF, JPG, PNG up to 10 MB</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) {
                      alert("File exceeds maximum allowed size of 10 MB.");
                      return;
                    }
                    setClarifyFile(f);
                  }
                }}
                className="mt-2 text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowClarifyModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!clarificationText.trim() || submittingClarify}
              onClick={handleClarificationSubmit}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {submittingClarify ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Submitting...
                </>
              ) : (
                "Submit Response to AICTE"
              )}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Formal Grievance & Appeal Dialog */}
      <Dialog
        open={showGrievanceModal}
        onOpenChange={setShowGrievanceModal}
        title="Raise Formal Grievance / Appeal to AICTE"
        description={`Submit official dispute against scrutiny observations for ${app.applicationNumber}`}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Grievance Category *
            </label>
            <select
              value={grievanceCategory}
              onChange={(e) => setGrievanceCategory(e.target.value)}
              className="w-full h-8 px-2 rounded border border-slate-200 text-xs text-slate-800 outline-none focus:border-purple-500"
            >
              <option value="Statutory Compliance Disputed (APH Norms Met)">
                Statutory Compliance Disputed (Norms already compliant per APH)
              </option>
              <option value="Documentary Evidence Misinterpreted">
                Documentary Evidence Misinterpreted or Overlooked
              </option>
              <option value="Procedural Irregularity during Scrutiny">
                Procedural Irregularity in Scrutiny Review
              </option>
              <option value="Technical or Portal Upload Discrepancy">
                Technical Upload or Checksum Discrepancy
              </option>
              <option value="Other Statutory Grievance">Other Statutory Grounds</option>
            </select>
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Grounds of Grievance & Detailed Explanation *
            </label>
            <textarea
              rows={4}
              value={grievanceText}
              onChange={(e) => setGrievanceText(e.target.value)}
              placeholder="State clearly why the scrutiny objection is disputed, referencing relevant AICTE Approval Process Handbook (APH) clauses and submitted evidence..."
              className="w-full p-2.5 rounded border border-slate-200 text-xs text-slate-800 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Attach Supporting Legal / Statutory Justification (Optional)
            </label>
            <div className="border border-dashed border-slate-300 rounded-lg p-3 text-center bg-slate-50">
              <UploadCloud className="h-5 w-5 text-slate-400 mx-auto" />
              <p className="text-xs font-medium text-slate-700 mt-1">
                {grievanceFile ? grievanceFile.name : "Attach Clarification PDF or Affidavit"}
              </p>
              <p className="text-[11px] text-slate-400">PDF, JPG, PNG up to 10 MB</p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 10 * 1024 * 1024) {
                      alert("File exceeds maximum allowed size of 10 MB.");
                      return;
                    }
                    setGrievanceFile(f);
                  }
                }}
                className="mt-2 text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
              />
            </div>
          </div>

          <div className="rounded-lg bg-purple-50/80 p-2.5 border border-purple-200 text-[11px] text-purple-900 leading-relaxed">
            <strong>Statutory Rights Notice:</strong> Grievances submitted under AICTE APH Chapter I/II are formally docketed and assigned to the Standing Hearing Committee (SHC) / Standing Appellate Committee (SAC).
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowGrievanceModal(false)} disabled={submittingGrievance}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!grievanceText.trim() || submittingGrievance}
              onClick={handleGrievanceSubmit}
              className="bg-purple-700 hover:bg-purple-800 text-white font-semibold flex items-center gap-1.5"
            >
              {submittingGrievance ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Registering Grievance...
                </>
              ) : (
                <>
                  <Gavel className="h-3.5 w-3.5" /> Register Grievance with AICTE
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function ApplicationDetailPage() {
  return (
    <RequireRole roles={["institution"]}>
      <ApplicationDetailContent />
    </RequireRole>
  );
}
