"use client";
import React from "react";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, } from "recharts";
import { Download } from "lucide-react";
const AICTE_ROLES = ["regional_officer", "bureau_officer", "competent_authority", "admin"];
function ReportsContent() {
    const turnaroundData = [
        { stage: "Regional Scrutiny", target: 7, actual: 4.8 },
        { stage: "Deficiency Resolution", target: 10, actual: 8.2 },
        { stage: "EVC Inspection", target: 14, actual: 9.6 },
        { stage: "Hearing Committee", target: 7, actual: 5.1 },
        { stage: "Executive Decision", target: 3, actual: 2.0 },
    ];
    const regionalVelocityData = [
        { region: "Western", applications: 48, approved: 42, rejected: 6 },
        { region: "Northern", applications: 39, approved: 34, rejected: 5 },
        { region: "Southern", applications: 54, approved: 50, rejected: 4 },
        { region: "Eastern", applications: 28, approved: 23, rejected: 5 },
        { region: "South-West", applications: 44, approved: 41, rejected: 3 },
    ];
    const outcomeDistribution = [
        { name: "Approved / Extended", value: 190, fill: "#10b981" },
        { name: "Returned (Under Rectification)", value: 23, fill: "#f59e0b" },
        { name: "Summary Rejected", value: 15, fill: "#f43f5e" },
    ];
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Operational Analytics & Approval Cycle Velocity
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Citizens Charter SLA compliance, turnaround metrics, and regional operational throughput
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => alert("Exporting AY 2026-27 Executive Analytics Report (CSV/PDF)")} className="text-xs">
          <Download className="h-3.5 w-3.5 mr-1 text-slate-500"/> Export Comprehensive Dossier
        </Button>
      </div>

      {/* Top 3 High-Impact Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-slate-200/90 shadow-2xs bg-white p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Average End-to-End Processing Cycle
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">29.7 Days</span>
            <span className="text-xs font-semibold text-emerald-600">
              ↓ 14% vs AY 2025-26
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">SLA Target: 45 calendar days</p>
        </Card>

        <Card className="border border-slate-200/90 shadow-2xs bg-white p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Citizens Charter SLA Adherence
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">96.4%</span>
            <span className="text-xs font-semibold text-emerald-600">Tier-1 Rating</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Zero Level-3 Escalation defaults</p>
        </Card>

        <Card className="border border-slate-200/90 shadow-2xs bg-white p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            First-Time Approval Ratio
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">83.2%</span>
            <span className="text-xs font-semibold text-blue-600">Without deficiency return</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Attributed to APH auto-validation wizard</p>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Turnaround Time vs Target */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Stage Turnaround Time vs Statutory Charter (Days)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Green represents actual days taken; slate outline indicates maximum permissible limit
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={turnaroundData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }}/>
                  <YAxis tick={{ fontSize: 10 }}/>
                  <Tooltip contentStyle={{
            backgroundColor: "#0f172a",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            fontSize: "11px",
        }}/>
                  <Bar dataKey="actual" name="Actual Days" fill="#2563eb" radius={[4, 4, 0, 0]}/>
                  <Bar dataKey="target" name="Charter Limit" fill="#cbd5e1" radius={[4, 4, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Regional Throughput */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Regional Approvals vs Non-Compliant Rejections
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Total applications evaluated by regional offices in current cycle
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionalVelocityData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <XAxis dataKey="region" tick={{ fontSize: 10 }}/>
                  <YAxis tick={{ fontSize: 10 }}/>
                  <Tooltip contentStyle={{
            backgroundColor: "#0f172a",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            fontSize: "11px",
        }}/>
                  <Bar dataKey="approved" name="Approved" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]}/>
                  <Bar dataKey="rejected" name="Rejected" fill="#f43f5e" stackId="a" radius={[4, 4, 0, 0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
}
export default function ReportsPage() {
    return (<RequireRole roles={[...AICTE_ROLES]}>
      <ReportsContent />
    </RequireRole>);
}
