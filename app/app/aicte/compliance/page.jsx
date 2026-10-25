"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { CheckCircle2, ShieldCheck } from "lucide-react";
const COMPLIANCE_ROLES = ["regional_officer", "bureau_officer", "admin"];
function ComplianceMonitoringContent() {
    const { userProfile } = useAuth();
    const [undertakings, setUndertakings] = useState(() => dataService.getUndertakings());
    const [filter, setFilter] = useState("all");
    const handleVerifyCondition = (utId) => {
        // Mark as verified
        const all = dataService.getUndertakings();
        const idx = all.findIndex((u) => u.id === utId);
        if (idx !== -1) {
            all[idx].status = "verified";
            all[idx].verifiedAt = new Date().toISOString();
            all[idx].verifiedByUid = userProfile?.uid || "aicte-ro-west";
            localStorage.setItem("aicte_undertakings_store", JSON.stringify(all));
            setUndertakings([...all]);
        }
    };
    const filtered = undertakings.filter((u) => {
        if (filter === "all")
            return true;
        return u.status === filter;
    });
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            National Compliance Monitoring Console
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Audit and verify post-approval statutory undertakings across all technical institutes
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
        {[
            { id: "all", label: "All Undertakings" },
            { id: "pending", label: "Awaiting Evidence" },
            { id: "submitted", label: "Submitted (Audit Required)" },
            { id: "verified", label: "Certified Compliant" },
        ].map((tab) => (<button key={tab.id} onClick={() => setFilter(tab.id)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filter === tab.id
                ? "bg-slate-900 text-white font-semibold shadow-xs"
                : "text-slate-600 hover:bg-slate-100"}`}>
            {tab.label}
          </button>))}
      </div>

      {/* Undertakings Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Institution & Application</th>
                <th className="py-3 px-4">Condition Mandate</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Regulatory Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((ut) => {
            const inst = dataService.getInstitutionById(ut.institutionId);
            return (<tr key={ut.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 truncate max-w-xs">
                        {inst?.institutionName || "Institute"}
                      </p>
                      <Link href={`/aicte/applications/${ut.applicationId}`} className="font-mono text-[11px] text-blue-600 hover:underline mt-0.5 block">
                        {ut.applicationId}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 max-w-md">
                      <p className="font-semibold text-slate-900">{ut.condition}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                        {ut.description}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${ut.status === "verified"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : ut.status === "submitted"
                        ? "bg-blue-50 text-blue-800 border border-blue-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${ut.status === "verified"
                    ? "bg-emerald-600"
                    : ut.status === "submitted"
                        ? "bg-blue-600"
                        : "bg-amber-600"}`}/>
                        {ut.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <SlaCountdown dueAt={ut.dueAt}/>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {ut.status === "verified" ? (<span className="text-emerald-700 text-xs font-medium flex items-center justify-end gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5"/> Certified
                        </span>) : (<Button size="sm" onClick={() => handleVerifyCondition(ut.id)} className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white">
                          <ShieldCheck className="h-3 w-3 mr-1 text-emerald-400"/>
                          Verify & Certify
                        </Button>)}
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>);
}
export default function ComplianceMonitoringPage() {
    return (<RequireRole roles={[...COMPLIANCE_ROLES]}>
      <ComplianceMonitoringContent />
    </RequireRole>);
}
