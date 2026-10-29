"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { getApplicationCategoryLabel } from "@/lib/types";
import {
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ArrowRight,
  CalendarClock,
  FolderLock,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function InstitutionDashboardContent() {
  const { userProfile } = useAuth();
  const [apps, setApps] = useState([]);
  const [undertakings, setUndertakings] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = React.useCallback(async (signal) => {
    const authUid = userProfile?.id || userProfile?.uid || userProfile?.email;
    if (!authUid) {
      setApps([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [appsRes, utRes, docsRes] = await Promise.all([
        fetch(`${API_BASE}/applications/my`, {
          headers: { "x-user-id": authUid },
          credentials: "include",
          signal,
        }),
        fetch(`${API_BASE}/undertakings`, {
          headers: { "x-user-id": authUid },
          credentials: "include",
          signal,
        }).catch(() => null),
        fetch(`${API_BASE}/documents`, {
          headers: { "x-user-id": authUid },
          credentials: "include",
          signal,
        }).catch(() => null),
      ]);

      if (!appsRes.ok) {
        const errJson = await appsRes.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${appsRes.status}: Failed to fetch applications.`);
      }

      const appsData = await appsRes.json();
      const utData = utRes && utRes.ok ? await utRes.json() : null;
      const docsData = docsRes && docsRes.ok ? await docsRes.json() : null;

      if (!signal?.aborted) {
        setApps(Array.isArray(appsData) ? appsData : []);
        setUndertakings(
          Array.isArray(utData) ? utData : dataService.getUndertakings(userProfile?.institutionId)
        );
        setDocs(
          Array.isArray(docsData)
            ? docsData
            : dataService.getDocuments(undefined, userProfile?.institutionId)
        );
        setError(null);
      }
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) return;
      console.warn("Institution dashboard fetch error:", err);
      setError(err.message || "Failed to load dashboard data from server.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [userProfile?.id, userProfile?.uid, userProfile?.email, userProfile?.institutionId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchDashboardData]);

  // Scoped metrics derived from authenticated institution's actual records
  const inProgressApps = apps.filter((a) =>
    ["in_review", "pending_evc", "awaiting_committee", "submitted"].includes(a.status)
  );
  const actionRequiredApps = apps.filter((a) =>
    ["awaiting_institution", "deficiency_raised"].includes(a.status)
  );
  const approvedApps = apps.filter((a) => a.status === "approved");

  const pendingUndertakings = undertakings.filter(
    (u) => u.status === "pending" || u.status === "submitted"
  );

  const institutionName =
    userProfile?.institutionName ||
    userProfile?.institution?.institutionName ||
    apps[0]?.institution?.institutionName ||
    "Pune Institute of Computer Technology";

  const institutionCode =
    userProfile?.institutionCode ||
    userProfile?.institution?.institutionCode ||
    apps[0]?.institution?.institutionCode ||
    "1-482910381";

  const stats = [
    {
      label: "Total Applications",
      value: loading ? "..." : apps.length.toString(),
      icon: FileText,
      color: "text-blue-700",
      bg: "bg-blue-50/80",
      subtext: "AY 2026-27 cycle",
    },
    {
      label: "In Review / Evaluation",
      value: loading ? "..." : inProgressApps.length.toString(),
      icon: Clock,
      color: "text-amber-700",
      bg: "bg-amber-50/80",
      subtext: "At AICTE scrutiny / EVC",
    },
    {
      label: "Action Required",
      value: loading ? "..." : actionRequiredApps.length.toString(),
      icon: AlertTriangle,
      color: "text-rose-700",
      bg: "bg-rose-50/80",
      subtext: actionRequiredApps.length > 0 ? "Deficiency response due" : "All cleared",
      highlight: actionRequiredApps.length > 0,
    },
    {
      label: "Approved Orders",
      value: loading ? "..." : approvedApps.length.toString(),
      icon: CheckCircle2,
      color: "text-emerald-700",
      bg: "bg-emerald-50/80",
      subtext: "Official orders issued",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Institution Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              PID: {institutionCode}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">Western Region (Mumbai)</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            {institutionName}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            AICTE Regulatory Portal — AY 2026-27 Approval Automation & Compliance Hub
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/institution/compliance">
            <Button variant="outline" size="sm" className="text-xs">
              <CalendarClock className="h-3.5 w-3.5 text-slate-600" />
              Compliance Tasks ({pendingUndertakings.length})
            </Button>
          </Link>
          <Link href="/institution/applications/new">
            <Button size="sm" className="text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs">
              <Plus className="h-3.5 w-3.5" />
              New Application
            </Button>
          </Link>
        </div>
      </div>

      {/* Error state banner */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>
              <strong>Server Communication Notice:</strong> {error}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchDashboardData()}
            className="text-xs border-rose-300 text-rose-800 hover:bg-rose-100 h-7"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Action Required Alert Banner if deficiencies exist */}
      {!loading && actionRequiredApps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-xs font-semibold text-amber-900">
                Immediate Action Required: Deficiency Letters Issued
              </h3>
              <p className="mt-0.5 text-xs text-amber-700">
                AICTE Scrutiny has flagged items on {actionRequiredApps.length} application(s). Please review and upload clarification documents before the stipulated deadline.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {actionRequiredApps.map((app) => (
                  <Link
                    key={app.id}
                    href={`/institution/applications/${app.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900 bg-white px-2.5 py-1 rounded border border-amber-300 hover:bg-amber-100 transition shadow-2xs"
                  >
                    Resolve {app.applicationNumber} ({getApplicationCategoryLabel(app?.applicationCategory)})
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className={`border border-slate-200/90 shadow-2xs hover:shadow-xs transition bg-white ${
                stat.highlight ? "border-amber-300 ring-1 ring-amber-200" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {stat.label}
                  </span>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-md ${stat.bg}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight text-slate-900">
                    {stat.value}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 truncate">{stat.subtext}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Applications Table */}
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
              View All ({loading ? "..." : apps.length}) <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Loader2 className="h-5 w-5 text-blue-600 animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium">Synchronizing application data...</p>
                  </td>
                </tr>
              ) : apps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <FileText className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-700">No applications on file</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Click &ldquo;New Application&rdquo; to begin a statutory approval request
                    </p>
                  </td>
                </tr>
              ) : (
                apps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      <Link
                        href={`/institution/applications/${app.id}`}
                        className="hover:underline text-blue-600 flex items-center gap-1"
                      >
                        {app.applicationNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {getApplicationCategoryLabel(app?.applicationCategory)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-medium text-slate-900">
                        {app.currentStageName || "Scrutiny Verification"}
                      </span>
                      <p className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                        {app.nextActionDescription || "Under processing"}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="py-3 px-4">
                      <SlaCountdown dueAt={app.dueAt} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/institution/applications/${app.id}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                          Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
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
                <CalendarClock className="h-4 w-4 text-blue-600" />
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
            {undertakings.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No pending statutory undertakings</p>
            ) : (
              undertakings.map((ut) => (
                <div
                  key={ut.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {ut.condition}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          ut.status === "submitted"
                            ? "bg-blue-100 text-blue-800"
                            : ut.status === "verified"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ut.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                      {ut.description}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                      <span>Due: {new Date(ut.dueAt).toLocaleDateString("en-IN")}</span>
                      <span>•</span>
                      <SlaCountdown dueAt={ut.dueAt} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Document Validity Watch */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FolderLock className="h-4 w-4 text-purple-600" />
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
            {docs.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No documents in vault</p>
            ) : (
              docs.slice(0, 4).map((doc) => {
                const isExpiringSoon =
                  doc.expiryDate &&
                  new Date(doc.expiryDate).getTime() - Date.now() < 30 * 24 * 3600 * 1000;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {doc.documentType}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {doc.originalFilename}
                      </p>
                    </div>
                    <div className="text-right shrink-0 pl-3">
                      {doc.expiryDate ? (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            isExpiringSoon
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          Exp: {new Date(doc.expiryDate).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Permanent</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function InstitutionDashboardPage() {
  return (
    <RequireRole roles={["institution"]}>
      <InstitutionDashboardContent />
    </RequireRole>
  );
}
