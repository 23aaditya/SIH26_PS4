"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { API_BASE } from "@/lib/dataService";
import { DelegationModal } from "@/components/aicte/DelegationModal";
import { AvailabilityModal } from "@/components/aicte/AvailabilityModal";
import {
  FileText,
  Clock,
  AlertTriangle,
  Users,
  Search,
  ShieldCheck,
  Building,
  Briefcase,
  CheckCircle2,
  Network,
  UserCheck,
  Bell,
  ArrowRight,
  Loader2,
  Calendar,
  Layers,
  Sparkles,
  Inbox,
  AlertCircle,
  ArrowUpRight,
  Check,
  SlidersHorizontal,
  ArrowUpDown,
  ChevronRight,
  Activity,
  Zap,
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
  "committee_member",
  "unit_head",
  "reviewing_officer",
  "read_only_auditor",
  "support_staff",
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Visual 4-Stage Funnel for Regulatory Milestones
const FUNNEL_STAGES = [
  { step: 1, key: "SCRUTINY", label: "Scrutiny" },
  { step: 2, key: "EVC", label: "EVC Visit" },
  { step: 3, key: "SHC", label: "Hearing (SHC)" },
  { step: 4, key: "COUNCIL", label: "Council Order" },
];

function getStageStep(stageName = "") {
  const s = (stageName || "").toUpperCase();
  if (s.includes("SCRUTINY") || s.includes("DOCUMENT")) return 1;
  if (s.includes("EVC") || s.includes("VISIT") || s.includes("INSPECTION")) return 2;
  if (s.includes("HEARING") || s.includes("SHC") || s.includes("SAC")) return 3;
  if (s.includes("COUNCIL") || s.includes("APPROVAL") || s.includes("ISSUANCE") || s.includes("DECISION")) return 4;
  return 1;
}

function AicteDashboardContent() {
  const { userProfile, switchWorkspace, activeWorkspace } = useAuth();

  // State
  const [summary, setSummary] = useState(null);
  const [workList, setWorkList] = useState({ items: [], total: 0, type: "applications" });
  const [priorityItems, setPriorityItems] = useState([]);
  const [teamWorkload, setTeamWorkload] = useState(null);
  const [workTreeSnippet, setWorkTreeSnippet] = useState(null);
  const [availability, setAvailability] = useState(null);

  const [activeTab, setActiveTab] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("sla");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modals
  const [isDelegationOpen, setIsDelegationOpen] = useState(false);
  const [selectedAppForDelegation, setSelectedAppForDelegation] = useState(null);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  const officerCode = userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034";
  const firstName = userProfile?.name ? userProfile.name.split(" ")[0] : "Officer";

  // Fetch summary and priority work
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const headers = {
        "x-user-id": officerCode,
      };

      const [summaryRes, priorityRes, treeRes, workloadRes, availRes] = await Promise.all([
        fetch(`${API_BASE}/aicte/my-work/summary`, { headers, credentials: "include" }),
        fetch(`${API_BASE}/aicte/my-work?filter=priority`, { headers, credentials: "include" }),
        fetch(`${API_BASE}/aicte/work-tree`, { headers, credentials: "include" }),
        fetch(`${API_BASE}/aicte/team-workload`, { headers, credentials: "include" }),
        fetch(`${API_BASE}/aicte/availability`, { headers, credentials: "include" }),
      ]);

      if (summaryRes.ok) {
        const sumData = await summaryRes.json();
        setSummary(sumData);
      }

      if (priorityRes.ok) {
        const pData = await priorityRes.json();
        setPriorityItems(pData.items || []);
      }

      if (treeRes.ok) {
        const tData = await treeRes.json();
        setWorkTreeSnippet(tData);
      }

      if (workloadRes.ok) {
        const wData = await workloadRes.json();
        setTeamWorkload(wData);
      }

      if (availRes.ok) {
        const aData = await availRes.json();
        setAvailability(aData);
      }
    } catch (err) {
      console.warn("Failed to fetch dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch work list for active tab
  const loadWorkList = async (tab) => {
    try {
      const headers = { "x-user-id": officerCode };
      const res = await fetch(`${API_BASE}/aicte/my-work?filter=${tab}`, { headers, credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setWorkList(data);
      }
    } catch (err) {
      console.warn("Failed to load work list:", err);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [userProfile]);

  useEffect(() => {
    loadWorkList(activeTab);
  }, [activeTab, userProfile]);

  const handleCardClick = (targetTab) => {
    setActiveTab(targetTab);
  };

  const handleOpenDelegation = (app = null) => {
    setSelectedAppForDelegation(app);
    setIsDelegationOpen(true);
  };

  // Filtered and sorted work list items
  const filteredItems = useMemo(() => {
    let items = workList.items || [];

    // Priority filter (for application lists)
    if (priorityFilter !== "ALL" && workList.type !== "delegations") {
      items = items.filter((item) => item.priority === priorityFilter);
    }

    // Search query
    if (searchQuery.trim()) {
      const term = searchQuery.toLowerCase().trim();
      items = items.filter(
        (item) =>
          item.applicationNumber?.toLowerCase().includes(term) ||
          item.institutionName?.toLowerCase().includes(term) ||
          item.currentStageName?.toLowerCase().includes(term) ||
          item.taskTitle?.toLowerCase().includes(term) ||
          item.priorityReason?.toLowerCase().includes(term)
      );
    }

    // Sorting
    return [...items].sort((a, b) => {
      if (sortBy === "sla") {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt) - new Date(b.dueAt);
      }
      if (sortBy === "priority") {
        const order = { URGENT: 3, IMPORTANT: 2, NORMAL: 1 };
        return (order[b.priority] || 0) - (order[a.priority] || 0);
      }
      if (sortBy === "number") {
        return (a.applicationNumber || "").localeCompare(b.applicationNumber || "");
      }
      return 0;
    });
  }, [workList.items, searchQuery, priorityFilter, sortBy, workList.type]);

  const supervisor = workTreeSnippet?.supervisors?.[0];
  const committees = userProfile?.committeeMemberships || [];
  const hasMultipleCommittees = committees.length > 1;

  // Mixpanel-style Pill Tab counts
  const tabCounts = {
    all: summary?.total || (workList.type === "applications" ? workList.total : 0),
    assigned: summary?.assigned || 0,
    delegated: summary?.delegatedToMe || 0,
    waiting: summary?.waitingOnInstitute || 0,
    completed: workList.type === "applications" && activeTab === "completed" ? workList.items.length : "—",
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* ─── TOP OPERATIONAL BAR (Mixpanel Project & Session Header) ─── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          {/* Status strip */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* Live operational badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Operational Station
            </span>

            {/* Officer ID Code */}
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-indigo-600" />
              {officerCode}
            </span>

            {/* Interactive Availability Indicator */}
            <button
              type="button"
              onClick={() => setIsAvailabilityOpen(true)}
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                availability?.status === "AVAILABLE" || !availability
                  ? "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
              }`}
              title="Click to update operational availability status"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                availability?.status === "AVAILABLE" || !availability ? "bg-emerald-500" : "bg-amber-500"
              }`}></span>
              <span>Availability: <strong>{availability?.status || "AVAILABLE"}</strong></span>
            </button>

            {supervisor && (
              <span className="text-[11px] text-slate-500 hidden lg:inline pl-1">
                Supervising Authority: <strong className="text-slate-800">{supervisor.name}</strong> ({supervisor.designation})
              </span>
            )}
          </div>

          {/* Heading */}
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {getGreeting()}, {userProfile?.displayName || userProfile?.name || firstName}
          </h1>

          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>{userProfile?.designation?.title || "Approval Officer"}</span>
            <span>•</span>
            <span>{userProfile?.organizationUnit?.name || "Approval Bureau"}</span>
            <span>•</span>
            <span className="text-indigo-600 font-medium">Aph 2024-27 Workflow Cycle</span>
          </p>
        </div>

        {/* Right Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Work Tree Link */}
          <Link href="/aicte/my-work-tree">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-semibold text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 gap-2 rounded-lg shadow-2xs"
            >
              <Network className="h-3.5 w-3.5 text-indigo-600" />
              <span>My Work Tree</span>
            </Button>
          </Link>

          {/* Quick Delegate Action */}
          <Button
            size="sm"
            onClick={() => handleOpenDelegation(null)}
            className="h-9 px-3.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white gap-2 rounded-lg shadow-xs transition-all hover:-translate-y-0.5"
          >
            <UserCheck className="h-3.5 w-3.5 text-indigo-300" />
            <span>Delegate Work</span>
          </Button>

          {/* Committee Workspace Dropdown if multi-committee */}
          {hasMultipleCommittees && (
            <select
              value={activeWorkspace || committees[0]?.committeeCode || ""}
              onChange={(e) => switchWorkspace(e.target.value)}
              className="h-9 text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 text-slate-800 outline-none focus:border-indigo-500 shadow-2xs"
            >
              {committees.map((cm) => (
                <option key={cm.committeeCode} value={cm.committeeCode}>
                  {cm.committeeName} ({cm.committeeRole})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ─── SECTION 1: MY WORK SUMMARY (Mixpanel-Style KPI Metric Cards) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* 1. Assigned to Me */}
        <div
          onClick={() => handleCardClick("assigned")}
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
            activeTab === "assigned"
              ? "bg-indigo-50/40 border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Assigned to Me
            </span>
            <div className={`p-1.5 rounded-lg transition-colors ${
              activeTab === "assigned" ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100"
            }`}>
              <FileText className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {summary ? summary.assigned : "—"}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              Active Quorum
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Direct Regulatory Ownership</span>
            <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* 2. Due Soon */}
        <div
          onClick={() => handleCardClick("priority")}
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
            activeTab === "priority"
              ? "bg-rose-50/40 border-rose-500 ring-2 ring-rose-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
              Due Soon (&lt; 72h)
            </span>
            <div className={`p-1.5 rounded-lg transition-colors ${
              activeTab === "priority" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-600 group-hover:bg-rose-100"
            }`}>
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-rose-600 font-mono tracking-tight">
              {summary ? summary.dueSoon : "—"}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              SLA Risk
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Critical Timelines</span>
            <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* 3. Waiting on Institute */}
        <div
          onClick={() => handleCardClick("waiting")}
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
            activeTab === "waiting"
              ? "bg-amber-50/40 border-amber-500 ring-2 ring-amber-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Waiting on Institute
            </span>
            <div className={`p-1.5 rounded-lg transition-colors ${
              activeTab === "waiting" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-600 group-hover:bg-amber-100"
            }`}>
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {summary ? summary.waitingOnInstitute : "—"}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Clarifications
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Deficiency Compliance</span>
            <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* 4. Delegated to Me */}
        <div
          onClick={() => handleCardClick("delegated")}
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group ${
            activeTab === "delegated"
              ? "bg-purple-50/40 border-purple-500 ring-2 ring-purple-500/20 shadow-xs"
              : "bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
              Delegated to Me
            </span>
            <div className={`p-1.5 rounded-lg transition-colors ${
              activeTab === "delegated" ? "bg-purple-600 text-white" : "bg-purple-50 text-purple-600 group-hover:bg-purple-100"
            }`}>
              <UserCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-black text-purple-700 font-mono tracking-tight">
              {summary ? summary.delegatedToMe : "—"}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Co-Review
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Shared Officer Tasks</span>
            <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: PRIORITY WORK (Mixpanel-Style Intelligence & Milestone Funnel) ─── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
              Priority Work Bench
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
              {priorityItems.length} Urgent / Action Mandated
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Ranked by regulatory SLA urgency, deficiency escalations, and statutory milestones
          </span>
        </div>

        {priorityItems.length === 0 ? (
          <Card className="p-8 text-center border border-slate-200/80 bg-white rounded-2xl shadow-2xs">
            <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2.5" />
            <p className="text-sm font-bold text-slate-900">Priority Queue Clear</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              No urgent regulatory deadlines or escalations pending. Routine queue items are available below.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {priorityItems.slice(0, 4).map((item) => {
              const currentStep = getStageStep(item.currentStageName);
              return (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between space-y-3 relative group"
                >
                  <div>
                    {/* Top row: Application Number + Priority Badge + SLA */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/aicte/applications/${item.id}`}
                          className="font-mono font-bold text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          {item.applicationNumber}
                        </Link>
                        <span className="text-[10px] text-slate-400 font-mono">
                          • {item.category || "REGULATORY"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                          item.priority === "URGENT"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            item.priority === "URGENT" ? "bg-rose-500 animate-pulse" : "bg-amber-500"
                          }`}></span>
                          {item.priority}
                        </span>

                        {item.dueAt && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-200 font-medium">
                            <SlaCountdown dueAt={item.dueAt} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Institution title */}
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-950 transition-colors line-clamp-1">
                      {item.institutionName}
                    </h3>

                    {/* Priority Reason Pill */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100/90 text-slate-700 text-[10px] font-medium border border-slate-200/70 truncate max-w-full">
                        {item.priorityReason || "Statutory stage review in progress"}
                      </span>
                    </div>

                    {/* Mixpanel-Style Funnel Stage Progress Bar */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 font-medium">
                        <span>Workflow Stage: <strong className="text-slate-700">{item.currentStageName}</strong></span>
                        <span className="font-mono">{currentStep} of 4</span>
                      </div>

                      {/* 4-Step Milestone Dots */}
                      <div className="grid grid-cols-4 gap-1.5 items-center">
                        {FUNNEL_STAGES.map((st) => (
                          <div key={st.step} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                currentStep >= st.step
                                  ? currentStep === st.step
                                    ? "bg-indigo-600"
                                    : "bg-indigo-300"
                                  : "bg-slate-100"
                              }`}
                            />
                            <p className={`text-[9px] truncate text-center ${
                              currentStep === st.step ? "font-bold text-indigo-700" : "text-slate-400"
                            }`}>
                              {st.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-500 truncate max-w-[170px]">
                      Next: <strong className="text-slate-800">{item.nextLevelName || "Approval Council"}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDelegation(item)}
                        className="h-7 text-xs px-2 text-slate-600 hover:text-slate-900 font-semibold"
                      >
                        Delegate
                      </Button>
                      <Link href={`/aicte/applications/${item.id}`}>
                        <Button size="sm" className="h-7 text-xs px-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-2xs gap-1">
                          <span>Review Case</span>
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── SECTION 3: MY WORK QUEUE (Mixpanel-Style Recessed Segmented Controls + Dense Grid) ─── */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
        {/* Recessed Mixpanel-Style Segmented Control Bar */}
        <div className="p-3.5 border-b border-slate-200/80 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Segmented Pills */}
          <div className="bg-slate-200/70 p-1 rounded-xl flex items-center overflow-x-auto gap-0.5">
            {[
              { id: "all", label: "All Work", count: tabCounts.all },
              { id: "assigned", label: "Assigned to Me", count: tabCounts.assigned },
              { id: "delegated", label: "Delegated Tasks", count: tabCounts.delegated },
              { id: "waiting", label: "Waiting on Institute", count: tabCounts.waiting },
              { id: "completed", label: "Completed Orders", count: tabCounts.completed },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? "bg-white text-slate-950 shadow-2xs font-bold border border-slate-200/60"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== "—" && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "bg-slate-300/80 text-slate-700"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Priority Filter */}
            {workList.type !== "delegations" && (
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-8 text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 text-slate-700 outline-none focus:border-indigo-500 shadow-2xs"
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent Only</option>
                <option value="IMPORTANT">Important</option>
                <option value="NORMAL">Normal</option>
              </select>
            )}

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 text-xs font-semibold rounded-lg border border-slate-200 bg-white px-2.5 text-slate-700 outline-none focus:border-indigo-500 shadow-2xs"
            >
              <option value="sla">Sort: SLA Earliest</option>
              <option value="priority">Sort: Highest Priority</option>
              <option value="number">Sort: Application ID</option>
            </select>

            {/* Live Search */}
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ID, institute, task..."
                className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500 placeholder:text-slate-400 shadow-2xs"
              />
            </div>
          </div>
        </div>

        {/* Work List Content */}
        {workList.type === "delegations" ? (
          // Delegated Tasks Table
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Task Scope & Title</th>
                  <th className="py-3 px-4">Application ID</th>
                  <th className="py-3 px-4">Colleague Assignment</th>
                  <th className="py-3 px-4">Priority & Context</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-slate-500">
                      <UserCheck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-800">No delegated tasks found</p>
                      <p className="text-xs text-slate-400 mt-0.5">Tasks delegated to or by your desk will display here</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((task) => (
                    <tr key={task.id} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-xs">
                        <p className="font-bold text-slate-900">{task.taskTitle}</p>
                        <p className="text-[11px] text-slate-400 font-normal truncate">{task.taskDescription}</p>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                        <Link href={`/aicte/applications/${task.applicationId}`} className="hover:underline">
                          {task.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {task.isDelegatedToMe ? (
                          <span className="text-xs">
                            From: <strong className="text-slate-900">{task.delegatedBy?.name}</strong>
                          </span>
                        ) : (
                          <span className="text-xs">
                            To: <strong className="text-slate-900">{task.delegatedTo?.name}</strong>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          task.priority === "URGENT" ? "bg-rose-100 text-rose-800 border border-rose-200" : "bg-slate-100 text-slate-700"
                        }`}>
                          {task.priority}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{task.reason}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {task.deadline ? new Date(task.deadline).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          task.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                            : task.status === "PENDING"
                            ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse"
                            : "bg-blue-100 text-blue-800 border border-blue-200"
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/aicte/applications/${task.applicationId}`}>
                          <Button size="sm" className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg">
                            Open Task
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          // Applications List Table
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Application ID</th>
                  <th className="py-3 px-4">Institution & Region</th>
                  <th className="py-3 px-4">Statutory Workflow Stage</th>
                  <th className="py-3 px-4">Priority & Escalation</th>
                  <th className="py-3 px-4">Regulatory Status</th>
                  <th className="py-3 px-4">SLA Countdown</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-slate-500">
                      <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-800">No applications match current filters</p>
                      <p className="text-xs text-slate-400 mt-0.5">Try switching queue tabs or resetting your search term</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((app) => (
                    <tr key={app.id} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <Link href={`/aicte/applications/${app.id}`} className="hover:underline text-indigo-600 flex items-center gap-1">
                          {app.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900 truncate max-w-xs">
                          {app.institutionName}
                        </p>
                        <p className="text-[11px] text-slate-400">{app.regionName || "Western Region"} • {app.category}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{app.currentStageName}</p>
                        {app.nextLevelName && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-indigo-600 font-medium">
                            <ArrowRight className="h-2.5 w-2.5" /> Next: {app.nextLevelName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          app.priority === "URGENT"
                            ? "bg-rose-100 text-rose-800 border border-rose-200"
                            : app.priority === "IMPORTANT"
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {app.priority}
                        </span>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[150px]">
                          {app.priorityReason}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="py-3 px-4">
                        <SlaCountdown dueAt={app.dueAt} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDelegation(app)}
                            className="h-7 text-xs px-2 text-slate-600 hover:text-slate-900 font-semibold"
                          >
                            Delegate
                          </Button>
                          <Link href={`/aicte/applications/${app.id}`}>
                            <Button size="sm" className="h-7 text-xs px-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-2xs">
                              Review
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info strip */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium">Displaying {filteredItems.length} active regulatory items</span>
          <span className="font-mono text-[11px] text-slate-400">AICTE Approval Grid v2.4 • Live Sync</span>
        </div>
      </Card>

      {/* ─── SECTION 4: HIERARCHY & BUREAU WORKLOAD (Mixpanel-Style Team Insights) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Work Tree Snapshot */}
        <Card className="p-4 sm:p-5 border border-slate-200/90 shadow-2xs bg-white rounded-2xl space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Official Hierarchy Flow
              </h3>
            </div>
            <Link href="/aicte/my-work-tree">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-600 font-bold p-0 hover:text-indigo-800">
                View Full Tree →
              </Button>
            </Link>
          </div>

          <div className="space-y-2 text-xs">
            {supervisor ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                    {supervisor.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Supervising Authority</span>
                    <p className="font-bold text-slate-900">{supervisor.name}</p>
                    <p className="text-[11px] text-slate-500">{supervisor.designation} • {supervisor.organizationUnit}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">{supervisor.employeeCode}</span>
              </div>
            ) : (
              <p className="text-slate-400 italic">Apex Authority Station</p>
            )}

            {/* Vertical connector line */}
            <div className="pl-6 py-0.5 text-indigo-300 font-mono text-xs">
              │
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/30 border border-indigo-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  {firstName[0]}
                </div>
                <div>
                  <span className="text-[10px] text-indigo-700 font-bold uppercase">Your Desk (Current Station)</span>
                  <p className="font-bold text-slate-900">{userProfile?.name || "Official"}</p>
                  <p className="text-[11px] text-slate-500">{userProfile?.designation?.title || "Approval Officer"}</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {availability?.status || "AVAILABLE"}
              </span>
            </div>
          </div>
        </Card>

        {/* Bureau Team Workload (Mixpanel Horizontal Bar Representation) */}
        <Card className="p-4 sm:p-5 border border-slate-200/90 shadow-2xs bg-white rounded-2xl space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                {teamWorkload?.teamMembers?.length > 0 ? "Bureau Team Workload" : "Colleague Workload"}
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              {teamWorkload?.teamMembers?.length || 0} Officers Active
            </span>
          </div>

          <div className="space-y-2.5 max-h-[175px] overflow-y-auto text-xs pr-1">
            {teamWorkload?.teamMembers && teamWorkload.teamMembers.length > 0 ? (
              teamWorkload.teamMembers.slice(0, 5).map((member) => (
                <div key={member.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                      {member.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{member.name}</p>
                      <p className="text-[10px] text-slate-500">{member.designation}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Horizontal progress capacity bar */}
                    <div className="hidden sm:block w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (member.activeCount / 8) * 100)}%` }}
                      />
                    </div>

                    <span className="text-[11px] font-mono text-slate-700 font-bold">
                      {member.activeCount} <span className="font-normal text-slate-400">cases</span>
                    </span>

                    {member.urgentCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        {member.urgentCount} urgent
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-center py-6 italic text-xs">
                No subordinate team members currently assigned.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ─── MODALS ─── */}
      {isDelegationOpen && (
        <DelegationModal
          isOpen={isDelegationOpen}
          onClose={() => {
            setIsDelegationOpen(false);
            setSelectedAppForDelegation(null);
          }}
          application={selectedAppForDelegation}
          onSuccess={() => {
            loadDashboardData();
            loadWorkList(activeTab);
          }}
        />
      )}

      {isAvailabilityOpen && (
        <AvailabilityModal
          isOpen={isAvailabilityOpen}
          onClose={() => setIsAvailabilityOpen(false)}
          currentAvailability={availability}
          onSuccess={(newAvail) => {
            setAvailability(newAvail);
            loadDashboardData();
          }}
        />
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
