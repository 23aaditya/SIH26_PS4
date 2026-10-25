"use client";
import React from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORY_LABELS } from "@/lib/types";
import { FileText, Clock, AlertTriangle, CheckCircle2, Plus, ArrowRight, CalendarClock, FolderLock, ChevronRight, } from "lucide-react";
function InstitutionDashboardContent() {
    const { userProfile } = useAuth();
    const institution = dataService.getInstitutionById(userProfile?.institutionId || "inst-001");
    const allApps = dataService.getApplications({ institutionId: institution?.id });
    const inProgressApps = allApps.filter((a) => a.status === "in_review" || a.status === "pending_evc" || a.status === "awaiting_committee");
    const actionRequiredApps = allApps.filter((a) => a.status === "awaiting_institution");
    const approvedApps = allApps.filter((a) => a.status === "approved");
    const undertakings = dataService.getUndertakings(institution?.id);
    const pendingUndertakings = undertakings.filter((u) => u.status === "pending" || u.status === "submitted");
    const allDocs = dataService.getDocuments(undefined, institution?.id);
    const expiringDocs = allDocs.filter((d) => d.expiryDate && new Date(d.expiryDate).getTime() - Date.now() < 30 * 24 * 3600 * 1000);
    const stats = [
        {
            label: "Total Applications",
            value: allApps.length.toString(),
            icon: FileText,
            color: "text-blue-700",
            bg: "bg-blue-50/80",
            subtext: "AY 2026-27 cycle",
        },
        {
            label: "In Review / Evaluation",
            value: inProgressApps.length.toString(),
            icon: Clock,
            color: "text-amber-700",
            bg: "bg-amber-50/80",
            subtext: "At AICTE scrutiny / EVC",
        },
        {
            label: "Action Required",
            value: actionRequiredApps.length.toString(),
            icon: AlertTriangle,
            color: "text-rose-700",
            bg: "bg-rose-50/80",
            subtext: actionRequiredApps.length > 0 ? "Deficiency response due" : "All cleared",
            highlight: actionRequiredApps.length > 0,
        },
        {
            label: "Approved Orders",
            value: approvedApps.length.toString(),
            icon: CheckCircle2,
            color: "text-emerald-700",
            bg: "bg-emerald-50/80",
            subtext: "Official orders issued",
        },
    ];
    return (<div className="space-y-6">
      {/* Institution Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              PID: {institution?.institutionCode || "1-482910381"}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">Western Region (Mumbai)</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            {institution?.institutionName || "Pune Institute of Computer Technology"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            AICTE Regulatory Portal — AY 2026-27 Approval Automation & Compliance Hub
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/institution/compliance">
            <Button variant="outline" size="sm" className="text-xs">
              <CalendarClock className="h-3.5 w-3.5 text-slate-600"/>
              Compliance Tasks ({pendingUndertakings.length})
            </Button>
          </Link>
          <Link href="/institution/applications/new">
            <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs">
              <Plus className="h-3.5 w-3.5"/>
              New Application
            </Button>
          </Link>
        </div>
      </div>

      {/* Action Required Alert Banner if deficiencies exist */}
      {actionRequiredApps.length > 0 && (<div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5"/>
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-amber-900">
                Immediate Action Required: Deficiency Letters Issued
              </h3>
              <p className="mt-0.5 text-xs text-amber-700">
                AICTE Scrutiny has flagged items on {actionRequiredApps.length} application(s). Please review and upload clarification documents before the stipulated deadline.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {actionRequiredApps.map((app) => (<Link key={app.id} href={`/institution/applications/${app.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-white px-2.5 py-1 rounded border border-amber-300 hover:bg-amber-100 transition shadow-2xs">
                    Resolve {app.applicationNumber} ({APPLICATION_CATEGORY_LABELS[app.applicationCategory]})
                    <ArrowRight className="h-3 w-3"/>
                  </Link>))}
              </div>
            </div>
          </div>
        </div>)}

      {/* Restrained Stripe-like KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
            const Icon = stat.icon;
            return (<Card key={stat.label} className={`border border-slate-200/90 shadow-2xs hover:shadow-xs transition bg-white ${stat.highlight ? "border-amber-300 ring-1 ring-amber-200" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {stat.label}
                  </span>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`}/>
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {stat.value}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 truncate">{stat.subtext}</p>
              </CardContent>
            </Card>);
        })}
      </div>

      {/* Applications in Progress Table (Stripe Style) */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">
              Applications in Progress
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Live status, assigned stage and regulatory deadlines for current academic cycle
            </p>
          </div>
          <Link href="/institution/applications">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600 hover:text-blue-700">
              View All ({allApps.length}) <ChevronRight className="h-3.5 w-3.5 ml-0.5"/>
            </Button>
          </Link>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Application No</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Current Stage</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">SLA / Deadline</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allApps.map((app) => (<tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                    <Link href={`/institution/applications/${app.id}`} className="hover:underline text-blue-600 flex items-center gap-1">
                      {app.applicationNumber}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium">
                    {APPLICATION_CATEGORY_LABELS[app.applicationCategory]}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <span className="font-medium text-slate-900">{app.currentStageName}</span>
                    <p className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                      {app.nextActionDescription}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={app.status}/>
                  </td>
                  <td className="py-3 px-4">
                    <SlaCountdown dueAt={app.dueAt}/>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link href={`/institution/applications/${app.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                        Details
                      </Button>
                    </Link>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Two Column Layout: Compliance Deadlines & Document Expiry Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Compliance and Undertakings */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600"/>
                Upcoming Compliance Deadlines
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Statutory undertakings and conditions tied to your approvals
              </p>
            </div>
            <Link href="/institution/compliance">
              <Button variant="ghost" size="sm" className="text-xs text-blue-600">
                Manage
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {undertakings.map((ut) => (<div key={ut.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {ut.condition}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${ut.status === "submitted"
                ? "bg-blue-100 text-blue-800"
                : ut.status === "verified"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"}`}>
                      {ut.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                    {ut.description}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                    <span>Due: {new Date(ut.dueAt).toLocaleDateString("en-IN")}</span>
                    <span>•</span>
                    <SlaCountdown dueAt={ut.dueAt}/>
                  </div>
                </div>
              </div>))}
          </CardContent>
        </Card>

        {/* Document Validity Watch */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FolderLock className="h-4 w-4 text-purple-600"/>
                Document Expiry & Audit Watch
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Statutory certificates requiring periodic renewal
              </p>
            </div>
            <Link href="/institution/documents">
              <Button variant="ghost" size="sm" className="text-xs text-blue-600">
                Document Vault
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {allDocs.slice(0, 4).map((doc) => {
            const isExpiringSoon = doc.expiryDate && new Date(doc.expiryDate).getTime() - Date.now() < 30 * 24 * 3600 * 1000;
            return (<div key={doc.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-900 truncate">
                      {doc.documentType}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {doc.originalFilename}
                    </p>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    {doc.expiryDate ? (<span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isExpiringSoon
                        ? "bg-rose-100 text-rose-800"
                        : "bg-emerald-100 text-emerald-800"}`}>
                        Exp: {new Date(doc.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                      </span>) : (<span className="text-[10px] text-slate-400">Permanent</span>)}
                  </div>
                </div>);
        })}
          </CardContent>
        </Card>
      </div>
    </div>);
}
export default function InstitutionDashboardPage() {
    return (<RequireRole roles={["institution"]}>
      <InstitutionDashboardContent />
    </RequireRole>);
}
