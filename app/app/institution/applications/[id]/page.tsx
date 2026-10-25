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
import { APPLICATION_CATEGORY_LABELS, Application, ApplicationDocument, AuditEvent } from "@/lib/types";
import {
  FileText,
  Clock,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  UploadCloud,
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Send,
  Eye,
} from "lucide-react";

function ApplicationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const id = params?.id as string;

  const [app, setApp] = useState<Application | undefined>(undefined);
  const [docs, setDocs] = useState<ApplicationDocument[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [clarificationText, setClarificationText] = useState("");
  const [showClarifyModal, setShowClarifyModal] = useState(false);
  const [clarifySuccess, setClarifySuccess] = useState(false);

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
        <p className="mt-1 text-xs text-slate-500">The requested application ID does not exist in the record.</p>
        <Link href="/institution/applications">
          <Button variant="outline" size="sm" className="mt-4 text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Return to Applications
          </Button>
        </Link>
      </div>
    );
  }

  const institution = dataService.getInstitutionById(app.institutionId);
  const isAwaitingInstitution = app.status === "awaiting_institution";

  const handleClarificationSubmit = () => {
    if (!clarificationText.trim()) return;

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
  };

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
            onClick={() => alert(`Generated Application Summary PDF for ${app.applicationNumber}`)}
          >
            <Download className="h-3.5 w-3.5 mr-1 text-slate-500" />
            Download Application Copy
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
              <span>{institution?.institutionName || "PICT Pune"}</span>
              <span>•</span>
              <span className="font-mono">Code: {institution?.institutionCode || "1-482910381"}</span>
              <span>•</span>
              <span className="capitalize">{app.regionId} Region</span>
            </div>
            <h1 className="mt-1 text-lg sm:text-xl font-bold text-slate-900">
              {APPLICATION_CATEGORY_LABELS[app.applicationCategory]}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Current Stage: <strong className="text-slate-900">{app.currentStageName}</strong>
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
                {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString("en-IN") : "Draft"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Stepper */}
      <WorkflowStepper
        currentStageId={app.currentStageId}
        status={app.status}
        requiresEvc={app.requiresEvc}
      />

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
                {app.nextActionDescription}
              </p>
              <Button
                size="sm"
                onClick={() => setShowClarifyModal(true)}
                className="mt-3 bg-amber-700 hover:bg-amber-800 text-white text-xs h-7"
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
          Clarification successfully submitted. Application returned to Scrutiny Committee.
        </div>
      )}

      {/* 2-Column Detail Layout (Jira Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section: Application Data / Dossier */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-900">
                Application Specifications & Dossier
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-slate-500 font-medium">Department / Program</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {String(app.formData?.programName || "Engineering & Technology")}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Target Academic Year</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {String(app.formData?.academicYear || "2026-2027")}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Proposed Intake Capacity</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {String(app.formData?.proposedIntake || "180")} Seats
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Instructional Area</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {String(app.formData?.builtUpAreaSqM || "8400")} sq. meters
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Full-time Faculty Assigned</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {String(app.formData?.facultyCount || "32")} Faculty Members
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">EVC Physical Visit Required</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {app.requiresEvc ? "Yes (Inspection scheduled)" : "Exempted per APH guidelines"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Section: Uploaded Statutory Documents */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-900">
                Uploaded Verification Documents ({docs.length})
              </CardTitle>
              <span className="text-[11px] text-slate-500">Official Repository</span>
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
                        <DocumentBadge status={d.verificationStatus} />
                      </div>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">
                        {d.originalFilename}
                      </p>
                      {d.notes && (
                        <p className="mt-1 text-[11px] text-amber-800 bg-amber-50/70 p-1.5 rounded border border-amber-200">
                          <strong>Scrutiny Note:</strong> {d.notes}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => alert(`Viewing document: ${d.originalFilename}`)}
                        className="h-7 text-xs px-2"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-500 mr-1" /> View
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Section: Chronological Audit Trail (Jira Activity Feed) */}
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

        {/* Right Sidebar (Jira Meta & Inspector Panel) */}
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
                    : "Terminal Decision"}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">AICTE Regional Bureau</span>
                <span className="font-semibold text-slate-900 block mt-0.5 capitalize">
                  {app.regionId} Regional Office
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Returns for Clarification</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.returnCount || 0} deficiency cycle(s)
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Workflow Engine Version</span>
                <span className="font-mono text-slate-700 block mt-0.5">
                  {app.workflowVersionId} ({app.workflowDefinitionId})
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
              Applications are protected under the AICTE Citizens Charter. Automatic escalation to Bureau Officer occurs if scrutiny exceeds 15 days.
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
              Institutional Clarification Statement
            </label>
            <textarea
              rows={4}
              value={clarificationText}
              onChange={(e) => setClarificationText(e.target.value)}
              placeholder="Explain how the flagged deficiencies have been rectified..."
              className="w-full p-2.5 rounded border border-slate-200 text-xs text-slate-800 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-800 block mb-1">
              Attach Updated Certificate (e.g. Renewed Fire NOC / Cadre Ratio)
            </label>
            <div className="border border-dashed border-slate-300 rounded-lg p-4 text-center bg-slate-50">
              <UploadCloud className="h-6 w-6 text-slate-400 mx-auto" />
              <p className="text-xs font-medium text-slate-700 mt-1">Upload Revised PDF</p>
              <p className="text-[11px] text-slate-400">PDF up to 10MB</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowClarifyModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!clarificationText.trim()}
              onClick={handleClarificationSubmit}
              className="bg-blue-600 text-white"
            >
              Submit Response to AICTE
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
