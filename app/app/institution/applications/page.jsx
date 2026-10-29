"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { Plus, Search, FileText, Edit, ArrowRight, Loader2, User, AlertCircle, RefreshCw } from "lucide-react";
import { APPLICATION_CATEGORIES, APPLICATION_CATEGORY_LABELS, getApplicationCategoryLabel } from "@/lib/types";

const KNOWN_OFFICERS = {
  "DEMO-AIC-034": {
    name: "Dr. R. K. Sharma",
    code: "DEMO-AIC-034",
    role: "Scrutiny Committee Member",
    bureau: "Approval Bureau (Western/Northern)",
  },
  "DEMO-AIC-037": {
    name: "Dr. Neha Rao",
    code: "DEMO-AIC-037",
    role: "EVC Inspection Coordinator",
    bureau: "Regional Inspection Committee",
  },
  "DEMO-AIC-013": {
    name: "Shri Karan Sinha",
    code: "DEMO-AIC-013",
    role: "Regional Officer / Bureau Officer",
    bureau: "Standing Hearing & Approval Bureau",
  },
  "DEMO-AIC-001": {
    name: "Super Administrator",
    code: "DEMO-AIC-001",
    role: "AICTE Headquarter Executive",
    bureau: "Central Governance Council",
  },
};

function getWorkingOfficer(app) {
  if (!app) return null;
  if (app.workflowInstance?.stages) {
    const activeStage =
      app.workflowInstance.stages.find(
        (s) =>
          (s.stageKey === app.currentStageId || s.stageKey === app.workflowInstance?.currentStageKey) &&
          !["COMPLETED", "SKIPPED"].includes(s.stageStatus)
      ) ||
      app.workflowInstance.stages.find(
        (s) => s.stageStatus === "ASSIGNED" || s.stageStatus === "IN_PROGRESS"
      );

    if (activeStage?.assignedStaff) {
      return {
        name: activeStage.assignedStaff.name,
        code: activeStage.assignedStaff.employeeCode || activeStage.assignedStaff.id,
        role: activeStage.assignedStaff.role || activeStage.stageName,
      };
    }
  }

  if (app.assignedUserId && KNOWN_OFFICERS[app.assignedUserId]) {
    return KNOWN_OFFICERS[app.assignedUserId];
  }

  if (app.currentStageId === "scrutiny" || app.status === "in_review") {
    return KNOWN_OFFICERS["DEMO-AIC-034"];
  } else if (app.currentStageId === "evc" || app.status === "pending_evc") {
    return KNOWN_OFFICERS["DEMO-AIC-037"];
  } else if (app.currentStageId === "committee" || app.currentStageId === "decision") {
    return KNOWN_OFFICERS["DEMO-AIC-013"];
  }

  return {
    name: "Dr. R. K. Sharma",
    code: app.assignedUserId || "DEMO-AIC-034",
    role: app.currentAssigneeRole?.replace(/_/g, " ").toUpperCase() || "Scrutiny Officer",
  };
}

function getNextLevelInfo(app) {
  if (!app) return null;
  const currentKey = app.currentStageId || "scrutiny";

  if (currentKey === "verification") {
    return {
      stageName: "Scrutiny Review",
      assignedOfficer: "Dr. R. K. Sharma",
    };
  }

  if (currentKey === "scrutiny" || currentKey === "re_scrutiny") {
    if (app.requiresEvc) {
      return {
        stageName: "EVC Inspection",
        assignedOfficer: "Dr. Neha Rao",
      };
    } else {
      return {
        stageName: "Standing Hearing Committee",
        assignedOfficer: "Shri Karan Sinha",
      };
    }
  }

  if (currentKey === "evc") {
    return {
      stageName: "Standing Hearing Committee",
      assignedOfficer: "Shri Karan Sinha",
    };
  }

  if (currentKey === "committee") {
    return {
      stageName: "Competent Authority Approval",
      assignedOfficer: "Executive Committee",
    };
  }

  return null;
}

