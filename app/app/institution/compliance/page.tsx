"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SlaCountdown } from "@/components/shared/StatusBadge";
import { Dialog } from "@/components/ui/dialog";
import { dataService } from "@/lib/dataService";
import { Undertaking } from "@/lib/types";
import {
  ClipboardCheck,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileCheck2,
  ExternalLink,
} from "lucide-react";

function ComplianceContent() {
  const { userProfile } = useAuth();
  const [undertakings, setUndertakings] = useState<Undertaking[]>(() =>
    dataService.getUndertakings(userProfile?.institutionId || "inst-001")
  );

  const [activeUt, setActiveUt] = useState<Undertaking | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [evidenceName, setEvidenceName] = useState("");
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  const reloadData = () => {
    setUndertakings(dataService.getUndertakings(userProfile?.institutionId || "inst-001"));
  };

  const handleSubmitProof = () => {
    if (!activeUt) return;
    dataService.submitUndertakingEvidence(activeUt.id, `doc-proof-${Date.now()}`);
    setShowUploadModal(false);
    setSubmittedSuccess(true);
    reloadData();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Compliance & Statutory Undertakings
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Monitor and fulfill mandatory conditions imposed during AICTE approval cycles
          </p>
        </div>
      </div>

      {submittedSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Compliance evidence successfully logged and queued for Regional Office verification.
        </div>
      )}

      {/* Undertakings Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">
              Active Approval Conditions ({undertakings.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Conditions must be resolved by deadline to prevent revocation of approval orders
            </CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Condition Description</th>
                <th className="py-3 px-4">Application Ref</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Compliance Deadline</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {undertakings.map((ut) => (
                <tr key={ut.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 max-w-sm">
                    <p className="font-semibold text-slate-900">{ut.condition}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                      {ut.description}
                    </p>
                  </td>
                  <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                    {ut.applicationId}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        ut.status === "verified"
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : ut.status === "submitted"
                          ? "bg-blue-50 text-blue-800 border border-blue-200"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          ut.status === "verified"
                            ? "bg-emerald-600"
                            : ut.status === "submitted"
                            ? "bg-blue-600"
                            : "bg-amber-600"
                        }`}
                      />
                      {ut.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <SlaCountdown dueAt={ut.dueAt} />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    {ut.status === "verified" ? (
                      <span className="text-emerald-700 text-xs font-medium">Compliance Certified</span>
                    ) : ut.status === "submitted" ? (
                      <span className="text-blue-700 text-xs font-medium">Under Officer Audit</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setActiveUt(ut);
                          setEvidenceName("");
                          setShowUploadModal(true);
                        }}
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <UploadCloud className="h-3 w-3 mr-1" /> Submit Evidence
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upload Evidence Dialog */}
      <Dialog
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        title="Submit Compliance Evidence"
        description={activeUt?.condition}
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Attach verified completion certificate, contractor invoices, or local authority NOC certifying fulfillment of this condition.
          </p>

          <div
            onClick={() => setEvidenceName("Compliance_Certificate_Signed.pdf")}
            className="border border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50 hover:bg-slate-100 cursor-pointer transition"
          >
            <UploadCloud className="h-8 w-8 text-blue-600 mx-auto" />
            <p className="text-xs font-medium text-slate-800 mt-2">
              {evidenceName ? `Selected: ${evidenceName}` : "Click to select and upload Evidence PDF"}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Maximum file size: 15MB</p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowUploadModal(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!evidenceName}
              onClick={handleSubmitProof}
              className="bg-blue-600 text-white"
            >
              Confirm & Submit
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default function InstitutionCompliancePage() {
  return (
    <RequireRole roles={["institution"]}>
      <ComplianceContent />
    </RequireRole>
  );
}
