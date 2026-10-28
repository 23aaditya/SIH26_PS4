"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/dataService";
import { DelegationModal } from "@/components/aicte/DelegationModal";
import {
  Network,
  Users,
  ShieldCheck,
  Building,
  Briefcase,
  ChevronDown,
  ChevronUp,
  ArrowDown,
  UserCheck,
  Clock,
  AlertTriangle,
  Mail,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";

const AICTE_ROLES = [
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
  "super_admin",
  "aicte",
  "reviewing_officer",
  "unit_head",
];

function WorkTreeContent() {
  const { userProfile } = useAuth();
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedColleague, setSelectedColleague] = useState(null);
  const [isDelegationOpen, setIsDelegationOpen] = useState(false);

  useEffect(() => {
    async function fetchWorkTree() {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API_BASE}/aicte/work-tree`, {
          headers: {
            "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
          },
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to load official hierarchy work tree.");
        }
        const data = await res.json();
        setTreeData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchWorkTree();
  }, [userProfile]);

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
        <p className="text-sm font-bold text-slate-800">Resolving statutory work tree...</p>
        <p className="text-xs text-slate-400">Tracing organizational reporting relationships and bureau roster</p>
      </div>
    );
  }

  if (error || !treeData) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-3 max-w-lg mx-auto shadow-2xs">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
        <p className="text-sm font-bold text-slate-900">Unable to load work tree</p>
        <p className="text-xs text-slate-500">{error || "Data unavailable"}</p>
        <Button size="sm" onClick={() => window.location.reload()} className="mt-2 text-xs">
          Retry
        </Button>
      </div>
    );
  }

  const { you, supervisors, directReports, peers, committees } = treeData;

  // Reverse supervisors so top executive is first
  const supervisoryChain = [...(supervisors || [])].reverse();

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Page Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 rounded-md bg-indigo-50 text-indigo-600">
              <Network className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 font-mono">
              Statutory Organizational Hierarchy
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Official Work Tree & Roster
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Authoritative reporting chain, direct subordinate workloads, and active statutory committees
          </p>
        </div>

        <Link href="/aicte/dashboard">
          <Button variant="outline" size="sm" className="h-9 px-3.5 text-xs font-semibold text-slate-700 border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs">
            Back to Dashboard
          </Button>
        </Link>
      </div>

      {/* 1. Upward Hierarchy (Supervisory Chain) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" />
            Supervisory Reporting Chain
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">
            {supervisoryChain.length} Superior Levels
          </span>
        </div>

        <div className="space-y-2">
          {supervisoryChain.map((mgr, idx) => (
            <div key={mgr.id} className="relative">
              <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200">
                    {mgr.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-slate-900">{mgr.name}</p>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {mgr.employeeCode}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {mgr.designation} • {mgr.organizationUnit}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200 uppercase tracking-wide">
                    {idx === 0 ? "Apex Authority" : `Level ${idx + 1} Authority`}
                  </span>
                </div>
              </div>

              {idx < supervisoryChain.length - 1 && (
                <div className="flex justify-center my-0.5 text-slate-300 font-mono text-xs">
                  │
                </div>
              )}
            </div>
          ))}

          {supervisoryChain.length > 0 && (
            <div className="flex justify-center my-1">
              <ArrowDown className="h-4 w-4 text-indigo-500 animate-bounce" />
            </div>
          )}
        </div>
      </div>

      {/* 2. You (Highlighted Official Desk) */}
      <div className="border-2 border-indigo-500 bg-gradient-to-r from-indigo-50/60 via-white to-indigo-50/40 p-5 shadow-xs rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
              {you.name.split(" ").map((n) => n[0]).join("")}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white px-2.5 py-0.5 rounded-full font-mono shadow-2xs">
                  Your Desk • Active Station
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {you.employeeCode}
                </span>
              </div>
              <h2 className="text-base font-black text-slate-900">{you.name}</h2>
              <p className="text-xs text-slate-600">
                {you.designation} • {you.organizationUnit}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Status</span>
              <p className="font-bold text-emerald-700">{you.availability}</p>
            </div>
            <div className="text-right border-l border-slate-200 pl-3">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Direct Subordinates</span>
              <p className="font-bold text-slate-900">{you.directReportsCount} Officers</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Direct Reports (Subordinates & Workload) */}
      {directReports && directReports.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-indigo-600" />
              Direct Reports & Subordinate Workload ({directReports.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {directReports.map((dr) => (
              <div
                key={dr.id}
                className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all space-y-3 shadow-2xs group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs border border-slate-200">
                      {dr.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">{dr.name}</p>
                      <p className="text-[11px] text-slate-500">{dr.designation}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    dr.availability === "AVAILABLE"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}>
                    {dr.availability}
                  </span>
                </div>

                {/* Mixpanel Metric Breakdown */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Assigned</span>
                    <p className="font-black text-slate-900 font-mono text-sm">{dr.workload.active}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Urgent</span>
                    <p className={`font-black font-mono text-sm ${dr.workload.urgent > 0 ? "text-rose-600" : "text-slate-800"}`}>
                      {dr.workload.urgent}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Delegated</span>
                    <p className="font-black text-slate-900 font-mono text-sm">{dr.workload.delegated}</p>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedColleague(dr);
                      setIsDelegationOpen(true);
                    }}
                    className="h-7 text-[11px] px-2.5 text-slate-700 border-slate-200 hover:border-slate-300 font-semibold rounded-lg"
                  >
                    <UserCheck className="h-3 w-3 mr-1 text-indigo-600" />
                    Delegate Work
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Bureau Peers & Committee Co-Members */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bureau Peers */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Bureau Peers ({peers?.length || 0})
          </h2>
          <Card className="p-3.5 border border-slate-200/90 shadow-2xs bg-white divide-y divide-slate-100 rounded-xl">
            {peers && peers.length > 0 ? (
              peers.map((peer) => (
                <div key={peer.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                      {peer.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{peer.name}</p>
                      <p className="text-[10px] text-slate-500">{peer.designation}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                    {peer.employeeCode}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">No bureau peers found</p>
            )}
          </Card>
        </div>

        {/* Committees */}
        <div className="space-y-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Active Statutory Committees
          </h2>
          <div className="space-y-2.5">
            {committees && committees.length > 0 ? (
              committees.map((comm) => (
                <Card key={comm.committeeId} className="p-4 border border-slate-200/90 shadow-2xs bg-white rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{comm.committeeName}</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                      {comm.myRole}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <strong className="text-slate-700">Co-Members:</strong>{" "}
                    {comm.coMembers.length > 0
                      ? comm.coMembers.map((m) => m.name).join(", ")
                      : "Sole Member Panel"}
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-4 text-xs text-slate-400 text-center">No active committee rosters assigned</Card>
            )}
          </div>
        </div>
      </div>

      {/* Delegation Modal */}
      {isDelegationOpen && (
        <DelegationModal
          isOpen={isDelegationOpen}
          onClose={() => setIsDelegationOpen(false)}
          application={null}
          onSuccess={() => {
            alert("Delegation request issued successfully.");
          }}
        />
      )}
    </div>
  );
}

export default function WorkTreePage() {
  return (
    <RequireRole roles={[...AICTE_ROLES]}>
      <WorkTreeContent />
    </RequireRole>
  );
}
