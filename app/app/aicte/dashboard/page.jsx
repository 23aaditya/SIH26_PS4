"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService, API_BASE } from "@/lib/dataService";
import { APPLICATION_CATEGORY_LABELS, ROLE_LABELS, getApplicationCategoryLabel } from "@/lib/types";
import { StaffManagementModule } from "@/components/aicte/StaffManagementModule";
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

function getStageSummary(app) {
  const isScrutinyDone = ["pending_committee", "pending_evc", "approved", "rejected"].includes(app.status) || ["committee", "decision"].includes(app.currentStageId);
  const hasDeficiency = app.hasActiveDeficiency || (app.deficiencies && app.deficiencies.length > 0) || app.returnCount > 0;

  const scrutinyText = hasDeficiency
    ? `Deficiency notice issued (Cycle #${app.returnCount || 1}); institutional response received and cleared.`
    : isScrutinyDone
    ? "All primary statutory documents verified. AI pre-check passed with 0 critical non-compliances."
    : "Primary document verification & statutory norms scrutiny in progress.";

  const hearingStage = app.workflowInstance?.stages?.find((s) => s.stageKey === "committee");
  const hearingReport = hearingStage?.reports?.find((r) => r.reportType === "SHC_MINUTES") || hearingStage?.reports?.[0];
  const hearingText = hearingReport
    ? `Hearing conducted. Minutes recorded: ${hearingReport.findings || hearingReport.recommendations || "Proceeding concluded"}.`
    : hearingStage?.stageStatus === "COMPLETED"
    ? `Hearing concluded. Recommendation: ${hearingStage.outcome || "Forwarded to Council"}.`
    : app.currentStageId === "committee"
    ? "Standing Hearing Committee proceeding actively in session."
    : isScrutinyDone
    ? "Standing Hearing Committee scheduled."
    : "Awaiting scrutiny completion.";

  const decisionText = (app.decision || app.status === "approved" || app.status === "rejected")
    ? `Council Order: ${app.decision?.decisionType?.toUpperCase() || app.status?.toUpperCase()} (${app.decision?.documentLetterType || "EoA"}). Sealed on ${new Date(app.decision?.decisionDate || app.decision?.createdAt || Date.now()).toLocaleDateString("en-IN")}.`
    : app.currentStageId === "decision"
    ? "Pending final Council determination and sealing."
    : "Pending hearing recommendation.";

  return { scrutinyText, hearingText, decisionText };
}

