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
import {
  FileText,
  Clock,
  AlertTriangle,
  CalendarDays,
  Users,
  CheckCircle2,
  Search,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  Filter,
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
] as const;

function AicteDashboardContent() {
  const { userProfile } = useAuth();
  const allApps = dataService.getApplications();
  const evcVisits = dataService.getEvcVisits();

  const scrutinyApps = allApps.filter((a) => a.currentStageId === "scrutiny");
  const clarificationApps = allApps.filter((a) => a.status === "awaiting_institution");
  const evcApps = allApps.filter((a) => a.status === "pending_evc");
  const committeeApps = allApps.filter((a) => a.status === "awaiting_committee");
  const overdueApps = allApps.filter((a) => a.dueAt && new Date(a.dueAt).getTime() < Date.now());

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

  // Stage Distribution Chart Data
  const stageDistribution = [
    { stage: "Scrutiny", count: scrutinyApps.length, fill: "#3b82f6" },
    { stage: "Clarification", count: clarificationApps.length, fill: "#f59e0b" },
    { stage: "EVC Visit", count: evcApps.length, fill: "#8b5cf6" },
    { stage: "Committee", count: committeeApps.length, fill: "#6366f1" },
    { stage: "Approved", count: allApps.filter((a) => a.status === "approved").length, fill: "#10b981" },
  ];

  // Regional Pendency Matrix
  const regionalMatrix = [
    { region: "Western (Mumbai)", active: 4, scrutiny: 2, evc: 1, overdue: 0 },
    { region: "Northern (New Delhi)", active: 3, scrutiny: 1, evc: 1, overdue: 0 },
    { region: "Southern (Chennai)", active: 2, scrutiny: 0, evc: 0, overdue: 0 },
    { region: "Eastern (Kolkata)", active: 2, scrutiny: 1, evc: 1, overdue: 1 },
    { region: "South-West (Bengaluru)", active: 2, scrutiny: 0, evc: 0, overdue: 0 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Regulatory Operations Console
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-blue-700 font-medium">AY 2026-27 Approval Window</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            AICTE Official Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Logged in as <strong>{userProfile?.displayName}</strong> ({userProfile ? ROLE_LABELS[userProfile.role] : "Official"})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/aicte/applications">
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white text-xs shadow-xs">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Open Application Queue
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Row (Restrained Stripe-inspired Metric Cards) */}
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
                <BarChart data={stageDistribution} layout="vertical" margin={{ left: 10, right: 20, top: 10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#475569" }} width={85} />
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

        {/* Regional Pendency Information Table */}
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

      {/* Main Searchable Work Queue Table (Jira / Stripe style) */}
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
                      <Link
                        href={`/aicte/applications/${app.id}`}
                        className="hover:underline text-blue-600"
                      >
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
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium"
                        >
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
