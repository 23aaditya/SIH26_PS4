"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService, API_BASE } from "@/lib/dataService";
import { APPLICATION_CATEGORY_LABELS, getApplicationCategoryLabel, ROLE_LABELS } from "@/lib/types";
import { StaffManagementModule } from "@/components/aicte/StaffManagementModule";
import {
  FileText,
  Clock,
  AlertTriangle,
  CalendarDays,
  Users,
  Search,
  ChevronRight,
  ShieldCheck,
  Building,
  Briefcase,
  Layers,
  Sparkles,
  Gavel,
  CheckCircle,
  Eye,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const AICTE_ROLES = [
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
  "super_admin",
  "aicte",
  "committee_member",
  "unit_head",
  "reviewing_officer",
  "read_only_auditor",
  "support_staff",
];

function AicteDashboardContent() {
  const { userProfile, switchWorkspace, activeWorkspace, dashboardModules } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function fetchMetrics() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/aicte/dashboard/metrics`, {
          headers: {
            "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
          },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted) setDashboardData(data);
        }
      } catch (err) {
        console.warn("Failed to fetch live AICTE dashboard metrics:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchMetrics();
    return () => { isMounted = false; };
  }, [userProfile]);

  const allApps = dataService.getApplications();
  const evcVisits = dataService.getEvcVisits();

  // Role detection
  const userRole = userProfile?.role || "scrutiny_committee";
  const platformRoles = userProfile?.platformRoles || [];
  const isScrutinyOfficer = userRole === "scrutiny_committee" || platformRoles.includes("SCRUTINY_OFFICER");
  const isEvcCoordinator = userRole === "evc_coordinator" || platformRoles.includes("EVC_COORDINATOR");
  const isCompetentAuthority = userRole === "competent_authority" || platformRoles.includes("COMPETENT_AUTHORITY");
  const isSuperAdmin = userRole === "super_admin" || userRole === "admin" || platformRoles.includes("SUPER_ADMIN");

  const liveKpis = dashboardData?.kpis;
  const totalActiveVal = liveKpis ? liveKpis.totalActive : allApps.filter((a) => a.status !== "approved" && a.status !== "rejected").length;
  const inScrutinyVal = liveKpis ? liveKpis.inScrutiny : allApps.filter((a) => a.currentStageId === "scrutiny").length;
  const clarificationVal = liveKpis ? liveKpis.awaitingInstitution : allApps.filter((a) => a.status === "awaiting_institution").length;
  const evcVal = liveKpis ? liveKpis.pendingEvc : allApps.filter((a) => a.status === "pending_evc").length;
  const committeeVal = liveKpis ? liveKpis.awaitingCommittee : allApps.filter((a) => a.status === "awaiting_committee").length;
  const overdueVal = liveKpis ? liveKpis.overdueCount : allApps.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < Date.now()).length;

  const activeModules = dashboardModules || [];
  const committees = userProfile?.committeeMemberships || [];
  const hasMultipleCommittees = committees.length > 1;

  const kpis = [
    {
      label: "Active In Queue",
      value: totalActiveVal.toString(),
      icon: FileText,
      color: "text-blue-700",
      bg: "bg-blue-50",
      href: "/aicte/applications",
    },
    {
      label: "Pending Scrutiny",
      value: inScrutinyVal.toString(),
      icon: Search,
      color: "text-amber-700",
      bg: "bg-amber-50",
      href: "/aicte/applications?stage=scrutiny",
    },
    {
      label: "Awaiting Institution",
      value: clarificationVal.toString(),
      icon: Clock,
      color: "text-orange-700",
      bg: "bg-orange-50",
      href: "/aicte/applications?status=awaiting_institution",
    },
    {
      label: "EVC Inspections",
      value: evcVal.toString(),
      icon: CalendarDays,
      color: "text-purple-700",
      bg: "bg-purple-50",
      href: "/aicte/evc",
    },
    {
      label: "Committee Review",
      value: committeeVal.toString(),
      icon: Users,
      color: "text-indigo-700",
      bg: "bg-indigo-50",
      href: "/aicte/applications?status=awaiting_committee",
    },
    {
      label: "SLA Overdue",
      value: overdueVal.toString(),
      icon: AlertTriangle,
      color: "text-rose-700",
      bg: "bg-rose-50",
      href: "/aicte/applications?filter=overdue",
      highlight: overdueVal > 0,
    },
  ];

  const stageDistribution = dashboardData?.stageDistribution || [
    { stage: "Scrutiny", count: inScrutinyVal, fill: "#3b82f6" },
    { stage: "Clarification", count: clarificationVal, fill: "#f59e0b" },
    { stage: "EVC Visit", count: evcVal, fill: "#8b5cf6" },
    { stage: "Committee", count: committeeVal, fill: "#6366f1" },
    { stage: "Approved", count: liveKpis ? liveKpis.approvedCount : allApps.filter((a) => a.status === "approved").length, fill: "#10b981" },
  ];

  const regionalMatrix = dashboardData?.regionalMatrix || [
    { region: "Western (Mumbai)", active: 4, scrutiny: 2, evc: 1, overdue: 0 },
    { region: "Northern (New Delhi)", active: 3, scrutiny: 1, evc: 1, overdue: 0 },
    { region: "Southern (Chennai)", active: 2, scrutiny: 0, evc: 0, overdue: 0 },
    { region: "Eastern (Kolkata)", active: 2, scrutiny: 1, evc: 1, overdue: 1 },
    { region: "South-West (Bengaluru)", active: 2, scrutiny: 0, evc: 0, overdue: 0 },
  ];

  const queueItems = (dashboardData?.roleSpecificQueue && dashboardData.roleSpecificQueue.length > 0)
    ? dashboardData.roleSpecificQueue
    : allApps.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* 1. Official Persona & Authority Header Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              {userProfile?.employeeCode ? `${userProfile.employeeCode} Official Console` : "Regulatory Console"}
            </span>

            {userProfile?.platformRoles?.map((r) => (
              <span
                key={r}
                className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full"
              >
                {r.replace(/_/g, " ")}
              </span>
            ))}

            <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
              Authenticated Session
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Welcome, {userProfile?.displayName || userProfile?.name || "Official"}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
            {userProfile?.designation && (
              <span className="flex items-center gap-1 text-slate-700 font-medium">
                <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                {userProfile.designation.title}
              </span>
            )}
            {userProfile?.organizationUnit && (
              <span className="flex items-center gap-1 text-slate-600">
                <Building className="h-3.5 w-3.5 text-slate-400" />
                {userProfile.organizationUnit.name}
              </span>
            )}
            {userProfile?.reportsTo && (
              <span className="text-slate-400">
                Reports To: <strong className="text-slate-600">{userProfile.reportsTo.name}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Workspace Switcher for Multi-Committee Members */}
        {hasMultipleCommittees && (
          <div className="flex flex-col items-start md:items-end gap-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
              <Layers className="h-3 w-3 text-indigo-600" /> Active Committee Workspace:
            </label>
            <select
              value={activeWorkspace || committees[0]?.committeeCode || ""}
              onChange={(e) => switchWorkspace(e.target.value)}
              className="h-8 text-xs font-semibold rounded-lg border border-slate-300 bg-white px-2.5 text-slate-800 focus:border-[#635bff] focus:ring-1 focus:ring-[#635bff]"
            >
              {committees.map((cm) => (
                <option key={cm.committeeCode} value={cm.committeeCode}>
                  {cm.committeeName} ({cm.committeeRole})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-400">
              Switches permissions & queue filters in real-time
            </span>
          </div>
        )}
      </div>

      {/* 2. Role-Specific Statutory Authority & Action Boundary Banner */}
      <div className={`p-4 rounded-xl border ${
        isScrutinyOfficer
          ? "bg-amber-50/50 border-amber-200"
          : isEvcCoordinator
          ? "bg-purple-50/50 border-purple-200"
          : isCompetentAuthority
          ? "bg-indigo-50/50 border-indigo-200"
          : "bg-slate-50/80 border-slate-200"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Statutory Role Powers & Workflow Boundaries
            </span>
            <h2 className="text-sm font-bold text-slate-900 mt-0.5">
              {isScrutinyOfficer && "Scrutiny Committee Evaluator — Statutory Dossier Review"}
              {isEvcCoordinator && "Expert Visit Committee (EVC) Coordinator — Inspection Administration"}
              {isCompetentAuthority && "Competent Authority — Quasi-Judicial Decisions & Final Regulatory Orders"}
              {isSuperAdmin && "Council Super Administrator — Executive Oversight & Roster Administration"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {isScrutinyOfficer && (
              <>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">Verify Documents</span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">AI Advisory Pre-Check</span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">Issue Deficiencies</span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">Endorse Scrutiny</span>
              </>
            )}
            {isEvcCoordinator && (
              <>
                <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium">Schedule EVC Visits</span>
                <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium">Assign Expert Panels</span>
                <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-medium">Review Geotagged Evidence</span>
              </>
            )}
            {isCompetentAuthority && (
              <>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">Quasi-Judicial Hearing (SHC)</span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">Appellate Authority (SAC)</span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-medium">Grant Approval / Reasoned Rejection</span>
              </>
            )}
            {isSuperAdmin && (
              <>
                <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-medium">Staff Management</span>
                <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-medium">Regional Workload Matrix</span>
                <span className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-medium">System Audit Logs</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 3. Super Admin Staff Management Console (Rendered for Super Admin / user_management module) */}
      {(isSuperAdmin || activeModules.includes("user_management")) && (
        <StaffManagementModule currentStaff={userProfile} />
      )}

      {/* 4. Scrutiny Committee Specific Desk */}
      {(isScrutinyOfficer || activeModules.includes("scrutiny")) && (
        <Card className="border border-amber-200 shadow-2xs bg-amber-50/20">
          <CardHeader className="p-4 border-b border-amber-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-amber-100 text-amber-700">
                <Search className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Scrutiny Committee Evaluation Desk
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Dossier review, land/infrastructure compliance validation, AI pre-check analysis, and deficiency issuance
                </CardDescription>
              </div>
            </div>
            <Link href="/aicte/applications?stage=scrutiny">
              <Button size="sm" className="h-7 text-xs bg-amber-700 hover:bg-amber-800 text-white font-medium">
                Open Scrutiny Queue ({inScrutinyVal})
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              As a Scrutiny Committee evaluator, you have statutory authority under Chapter I/II of APH 2024-2027 to verify land title deeds, structural safety NOCs, faculty cadre allocations, and trigger AI Scrutiny Assistant pre-checks.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 5. EVC Inspection Desk */}
      {(isEvcCoordinator || activeModules.includes("evc_tasks")) && (
        <Card className="border border-purple-200 shadow-2xs bg-purple-50/20">
          <CardHeader className="p-4 border-b border-purple-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-purple-100 text-purple-700">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Expert Visit Committee (EVC) Inspection Desk
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Physical and virtual campus inspections, laboratory equipment verification, and geotagged report submission
                </CardDescription>
              </div>
            </div>
            <Link href="/aicte/evc">
              <Button size="sm" className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white font-medium">
                Open EVC Console ({evcVal})
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              Schedule expert visits, assign subject matter experts, inspect campus facilities, and evaluate ground truth against uploaded architectural plans.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 6. Competent Decision Authority & SHC/SAC Desk */}
      {(isCompetentAuthority || activeModules.includes("shc_tasks") || activeModules.includes("sac_tasks")) && (
        <Card className="border border-indigo-200 shadow-2xs bg-indigo-50/20">
          <CardHeader className="p-4 border-b border-indigo-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-100 text-indigo-700">
                <Gavel className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Competent Regulatory Authority & Hearing Docket
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Quasi-judicial personal hearings for contested applications and final Executive Committee statutory orders
                </CardDescription>
              </div>
            </div>
            <Link href="/aicte/applications?status=awaiting_committee">
              <Button size="sm" className="h-7 text-xs bg-indigo-700 hover:bg-indigo-800 text-white font-medium">
                Open Decision Docket ({committeeVal})
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              Authorized to conduct formal personal hearings, evaluate institutional representations against scrutiny deficiencies, and issue final Letters of Approval (LoA) or Reasoned Rejections.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 7. KPI Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href}>
              <Card
                className={`border border-slate-200/90 shadow-2xs hover:shadow-xs transition bg-white p-3.5 cursor-pointer ${
                  kpi.highlight ? "border-rose-300 ring-1 ring-rose-200" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                    {kpi.label}
                  </span>
                  <div className={`flex h-6 w-6 items-center justify-center rounded ${kpi.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                  {kpi.value}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* 8. Stage Distribution & Regional Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Distribution Chart */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">
                Application Distribution by Workflow Stage
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Active workflow pipeline across all regulatory stages
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stageDistribution}
                  layout="vertical"
                  margin={{ left: 10, right: 20, top: 10, bottom: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="stage"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#475569" }}
                    width={85}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "none",
                      borderRadius: "6px",
                      color: "#fff",
                      fontSize: "11px",
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {stageDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Regional Pendency Table */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900">
                Regional Pendency Matrix
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Workload and overdue tracking across AICTE Regional Offices
              </CardDescription>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Regional Office</th>
                  <th className="py-2.5 px-3 text-center">Active</th>
                  <th className="py-2.5 px-3 text-center">In Scrutiny</th>
                  <th className="py-2.5 px-3 text-center">EVC</th>
                  <th className="py-2.5 px-3 text-right">Overdue SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {regionalMatrix.map((r) => (
                  <tr key={r.regionId || r.region} className="hover:bg-slate-50/60 transition">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{r.region}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-slate-700">{r.active}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-amber-700">{r.scrutiny}</td>
                    <td className="py-2.5 px-3 text-center font-medium text-purple-700">{r.evc}</td>
                    <td className="py-2.5 px-3 text-right">
                      {r.overdue > 0 ? (
                        <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {r.overdue} breached
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 9. Active Official Work Queue Table (Tailored to Role) */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">
              {isScrutinyOfficer && "Assigned Scrutiny Cases & AI Pre-Check Queue"}
              {isEvcCoordinator && "Pending EVC Campus Inspection Queue"}
              {isCompetentAuthority && "Executive Decision & Hearing Docket"}
              {isSuperAdmin && "Active Council Regulatory Work Queue"}
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              {isScrutinyOfficer && "Cases requiring scrutiny document verification, AI advisory report review, or deficiency flagging"}
              {isEvcCoordinator && "Applications pending on-site physical/virtual inspection and expert panel assignment"}
              {isCompetentAuthority && "Applications scheduled for personal hearing or final statutory decision issuance"}
              {isSuperAdmin && "All active applications requiring regulatory processing across regional offices"}
            </p>
          </div>
          <Link href="/aicte/applications">
            <Button variant="ghost" size="sm" className="text-xs text-blue-600">
              Full Queue Table <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </Button>
          </Link>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Application ID</th>
                <th className="py-3 px-4">Institution Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Current Stage</th>
                <th className="py-3 px-4">Workflow Status</th>
                <th className="py-3 px-4">SLA Deadline</th>
                <th className="py-3 px-4 text-right">Authorized Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queueItems.map((app) => {
                const instName = app.institution?.institutionName || app.formData?.institution_name || "Technical Institute";
                const regionLabel = app.region?.name || app.regionId || "National";
                return (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <Link href={`/aicte/applications/${app.id}`} className="hover:underline text-blue-600">
                        {app.applicationNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 truncate max-w-xs">
                        {instName}
                      </p>
                      <p className="text-[11px] text-slate-400 capitalize">{regionLabel}</p>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {getApplicationCategoryLabel(app.applicationCategory)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {app.currentStageName || app.currentStageId}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="py-3 px-4">
                      <SlaCountdown dueAt={app.dueAt} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/aicte/applications/${app.id}`}>
                        <Button
                          size="sm"
                          className={`h-7 text-xs text-white font-medium ${
                            isScrutinyOfficer
                              ? "bg-amber-700 hover:bg-amber-800"
                              : isEvcCoordinator
                              ? "bg-purple-700 hover:bg-purple-800"
                              : isCompetentAuthority
                              ? "bg-indigo-700 hover:bg-indigo-800"
                              : "bg-slate-900 hover:bg-slate-800"
                          }`}
                        >
                          {isScrutinyOfficer && "Inspect Scrutiny Dossier"}
                          {isEvcCoordinator && "Review EVC Inspection"}
                          {isCompetentAuthority && "Decision Docket"}
                          {isSuperAdmin && "Review Case"}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function AicteDashboardPage() {
  return (
    <RequireRole roles={[...AICTE_ROLES]}>
      <AicteDashboardContent />
    </RequireRole>
  );
}