function ApplicationsContent() {
  const { userProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const fetchApplications = React.useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);
      const authUid = userProfile?.id || userProfile?.uid || userProfile?.email || "principal@pict.edu";
      const res = await fetch(`${API_BASE}/applications/my`, {
        headers: {
          "x-user-id": authUid,
        },
        credentials: "include",
        signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to fetch applications.`);
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setApps(data);
        setError(null);
      } else {
        setApps([]);
      }
    } catch (err) {
      if (err.name === "AbortError" || signal?.aborted) return;
      console.warn("Could not fetch from backend:", err);
      setError(err.message || "Failed to load application portfolio.");
      setApps([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [userProfile?.id, userProfile?.uid, userProfile?.email, API_BASE]);

  useEffect(() => {
    const controller = new AbortController();
    fetchApplications(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchApplications]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const typeLabel =
        app.applicationType?.name ||
        getApplicationCategoryLabel(app.applicationCategory) ||
        app.applicationCategory ||
        "";
      const stageName = app.currentStageName || "";
      const matchesSearch =
        search === "" ||
        app.applicationNumber.toLowerCase().includes(search.toLowerCase()) ||
        stageName.toLowerCase().includes(search.toLowerCase()) ||
        typeLabel.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "draft" && app.status === "draft") ||
        (selectedStatus === "active" && app.status !== "approved" && app.status !== "rejected" && app.status !== "draft") ||
        (selectedStatus === "action" && (app.status === "awaiting_institution" || app.status === "deficiency_raised")) ||
        (selectedStatus === "approved" && app.status === "approved");

      const matchesCategory = selectedCategory === "all" || app.applicationCategory === selectedCategory;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [apps, search, selectedStatus, selectedCategory]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            My Applications
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Official portfolio of AICTE approval requests, track stages, deadlines, and letters
          </p>
        </div>
        <Link href="/institution/applications/new">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs font-semibold">
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Application
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "all", label: "All Applications" },
            { id: "draft", label: "Drafts" },
            { id: "active", label: "In Review" },
            { id: "action", label: "Action Required" },
            { id: "approved", label: "Approved Orders" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                selectedStatus === tab.id
                  ? "bg-slate-900 text-white shadow-xs font-semibold"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID or type..."
              className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="all">All Categories</option>
            {APPLICATION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {APPLICATION_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Application No</th>
                <th className="py-3 px-4">Application Type / Category</th>
                <th className="py-3 px-4">Current Workflow Stage</th>
                <th className="py-3 px-4">Next Required Step</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">SLA Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Loader2 className="h-6 w-6 text-blue-600 animate-spin mx-auto mb-2" />
                    <p className="text-xs font-medium text-slate-700">Loading your applications...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-rose-600">
                    <AlertCircle className="h-7 w-7 text-rose-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-rose-900">Failed to load applications</p>
                    <p className="text-xs text-rose-600 mt-1">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchApplications()}
                      className="mt-3 text-xs border-rose-300 text-rose-800 hover:bg-rose-50"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" /> Try Again
                    </Button>
                  </td>
                </tr>
              ) : filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">No applications found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or create a new application</p>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  const typeLabel =
                    app.applicationType?.name ||
                    getApplicationCategoryLabel(app.applicationCategory) ||
                    app.applicationCategory ||
                    "General Application";
                  const isDraft = app.status === "draft";
                  const workingOfficer = getWorkingOfficer(app);
                  const nextLevel = getNextLevelInfo(app);
                  const needsAction = app.status === "awaiting_institution" || app.status === "deficiency_raised";

                  return (
                    <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        <Link
                          href={isDraft ? `/institution/applications/new?draftId=${app.id}` : `/institution/applications/${app.id}`}
                          className="hover:underline text-blue-600 flex items-center gap-1"
                        >
                          {app.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium max-w-xs truncate">
                        {typeLabel}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{isDraft ? "Draft Composition" : app.currentStageName || "Scrutiny Verification"}</p>
                        {!isDraft && workingOfficer && (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-600">
                            <User className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700">{workingOfficer.name}</span>
                            <span className="text-[10px] text-slate-400">({workingOfficer.role})</span>
                          </div>
                        )}
                        {!isDraft && nextLevel && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600 font-medium">
                            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                            <span>Next: {nextLevel.stageName}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-[11px] max-w-xs">
                        {isDraft ? (
                          <span className="text-slate-500">Complete required fields & upload documents</span>
                        ) : needsAction ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-900 font-semibold text-[10.5px]">
                            <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                            <span>Action: Re-Scrutiny / Grievance</span>
                          </div>
                        ) : (
                          <span>{app.nextActionDescription || `Under examination by ${workingOfficer?.name || "AICTE Scrutiny Committee"}`}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="py-3 px-4">
                        {isDraft ? <span className="text-slate-400">—</span> : <SlaCountdown dueAt={app.dueAt} />}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isDraft ? (
                          <Link href={`/institution/applications/new?draftId=${app.id}`}>
                            <Button size="sm" className="h-7 text-xs px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-2xs">
                              <Edit className="h-3 w-3 mr-1" />
                              Continue Draft
                            </Button>
                          </Link>
                        ) : needsAction ? (
                          <Link href={`/institution/applications/${app.id}`}>
                            <Button size="sm" className="h-7 text-xs px-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-2xs">
                              Take Action
                            </Button>
                          </Link>
                        ) : (
                          <Link href={`/institution/applications/${app.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                              View Details
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredApps.length} of {apps.length} applications</span>
          <span className="font-mono text-[11px]">AICTE ERP v2.4 • Dynamic Workflow</span>
        </div>
      </Card>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <RequireRole roles={["institution"]}>
      <ApplicationsContent />
    </RequireRole>
  );
}
