"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORY_LABELS, ROLE_LABELS } from "@/lib/types";
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
  const allApps = dataService.getApplications();
  const evcVisits = dataService.getEvcVisits();

  const scrutinyApps = allApps.filter((a) => a.currentStageId === "scrutiny");
  const clarificationApps = allApps.filter((a) => a.status === "awaiting_institution");
  const evcApps = allApps.filter((a) => a.status === "pending_evc");
  const committeeApps = allApps.filter((a) => a.status === "awaiting_committee");
  const overdueApps = allApps.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < Date.now());

  // Modules resolved dynamically
  const activeModules = dashboardModules || [];
  const committees = userProfile?.committeeMemberships || [];
  const hasMultipleCommittees = committees.length > 1;

  const kpis = [
    {
      label: "Active In Queue",
      value: allApps.filter((a) => a.status !== "approved" && a.status !== "rejected").length.toString(),
      icon: FileText,
      color: "text-blue-700",
      bg: "bg-blue-50",
      href: "/aicte/applications",
    },
    {
      label: "Pending Scrutiny",
      value: scrutinyApps.length.toString(),
      icon: Search,
      color: "text-amber-700",
      bg: "bg-amber-50",
      href: "/aicte/applications?stage=scrutiny",
    },
    {
      label: "Awaiting Institution",
      value: clarificationApps.length.toString(),
      icon: Clock,
      color: "text-orange-700",
      bg: "bg-orange-50",
      href: "/aicte/applications?status=awaiting_institution",
    },
    {
      label: "EVC Inspections",
      value: evcVisits.length.toString(),
      icon: CalendarDays,
      color: "text-purple-700",
      bg: "bg-purple-50",
      href: "/aicte/evc",
    },
    {
      label: "Committee Review",
      value: committeeApps.length.toString(),
      icon: Users,
      color: "text-indigo-700",
      bg: "bg-indigo-50",
      href: "/aicte/applications?status=awaiting_committee",
    },
    {
      label: "SLA Overdue",
      value: overdueApps.length.toString(),
      icon: AlertTriangle,
      color: "text-rose-700",
      bg: "bg-rose-50",
      href: "/aicte/applications?filter=overdue",
      highlight: overdueApps.length > 0,
    },
  ];

  const stageDistribution = [
    { stage: "Scrutiny", count: scrutinyApps.length, fill: "#3b82f6" },
    { stage: "Clarification", count: clarificationApps.length, fill: "#f59e0b" },
    { stage: "EVC Visit", count: evcApps.length, fill: "#8b5cf6" },
    { stage: "Committee", count: committeeApps.length, fill: "#6366f1" },
    { stage: "Approved", count: allApps.filter((a) => a.status === "approved").length, fill: "#10b981" },
  ];

  const regionalMatrix = [
    { region: "Western (Mumbai)", active: 4, scrutiny: 2, evc: 1, overdue: 0 },
    { region: "Northern (New Delhi)", active: 3, scrutiny: 1, evc: 1, overdue: 0 },
    { region: "Southern (Chennai)", active: 2, scrutiny: 0, evc: 0, overdue: 0 },
    { region: "Eastern (Kolkata)", active: 2, scrutiny: 1, evc: 1, overdue: 1 },
    { region: "South-West (Bengaluru)", active: 2, scrutiny: 0, evc: 0, overdue: 0 },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Official Persona & Authority Header Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#00d4ff]" />
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

      {/* 2. Super Admin Staff Management Console (Rendered if 'user_management' module active) */}
      {activeModules.includes("user_management") && (
        <StaffManagementModule currentStaff={userProfile} />
      )}

      {/* 3. Scrutiny Committee Specific Desk (If user is in Scrutiny Committee or has scrutiny module) */}
      {activeModules.includes("scrutiny") && (
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
                  Dossier review, land/infrastructure compliance validation, and deficiency issuance
                </CardDescription>
              </div>
            </div>
            <Link href="/aicte/applications?stage=scrutiny">
              <Button size="sm" className="h-7 text-xs bg-amber-700 hover:bg-amber-800 text-white">
                View Scrutiny Queue ({scrutinyApps.length})
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              As a Scrutiny Committee evaluator, you have statutory authority to verify affidavits, structural stability NOCs, and program-wise faculty readiness.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4. EVC Inspection Desk (If user has evc_tasks module) */}
      {activeModules.includes("evc_tasks") && (
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
                  Physical and virtual campus inspections, lab verification, and geotagged report submission
                </CardDescription>
              </div>
            </div>
            <Link href="/aicte/evc">
              <Button size="sm" className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white">
                Open EVC Console ({evcVisits.length})
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              Schedule expert visits, assign domain experts, inspect facilities, and record formal EVC reports for AICTE approval consideration.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 5. Standing Hearing Committee (SHC) Desk (If user has shc_tasks module) */}
      {activeModules.includes("shc_tasks") && (
        <Card className="border border-indigo-200 shadow-2xs bg-indigo-50/20">
          <CardHeader className="p-4 border-b border-indigo-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-indigo-100 text-indigo-700">
                <Gavel className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Standing Hearing Committee (SHC) Hearing Docket
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Quasi-judicial personal hearings for non-compliant or contested institutional applications
                </CardDescription>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
              Docket DEMO-SHC-QUEUE-01
            </span>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              Conduct scheduled personal hearings, evaluate institutional representations, and recommend approvals or reasoned rejections.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 6. Standing Appellate Committee (SAC) Desk (If user has sac_tasks module) */}
      {activeModules.includes("sac_tasks") && (
        <Card className="border border-rose-200 shadow-2xs bg-rose-50/20">
          <CardHeader className="p-4 border-b border-rose-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-rose-100 text-rose-700">
                <Gavel className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Standing Appellate Committee (SAC) Appeals Docket
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Appellate jurisdiction over SHC orders headed by retired High Court Judges and senior academics
                </CardDescription>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
              Docket DEMO-SAC-QUEUE-01
            </span>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              Decide on statutory appeals filed by rejected institutions. Decisions are reported directly to the Executive Committee and Council.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 7. Standing Complaints & Special Committee (SCSC) Desk */}
      {activeModules.includes("scsc_tasks") && (
        <Card className="border border-teal-200 shadow-2xs bg-teal-50/20">
          <CardHeader className="p-4 border-b border-teal-100 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-teal-100 text-teal-700">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Standing Complaint & Special Committee (SCSC) Docket
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Vigilance complaints, whistleblower notices, and statutory compliance investigations
                </CardDescription>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
              Docket DEMO-SCSC-QUEUE-01
            </span>
          </CardHeader>
          <CardContent className="p-4 text-xs text-slate-600">
            <p>
              Investigate grievances, assess ground-truth evidence, and recommend regulatory punitive measures or clearance.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 8. KPI Metrics Row */}
      {activeModules.includes("applications") && (
        <>
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

          {/* 2-Column: Stage Distribution & Regional Pendency Breakdown */}
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
                      <tr key={r.region} className="hover:bg-slate-50/60 transition">
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

          {/* Work Queue Table */}
          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Active Official Work Queue
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Applications requiring regulatory review, scrutiny endorsement, or committee decision
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
                    <th className="py-3 px-4 text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allApps.slice(0, 5).map((app) => {
                    const inst = dataService.getInstitutionById(app.institutionId);
                    return (
                      <tr key={app.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <Link href={`/aicte/applications/${app.id}`} className="hover:underline text-blue-600">
                            {app.applicationNumber}
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 truncate max-w-xs">
                            {inst?.institutionName || "Technical College"}
                          </p>
                          <p className="text-[11px] text-slate-400 capitalize">{app.regionId} Region</p>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {APPLICATION_CATEGORY_LABELS[app.applicationCategory]}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {app.currentStageName}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={app.status} />
                        </td>
                        <td className="py-3 px-4">
                          <SlaCountdown dueAt={app.dueAt} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link href={`/aicte/applications/${app.id}`}>
                            <Button size="sm" className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium">
                              Review Case
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
        </>
      )}
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