function getHearingRecommendationBadge(app) {
  const hearingStage = app.workflowInstance?.stages?.find((s) => s.stageKey === "committee");
  const hearingReport = hearingStage?.reports?.find((r) => r.reportType === "SHC_MINUTES") || hearingStage?.reports?.[0];
  const rec = (hearingReport?.recommendations || hearingStage?.outcome || "").toUpperCase();

  if (rec.includes("FAVORABLE") || rec === "PASS" || rec === "RECOMMENDATION_SUBMITTED") {
    return { label: "Favorable (Recommend Approval)", color: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  }
  if (rec.includes("CONDITIONAL")) {
    return { label: "Conditional Approval", color: "bg-amber-50 text-amber-800 border-amber-200" };
  }
  if (rec.includes("UNFAVORABLE") || rec === "FAIL") {
    return { label: "Unfavorable (Recommend Reject)", color: "bg-rose-50 text-rose-800 border-rose-200" };
  }
  if (app.currentStageId === "committee") {
    return { label: "Hearing In Session", color: "bg-blue-50 text-blue-800 border-blue-200" };
  }
  return { label: "Pending Hearing", color: "bg-slate-100 text-slate-600 border-slate-200" };
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
  const [error, setError] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [actionInProgressId, setActionInProgressId] = useState(null);
  const [adminBanner, setAdminBanner] = useState(null);

  // Modals
  const [isDelegationOpen, setIsDelegationOpen] = useState(false);
  const [selectedAppForDelegation, setSelectedAppForDelegation] = useState(null);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);

  const officerCode = userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034";
  const firstName = userProfile?.name ? userProfile.name.split(" ")[0] : "Officer";

  // Fetch summary and priority work with AbortController for clean persona switching
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    setSummary(null);
    setPriorityItems([]);

    async function loadDashboardData() {
      try {
        const headers = { "x-user-id": officerCode };

        const [summaryRes, priorityRes, treeRes, workloadRes, availRes] = await Promise.all([
          fetch(`${API_BASE}/aicte/my-work/summary`, { headers, credentials: "include", signal: controller.signal }),
          fetch(`${API_BASE}/aicte/my-work?filter=priority`, { headers, credentials: "include", signal: controller.signal }),
          fetch(`${API_BASE}/aicte/work-tree`, { headers, credentials: "include", signal: controller.signal }),
          fetch(`${API_BASE}/aicte/team-workload`, { headers, credentials: "include", signal: controller.signal }),
          fetch(`${API_BASE}/aicte/availability`, { headers, credentials: "include", signal: controller.signal }),
        ]);

        if (!summaryRes.ok) {
          throw new Error(`Failed to load work summary (HTTP ${summaryRes.status})`);
        }

        const sumData = await summaryRes.json();
        setSummary(sumData);

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
        if (err.name !== "AbortError") {
          console.warn("Failed to fetch dashboard data:", err);
          setError(err.message || "Failed to load dashboard metrics");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      controller.abort();
    };
  }, [officerCode, userProfile]);

  // Fetch work list for active tab with abort handling
  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);

    async function loadWorkList() {
      try {
        const headers = { "x-user-id": officerCode };
        const url = activeTab === "admin_ledger"
          ? `${API_BASE}/aicte/applications?pageSize=50`
          : `${API_BASE}/aicte/my-work?filter=${activeTab}`;
        const res = await fetch(url, {
          headers,
          credentials: "include",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (activeTab === "admin_ledger") {
            setWorkList({ items: data.items || [], total: data.total || 0, type: "admin_ledger" });
          } else {
            setWorkList(data);
          }
        } else {
          setWorkList({ items: [], total: 0, type: activeTab === "admin_ledger" ? "admin_ledger" : "applications" });
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Failed to load work list:", err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setListLoading(false);
        }
      }
    }

    loadWorkList();

    return () => {
      controller.abort();
    };
  }, [activeTab, officerCode, userProfile]);

  const handleAdminQuickDecision = async (appId, decisionOutcome) => {
    setActionInProgressId(appId);
    try {
      const isApproved = decisionOutcome === "approved";
      const res = await fetch(`${API_BASE}/aicte/applications/${appId}/decision`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": officerCode || "DEMO-AIC-013",
        },
        credentials: "include",
        body: JSON.stringify({
          decisionType: isApproved ? "approved" : "rejected",
          outcome: isApproved ? "APPROVED" : "REJECTED",
          reasonAndFindings: isApproved
            ? "Final approval granted by Council Executive Committee following Standing Hearing Committee review. All statutory norms verified."
            : "Application officially rejected following Standing Hearing Committee evaluation.",
          documentLetterType: isApproved ? "LoA" : "LoD",
        }),
      });

      if (res.ok) {
        setAdminBanner({
          type: "success",
          message: isApproved
            ? `Final Approval (YES) recorded. Official Approval Order (LoA/EoA) dispatched to institution and application removed from active queue.`
            : `Application rejected (NO). Decision notice dispatched to institution and removed from active queue.`,
        });
        // Re-fetch ledger data
        const refreshed = await fetch(`${API_BASE}/aicte/applications?pageSize=50`, {
          headers: { "x-user-id": officerCode },
          credentials: "include",
        });
        if (refreshed.ok) {
          const rData = await refreshed.json();
          setWorkList({ items: rData.items || [], total: rData.total || 0, type: "admin_ledger" });
        }
        // Also reload dashboard summary
        const sumRes = await fetch(`${API_BASE}/aicte/my-work/summary`, {
          headers: { "x-user-id": officerCode },
          credentials: "include",
        });
        if (sumRes.ok) {
          const sData = await sumRes.json();
          setSummary(sData);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setAdminBanner({
          type: "error",
          message: err.error || "Failed to record administrative final decision.",
        });
      }
    } catch (e) {
      setAdminBanner({
        type: "error",
        message: e.message || "Network error while executing decision.",
      });
    } finally {
      setActionInProgressId(null);
    }
  };

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

  // Mouse move handler for interactive background blue grid
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };

  // Mixpanel-style Pill Tab counts
  const tabCounts = {
    all: summary?.total || (workList.type === "applications" ? workList.total : 0),
    assigned: summary?.assigned || 0,
    waiting: summary?.waitingOnInstitute || 0,
    processed: summary?.processed || 0,
    delegated: summary?.delegatedToMe || 0,
    completed: workList.type === "applications" && activeTab === "completed" ? workList.items.length : "—",
    admin_ledger: summary?.total || (workList.type === "applications" || workList.type === "admin_ledger" ? workList.total : 0),
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="interactive-blue-grid space-y-6 max-w-7xl mx-auto pb-10 p-3 sm:p-5 rounded-2xl transition-all"
    >
      {/* Error state banner */}
      {error && !loading && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-900">Dashboard Metrics Unavailable</p>
              <p className="text-[11px] text-rose-700">{error}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              setError(null);
              // triggers re-fetch
              setSummary(null);
            }}
            className="h-7 text-xs px-2.5 text-rose-700 border-rose-300 hover:bg-rose-100 font-semibold"
          >
            Retry
          </Button>
        </div>
      )}

      {/* ─── TOP OPERATIONAL BAR (Executive Work Station) ─── */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-xs p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-all duration-200">
        <div>
          {/* Status strip */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {/* Live operational badge with blue dot */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-slate-100 text-slate-800 border border-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              Operational Station
            </span>

            {/* Officer ID Code */}
            <span className="font-mono text-[10px] font-medium px-2 py-0.5 rounded bg-slate-50 text-[#0F172A] border border-slate-200 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-[#1E40AF]" />
              {officerCode}
            </span>

            {/* Interactive Availability Indicator */}
            <button
              type="button"
              onClick={() => setIsAvailabilityOpen(true)}
              className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border transition-all flex items-center gap-1.5 cursor-pointer ${
                availability?.status === "AVAILABLE" || !availability
                  ? "bg-slate-50 text-[#0F172A] border-slate-200 hover:bg-white hover:border-slate-300"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              }`}
              title="Click to update operational availability status"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${
                availability?.status === "AVAILABLE" || !availability ? "bg-emerald-500" : "bg-red-600"
              }`} />
              <span>Availability: <strong className="font-semibold">{availability?.status || "AVAILABLE"}</strong></span>
            </button>

            {supervisor && (
              <span className="text-[11px] text-slate-500 hidden lg:inline pl-1">
                Supervising Authority: <strong className="text-[#0F172A] font-semibold">{supervisor.name}</strong> ({supervisor.designation})
              </span>
            )}
          </div>

          {/* Strong Heading in deep navy */}
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A] tracking-tight">
            {getGreeting()}, {userProfile?.displayName || userProfile?.name || firstName}
          </h1>

          <p className="text-xs text-slate-600 mt-1 flex items-center gap-2 font-normal">
            <span>{userProfile?.designation?.title || "Approval Officer"}</span>
            <span>•</span>
            <span>{userProfile?.organizationUnit?.name || "Approval Bureau"}</span>
            <span>•</span>
            <span className="text-[#1E40AF] font-semibold">APH 2026-27 Workflow Cycle</span>
          </p>
        </div>

        {/* Right Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Work Tree Link */}
          <Link href="/aicte/my-work-tree">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs font-medium text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50 gap-1.5 rounded-md"
            >
              <Network className="h-3.5 w-3.5 text-[#1E40AF]" />
              <span>My Work Tree</span>
            </Button>
          </Link>

          {/* Quick Delegate Action */}
          <Button
            size="sm"
            onClick={() => handleOpenDelegation(null)}
            className="h-8 px-3 text-xs font-semibold bg-[#1E40AF] hover:bg-[#1E3A8A] text-white gap-1.5 rounded-md transition-all duration-150 shadow-xs"
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>Delegate Work</span>
          </Button>

          {/* Committee Workspace Dropdown if multi-committee */}
          {hasMultipleCommittees && (
            <select
              value={activeWorkspace || committees[0]?.committeeCode || ""}
              onChange={(e) => switchWorkspace(e.target.value)}
              className="h-8 text-xs font-normal rounded-md border border-slate-200 bg-white px-2.5 text-[#0F172A] outline-none focus:border-[#1E40AF]"
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

      {/* ─── SECTION 1: MY WORK SUMMARY (Executive Metric Bento Cards) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* 1. Assigned to Me / Active Queue */}
        <div
          onClick={() => handleCardClick("assigned")}
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group shadow-xs ${
            activeTab === "assigned"
              ? "bg-blue-50/70 border-[#1E40AF] ring-1 ring-[#1E40AF]"
              : "bg-white border-slate-200 hover:border-blue-300 hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Active Queue
            </span>
            <div className={`p-1.5 rounded-md transition-colors ${
              activeTab === "assigned" ? "bg-[#1E40AF] text-white" : "bg-blue-50 text-[#1E40AF] group-hover:bg-blue-100"
            }`}>
              <FileText className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A] font-mono tracking-tight">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400 inline" />
              ) : summary ? (
                summary.assigned
              ) : (
                "—"
              )}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1E40AF] border border-blue-200">
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
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group shadow-xs ${
            activeTab === "priority"
              ? "bg-red-50/70 border-red-500 ring-1 ring-red-500"
              : "bg-white border-slate-200 hover:border-red-300 hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
              Due Soon (&lt; 72h)
            </span>
            <div className={`p-1.5 rounded-md transition-colors ${
              activeTab === "priority" ? "bg-red-600 text-white" : "bg-red-50 text-red-600 group-hover:bg-red-100"
            }`}>
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-red-600 font-mono tracking-tight">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-red-400 inline" />
              ) : summary ? (
                summary.dueSoon
              ) : (
                "—"
              )}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-50 text-red-800 border border-red-200">
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
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group shadow-xs ${
            activeTab === "waiting"
              ? "bg-slate-100/70 border-slate-400 ring-1 ring-slate-400"
              : "bg-white border-slate-200 hover:border-slate-300 hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              Waiting on Institute
            </span>
            <div className={`p-1.5 rounded-md transition-colors ${
              activeTab === "waiting" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
            }`}>
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A] font-mono tracking-tight">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-slate-400 inline" />
              ) : summary ? (
                summary.waitingOnInstitute
              ) : (
                "—"
              )}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
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
          className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden group shadow-xs ${
            activeTab === "delegated"
              ? "bg-blue-50/70 border-[#1E40AF] ring-1 ring-[#1E40AF]"
              : "bg-white border-slate-200 hover:border-blue-300 hover:-translate-y-0.5"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#1E40AF]">
              Delegated to Me
            </span>
            <div className={`p-1.5 rounded-md transition-colors ${
              activeTab === "delegated" ? "bg-[#1E40AF] text-white" : "bg-blue-50 text-[#1E40AF] group-hover:bg-blue-100"
            }`}>
              <UserCheck className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold text-[#0F172A] font-mono tracking-tight">
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-[#1E40AF] inline" />
              ) : summary ? (
                summary.delegatedToMe
              ) : (
                "—"
              )}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1E40AF] border border-blue-200">
              Co-Review
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Shared Officer Tasks</span>
            <ChevronRight className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: PRIORITY WORK (Statutory Priority Work Bench) ─── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-[#1E40AF]" />
              Priority Work Bench
            </h2>
            <span className="px-2.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
              {priorityItems.length} Urgent / Action Mandated
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-normal">
            Ranked by regulatory SLA urgency, deficiency escalations, and statutory milestones
          </span>
        </div>

        {loading ? (
          <Card className="p-8 text-center border border-slate-200 bg-white rounded-xl shadow-xs">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-normal">Evaluating statutory priority work...</p>
          </Card>
        ) : error ? (
          <Card className="p-8 text-center border border-rose-200 bg-rose-50/50 rounded-xl">
            <AlertCircle className="h-7 w-7 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-900">Priority Work Unavailable</p>
            <p className="text-xs text-rose-600 mt-1 max-w-md mx-auto">{error}</p>
          </Card>
        ) : priorityItems.length === 0 ? (
          <Card className="p-8 text-center border border-slate-200 bg-white rounded-xl shadow-xs">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2.5" />
            <p className="text-sm font-semibold text-[#0F172A]">Priority Queue Clear</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto font-normal">
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
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between space-y-3 relative group shadow-xs"
                >
                  <div>
                    {/* Top row: Application Number + Priority Badge + SLA */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/aicte/applications/${item.id}`}
                          className="font-mono font-bold text-xs text-[#1E40AF] hover:text-[#1E3A8A] hover:underline transition-all"
                        >
                          {item.applicationNumber}
                        </Link>
                        <span className="text-[10px] text-slate-500 font-mono">
                          • {item.category || "REGULATORY"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1 ${
                          item.priority === "URGENT"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-slate-100 text-slate-800 border border-slate-200"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            item.priority === "URGENT" ? "bg-red-600 animate-pulse" : "bg-amber-500"
                          }`} />
                          {item.priority}
                        </span>

                        {item.dueAt && (
                          <span className="px-2 py-0.5 rounded bg-slate-50 text-[#0F172A] text-[10px] font-mono border border-slate-200 font-normal">
                            <SlaCountdown dueAt={item.dueAt} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Institution title */}
                    <h3 className="text-sm font-bold text-[#0F172A] group-hover:text-[#1E40AF] transition-colors line-clamp-1">
                      {item.institutionName}
                    </h3>

                    {/* Priority Reason Pill */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-600 text-[10px] font-normal border border-slate-200 truncate max-w-full">
                        {item.priorityReason || "Statutory stage review in progress"}
                      </span>
                    </div>

                    {/* Funnel Stage Progress Bar */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5 font-normal">
                        <span>Workflow Stage: <strong className="text-[#0F172A] font-semibold">{item.currentStageName}</strong></span>
                        <span className="font-mono">{currentStep} of 4</span>
                      </div>

                      {/* 4-Step Milestone Dots */}
                      <div className="grid grid-cols-4 gap-1.5 items-center">
                        {FUNNEL_STAGES.map((st) => (
                          <div key={st.step} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-200 ${
                                currentStep >= st.step
                                  ? currentStep === st.step
                                    ? "bg-[#1E40AF]"
                                    : "bg-blue-300"
                                  : "bg-slate-200"
                              }`}
                            />
                            <p className={`text-[9px] truncate text-center ${
                              currentStep === st.step ? "font-bold text-[#1E40AF]" : "text-slate-500"
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
                    <span className="text-[11px] text-slate-500 truncate max-w-[170px] font-normal">
                      Next: <strong className="text-[#0F172A] font-medium">{item.nextLevelName || "Approval Council"}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenDelegation(item)}
                        className="h-7 text-xs px-2 text-slate-600 hover:text-[#0F172A] font-normal"
                      >
                        Delegate
                      </Button>
                      <Link href={`/aicte/applications/${item.id}`}>
                        <Button size="sm" className="h-7 text-xs px-3 bg-[#1E40AF] hover:bg-[#1E3A8A] text-white font-medium rounded-md transition-all duration-150 gap-1 shadow-xs">
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

      {/* ─── SECTION 3: MY WORK QUEUE (Segmented Controls & Data Grid) ─── */}
      <Card className="border border-slate-200/90 bg-white rounded-xl shadow-xs overflow-hidden">
        {/* Segmented Control Bar */}
        <div className="p-3 border-b border-slate-200/90 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Segmented Control Pills */}
          <div className="bg-slate-200/60 p-1 rounded-lg flex items-center overflow-x-auto gap-0.5">
            {[
              { id: "all", label: "All Work", count: tabCounts.all },
              { id: "assigned", label: "Active Queue", count: tabCounts.assigned },
              { id: "waiting", label: "Waiting on Institute", count: tabCounts.waiting },
              { id: "processed", label: "Processed Applications", count: tabCounts.processed },
              { id: "delegated", label: "Delegated Tasks", count: tabCounts.delegated },
              { id: "completed", label: "Completed Orders", count: tabCounts.completed },
              { id: "admin_ledger", label: "Admin Master Decision Ledger", count: tabCounts.admin_ledger },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-all duration-150 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-white text-[#0F172A] font-bold shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-[#0F172A] hover:bg-white/60"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== "—" && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                        isActive
                          ? "bg-[#1E40AF] text-white"
                          : "bg-slate-200 text-slate-700"
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
                className="h-8 text-xs font-normal rounded-[6px] border border-[#E5EDF5] bg-white px-2.5 text-[#061B31] outline-none focus:border-[#1E40AF]"
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
              className="h-8 text-xs font-normal rounded-[6px] border border-[#E5EDF5] bg-white px-2.5 text-[#061B31] outline-none focus:border-[#1E40AF]"
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
                className="w-full h-8 pl-8 pr-3 rounded-[6px] border border-[#E5EDF5] bg-white text-xs text-[#061B31] outline-none focus:border-[#1E40AF] placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Admin Action Feedback Banner */}
        {adminBanner && (
          <div className={`p-3.5 px-4 border-b flex items-center justify-between text-xs transition-all ${
            adminBanner.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}>
            <div className="flex items-center gap-2">
              {adminBanner.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              )}
              <span className="font-medium">{adminBanner.message}</span>
            </div>
            <button
              onClick={() => setAdminBanner(null)}
              className="text-slate-500 hover:text-slate-800 font-bold ml-4 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Work List Content */}
        {workList.type === "delegations" ? (
          // Delegated Tasks Table
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E5EDF5] bg-[#F8FAFD] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 font-semibold">Task Scope & Title</th>
                  <th className="py-3 px-4 font-semibold">Application ID</th>
                  <th className="py-3 px-4 font-semibold">Colleague Assignment</th>
                  <th className="py-3 px-4 font-semibold">Priority & Context</th>
                  <th className="py-3 px-4 font-semibold">Deadline</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EDF5]/70">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-slate-500">
                      <UserCheck className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-light text-[#061B31]">No delegated tasks found</p>
                      <p className="text-xs text-slate-400 mt-0.5 font-normal">Tasks delegated to or by your desk will display here</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((task) => (
                    <tr key={task.id} className="hover:bg-[#F8FAFD] transition-colors duration-150">
                      <td className="py-3 px-4 font-medium text-[#061B31] max-w-xs">
                        <p className="font-medium text-[#061B31]">{task.taskTitle}</p>
                        <p className="text-[11px] text-slate-400 font-normal truncate">{task.taskDescription}</p>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-[#1E40AF]">
                        <Link href={`/aicte/applications/${task.applicationId}`} className="hover:text-[#1E3A8A] hover:underline transition-all">
                          {task.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {task.isDelegatedToMe ? (
                          <span className="text-xs">
                            From: <strong className="text-[#061B31] font-medium">{task.delegatedBy?.name}</strong>
                          </span>
                        ) : (
                          <span className="text-xs">
                            To: <strong className="text-[#061B31] font-medium">{task.delegatedTo?.name}</strong>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] ${
                          task.priority === "URGENT"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-[#F8FAFD] text-[#061B31] border border-[#E5EDF5]"
                        }`}>
                          {task.priority}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5">{task.reason}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {task.deadline ? new Date(task.deadline).toLocaleDateString("en-IN") : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] ${
                          task.status === "COMPLETED"
                            ? "bg-emerald-50 text-[#006633] border border-emerald-200"
                            : task.status === "PENDING"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200"
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/aicte/applications/${task.applicationId}`}>
                          <Button size="sm" className="h-7 text-xs bg-[#1E40AF] hover:bg-[#1E3A8A] text-white font-normal rounded-[5px] transition-all">
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
        ) : workList.type === "admin_ledger" ? (
          // Admin Master Decision Ledger Table
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <th className="py-3 px-4 font-bold">Application & Institution</th>
                  <th className="py-3 px-4 font-bold">Current Stage & Status</th>
                  <th className="py-3 px-4 font-bold min-w-[280px]">Stage-by-Stage History Summary</th>
                  <th className="py-3 px-4 font-bold">Hearing Committee Rec</th>
                  <th className="py-3 px-4 font-bold text-center">Council Final Decision (Yes / No)</th>
                  <th className="py-3 px-4 text-right font-bold">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listLoading ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-slate-500">
                      <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-normal">Loading administrative ledger...</p>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-slate-500">
                      <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#0F172A]">No applications found in ledger</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((app) => {
                    const stageSummary = getStageSummary(app);
                    const hearingBadge = getHearingRecommendationBadge(app);
                    const isDecided = app.status === "approved" || app.status === "rejected" || app.decision;
                    const isApproved = app.status === "approved" || app.decision?.outcome === "APPROVED";
                    const isProcessing = actionInProgressId === app.id;

                    return (
                      <tr key={app.id} className="hover:bg-slate-50/80 transition-colors duration-150">
                        {/* 1. Application & Institute */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 font-mono font-bold text-[#0F172A]">
                            <Link href={`/aicte/applications/${app.id}`} className="text-[#1E40AF] hover:text-[#1E3A8A] hover:underline">
                              {app.applicationNumber}
                            </Link>
                          </div>
                          <p className="font-bold text-[#0F172A] mt-0.5 max-w-xs truncate">
                            {app.institutionName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {app.regionName || "Western Region"} • {getApplicationCategoryLabel(app.category || app.applicationCategory)}
                          </p>
                        </td>

                        {/* 2. Current Stage & Regulatory Status */}
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-[#0F172A]">{app.currentStageName || "Scrutiny"}</p>
                          <div className="mt-1">
                            <StatusBadge status={app.status} />
                          </div>
                        </td>

                        {/* 3. Stage-by-Stage History Summary Column */}
                        <td className="py-3.5 px-4 text-[11px]">
                          <div className="space-y-1.5 max-w-sm">
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-slate-700 shrink-0 w-16">Scrutiny:</span>
                              <span className="text-slate-600 truncate">{stageSummary.scrutiny}</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-slate-700 shrink-0 w-16">Hearing:</span>
                              <span className="text-slate-600 truncate">{stageSummary.hearing}</span>
                            </div>
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-slate-700 shrink-0 w-16">Decision:</span>
                              <span className="text-slate-600 truncate">{stageSummary.decision}</span>
                            </div>
                          </div>
                        </td>

                        {/* 4. Hearing Committee Recommendation */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${hearingBadge.color}`}>
                            {hearingBadge.label}
                          </span>
                        </td>

                        {/* 5. Final Decision (Yes / No) with Backend Connection */}
                        <td className="py-3.5 px-4 text-center">
                          {isDecided ? (
                            <div className="inline-flex flex-col items-center">
                              {isApproved ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  YES — APPROVED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">
                                  <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                                  NO — REJECTED
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                Order Dispatched
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                disabled={isProcessing}
                                onClick={() => handleAdminQuickDecision(app.id, "approved")}
                                className="h-7 text-xs px-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-md shadow-xs gap-1 cursor-pointer"
                                title="Approve Application (Final Yes) - Dispatches LoA/EoA to Institute & completes queue"
                              >
                                {isProcessing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                                <span>Yes (Approve)</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isProcessing}
                                onClick={() => handleAdminQuickDecision(app.id, "rejected")}
                                className="h-7 text-xs px-2 text-rose-700 border-rose-200 hover:bg-rose-50 font-semibold rounded-md cursor-pointer"
                                title="Reject Application (Final No) - Issues rejection letter"
                              >
                                <span>No (Reject)</span>
                              </Button>
                            </div>
                          )}
                        </td>

                        {/* 6. Review Dossier */}
                        <td className="py-3.5 px-4 text-right">
                          <Link href={`/aicte/applications/${app.id}`}>
                            <Button size="sm" className="h-7 text-xs px-2.5 bg-[#1E40AF] hover:bg-[#1E3A8A] text-white font-medium rounded-md transition-all shadow-xs">
                              Review
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          // Applications List Table
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/90 text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  <th className="py-3 px-4 font-bold">Application ID</th>
                  <th className="py-3 px-4 font-bold">Institution & Region</th>
                  <th className="py-3 px-4 font-bold">Statutory Workflow Stage</th>
                  <th className="py-3 px-4 font-bold">Priority & Escalation</th>
                  <th className="py-3 px-4 font-bold">Regulatory Status</th>
                  <th className="py-3 px-4 font-bold">SLA Countdown</th>
                  <th className="py-3 px-4 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listLoading ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-slate-500">
                      <Loader2 className="h-7 w-7 animate-spin text-slate-400 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 font-normal">Loading applications...</p>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-slate-500">
                      <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-[#0F172A]">No applications match current filters</p>
                      <p className="text-xs text-slate-500 mt-0.5 font-normal">Try switching queue tabs or resetting your search term</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/80 transition-colors duration-150">
                      <td className="py-3 px-4 font-mono font-bold text-[#0F172A]">
                        <Link href={`/aicte/applications/${app.id}`} className="text-[#1E40AF] hover:text-[#1E3A8A] hover:underline transition-all flex items-center gap-1">
                          {app.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-[#0F172A] truncate max-w-xs">
                          {app.institutionName}
                        </p>
                        <p className="text-[11px] text-slate-500">{app.regionName || "Western Region"} • {getApplicationCategoryLabel(app.category || app.applicationCategory)}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-[#0F172A]">{app.currentStageName}</p>
                        {app.nextLevelName && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[#1E40AF] font-medium">
                            <ArrowRight className="h-2.5 w-2.5" /> Next: {app.nextLevelName}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          app.priority === "URGENT"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : app.priority === "IMPORTANT"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-slate-100 text-slate-800 border border-slate-200"
                        }`}>
                          {app.priority}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[150px]">
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
                            className="h-7 text-xs px-2 text-slate-600 hover:text-[#0F172A] font-normal"
                          >
                            Delegate
                          </Button>
                          <Link href={`/aicte/applications/${app.id}`}>
                            <Button size="sm" className="h-7 text-xs px-2.5 bg-[#1E40AF] hover:bg-[#1E3A8A] text-white font-medium rounded-md transition-all shadow-xs">
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
        <div className="p-3 border-t border-[#E5EDF5] bg-[#F8FAFD] flex items-center justify-between text-xs text-slate-500 font-normal">
          <span>Displaying {filteredItems.length} active regulatory items</span>
          <span className="font-mono text-[11px] text-slate-400">AICTE Approval Grid v2.4 • Live Sync</span>
        </div>
      </Card>

      {/* ─── SECTION 4: HIERARCHY & BUREAU WORKLOAD (Stripe Administrative Architecture) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Work Tree Snapshot */}
        <Card className="p-4 sm:p-5 border border-slate-200/90 bg-white/92 backdrop-blur-xs rounded-xl shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-[#1E40AF]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                Official Hierarchy Flow
              </h3>
            </div>
            <Link href="/aicte/my-work-tree">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-[#1E40AF] font-semibold p-0 hover:text-[#1E3A8A]">
                View Full Tree →
              </Button>
            </Link>
          </div>

          <div className="space-y-2 text-xs">
            {supervisor ? (
              <div className="p-3 rounded-[6px] bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-[4px] bg-slate-200 text-[#0F172A] flex items-center justify-center font-bold text-xs">
                    {supervisor.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Supervising Authority</span>
                    <p className="font-bold text-[#0F172A]">{supervisor.name}</p>
                    <p className="text-[11px] text-slate-500 font-normal">{supervisor.designation} • {supervisor.organizationUnit}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-[4px] border border-slate-200">{supervisor.employeeCode}</span>
              </div>
            ) : (
              <p className="text-slate-400 italic font-normal">Apex Authority Station</p>
            )}

            {/* Vertical connector line */}
            <div className="pl-6 py-0.5 text-[#1E40AF]/40 font-mono text-xs">
              │
            </div>

            <div className="p-3 rounded-[6px] bg-blue-50/60 border border-blue-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-[4px] bg-[#1E40AF] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {firstName[0]}
                </div>
                <div>
                  <span className="text-[10px] text-[#1E40AF] font-bold uppercase">Your Desk (Current Station)</span>
                  <p className="font-bold text-[#0F172A]">{userProfile?.name || "Official"}</p>
                  <p className="text-[11px] text-slate-600 font-normal">{userProfile?.designation?.title || "Approval Officer"}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-[4px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                {availability?.status || "AVAILABLE"}
              </span>
            </div>
          </div>
        </Card>

        {/* Bureau Team Workload */}
        <Card className="p-4 sm:p-5 border border-slate-200/90 bg-white/92 backdrop-blur-xs rounded-xl shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1E40AF]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                {teamWorkload?.teamMembers?.length > 0 ? "Bureau Team Workload" : "Colleague Workload"}
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {teamWorkload?.teamMembers?.length || 0} Officers Active
            </span>
          </div>

          <div className="space-y-2.5 max-h-[175px] overflow-y-auto text-xs pr-1">
            {teamWorkload?.teamMembers && teamWorkload.teamMembers.length > 0 ? (
              teamWorkload.teamMembers.slice(0, 5).map((member) => (
                <div key={member.id} className="p-2.5 rounded-[6px] bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-[4px] bg-blue-100 text-[#1E40AF] flex items-center justify-center font-bold text-xs">
                      {member.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-bold text-[#0F172A]">{member.name}</p>
                      <p className="text-[10px] text-slate-500 font-normal">{member.designation}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Horizontal progress capacity bar */}
                    <div className="hidden sm:block w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#2563EB] h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (member.activeCount / 8) * 100)}%` }}
                      />
                    </div>

                    <span className="text-[11px] font-mono text-[#0F172A] font-semibold">
                      {member.activeCount} <span className="font-normal text-slate-400">cases</span>
                    </span>

                    {member.urgentCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                        {member.urgentCount} urgent
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-center py-6 italic text-xs font-normal">
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
