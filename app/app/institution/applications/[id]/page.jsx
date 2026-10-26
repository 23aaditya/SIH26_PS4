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
} from "lucide-react";

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
  const isAwaitingInstitution = app.status === "awaiting_institution" || app.status === "deficiency_raised";
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
    } finally {
      setSubmittingClarify(false);
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

          {isAwaitingInstitution && (
            <Button
              size="sm"
              onClick={() => setShowClarifyModal(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs shadow-xs font-semibold"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Respond to Deficiency
            </Button>
          )}
        </div>
      </div>

      {/* Header Banner */}
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

          <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
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

      {/* Alert if Deficiency Action Required */}
      {isAwaitingInstitution && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-xs font-bold text-amber-900">
                Action Required: Scrutiny Deficiency Resolution
              </h3>
              <p className="mt-1 text-xs text-amber-800 leading-relaxed font-normal">
                {app.nextActionDescription ||
                  (app.deficiencies && app.deficiencies.length > 0 ? app.deficiencies[0].deficiencyText : "Scrutiny committee has requested clarifications on your submitted application.")}
              </p>
              <Button
                size="sm"
                onClick={() => setShowClarifyModal(true)}
                className="mt-3 bg-amber-700 hover:bg-amber-800 text-white text-xs h-7 font-semibold"
              >
                Upload Clarification Document & Submit Response
              </Button>
            </div>
          </div>
        </div>
      )}

      {clarifySuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Clarification successfully submitted. Application returned to Scrutiny Committee for verification.
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
