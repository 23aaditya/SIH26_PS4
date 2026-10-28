"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORIES, APPLICATION_CATEGORY_LABELS, getApplicationCategoryLabel } from "@/lib/types";
import { Search, FileText, User, ArrowRight, ShieldCheck, ArrowUpRight, Inbox } from "lucide-react";

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

function getWorkingOfficer(app, userProfile) {
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
    name: userProfile?.name || "Dr. R. K. Sharma",
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
      assignedOfficer: "Member Secretary / Council",
    };
  }

  return null;
}
const AICTE_ROLES = [
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
];

function ApplicationQueueContent() {
  const { userProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  useEffect(() => {
    async function fetchQueue() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/aicte/scrutiny/applications`, {
          headers: {
            "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
          },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setApps(data);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Could not fetch from scrutiny API:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchQueue();
  }, [userProfile, API_BASE]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const inst = dataService.getInstitutionById(app.institutionId);
      const matchesSearch =
        search === "" ||
        app.applicationNumber.toLowerCase().includes(search.toLowerCase()) ||
        (inst && inst.institutionName.toLowerCase().includes(search.toLowerCase())) ||
        app.currentStageName.toLowerCase().includes(search.toLowerCase());
      const matchesStage =
        selectedStage === "all" ||
        (selectedStage === "scrutiny" && app.currentStageId === "scrutiny") ||
        (selectedStage === "clarification" && app.status === "awaiting_institution") ||
        (selectedStage === "evc" && app.status === "pending_evc") ||
        (selectedStage === "committee" && app.status === "awaiting_committee") ||
        (selectedStage === "approved" && app.status === "approved");
      const matchesRegion = selectedRegion === "all" || app.regionId === selectedRegion;
      const matchesCategory = selectedCategory === "all" || app.applicationCategory === selectedCategory;
      let matchesSla = true;
      if (slaFilter === "overdue") {
        matchesSla = !!app.dueAt && new Date(app.dueAt).getTime() < Date.now();
      } else if (slaFilter === "urgent") {
        matchesSla =
          !!app.dueAt &&
          new Date(app.dueAt).getTime() - Date.now() < 3 * 24 * 3600 * 1000 &&
          new Date(app.dueAt).getTime() > Date.now();
      }
      return matchesSearch && matchesStage && matchesRegion && matchesCategory && matchesSla;
    });
  }, [apps, search, selectedStage, selectedRegion, selectedCategory, slaFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Statutory Application Review Queue
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Regulatory case management, scrutiny verification, EVC inspection coordination, and council approvals
          </p>
        </div>

        <Link href="/aicte/dashboard">
          <Button variant="outline" size="sm" className="h-9 px-3.5 text-xs font-semibold text-slate-700 border-slate-200 hover:border-slate-300 rounded-lg shadow-2xs">
            Operational Dashboard
          </Button>
        </Link>
      </div>

      {/* Filter and Search Console (Mixpanel Recessed Control) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3.5">
        {/* Stage Filter Segmented Pill Container */}
        <div className="bg-slate-200/70 p-1 rounded-xl flex items-center overflow-x-auto gap-0.5">
          {[
            { id: "all", label: "All Cases" },
            { id: "scrutiny", label: "Regional Scrutiny" },
            { id: "clarification", label: "Deficiency Pending" },
            { id: "evc", label: "EVC Inspections" },
            { id: "committee", label: "Committee Hearings" },
            { id: "approved", label: "Approved Orders" },
          ].map((tab) => {
            const isActive = selectedStage === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedStage(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "bg-white text-slate-950 shadow-2xs font-bold border border-slate-200/60"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID or college..."
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-indigo-500 shadow-2xs"
            />
          </div>

          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-indigo-500 shadow-2xs"
          >
            <option value="all">All Regional Bureaus</option>
            <option value="western">Western (Mumbai)</option>
            <option value="northern">Northern (New Delhi)</option>
            <option value="southern">Southern (Chennai)</option>
            <option value="eastern">Eastern (Kolkata)</option>
            <option value="south_west">South-West (Bengaluru)</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-indigo-500 shadow-2xs"
          >
            <option value="all">All Categories</option>
            {APPLICATION_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {APPLICATION_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>

          <select
            value={slaFilter}
            onChange={(e) => setSlaFilter(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 outline-none focus:border-indigo-500 shadow-2xs"
          >
            <option value="all">All SLA Timelines</option>
            <option value="urgent">Due Soon (&lt; 3 Days)</option>
            <option value="overdue">Overdue Violations</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Application ID</th>
                <th className="py-3 px-4">Institution & Region</th>
                <th className="py-3 px-4">Statutory Category</th>
                <th className="py-3 px-4">Current Workflow Stage</th>
                <th className="py-3 px-4">Regulatory Status</th>
                <th className="py-3 px-4">SLA Countdown</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-500">
                    <Inbox className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">No applications match criteria</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try resetting the stage or region filters</p>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  const inst = dataService.getInstitutionById(app.institutionId);
                  const workingOfficer = getWorkingOfficer(app, userProfile);
                  const nextLevel = getNextLevelInfo(app);
                  return (
                    <tr key={app.id} className="hover:bg-indigo-50/20 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <Link href={`/aicte/applications/${app.id}`} className="hover:underline text-indigo-600 flex items-center gap-1">
                          {app.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900 truncate max-w-xs">
                          {inst?.institutionName || "College of Engineering"}
                        </p>
                        <p className="text-[11px] text-slate-400 capitalize">{app.regionId} Region</p>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {getApplicationCategoryLabel(app?.applicationCategory)}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-800">{app.currentStageName}</p>
                        {workingOfficer && (
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-600">
                            <User className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700">{workingOfficer.name}</span>
                            <span className="text-[10px] text-slate-400">({workingOfficer.role})</span>
                          </div>
                        )}
                        {nextLevel && (
                          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-indigo-600 font-medium">
                            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                            <span>Next: {nextLevel.stageName}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status} />
                      </td>
                      <td className="py-3 px-4">
                        <SlaCountdown dueAt={app.dueAt} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/aicte/applications/${app.id}`}>
                          <Button size="sm" className="h-7 text-xs px-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg shadow-2xs">
                            Review Case
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
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium">Displaying {filteredApps.length} active regulatory cases</span>
          <span className="font-mono text-[11px] text-slate-400">AICTE Approval Grid v2.4</span>
        </div>
      </Card>
    </div>
  );
}

export default function ApplicationQueuePage() {
  return (
    <RequireRole roles={[...AICTE_ROLES]}>
      <ApplicationQueueContent />
    </RequireRole>
  );
}
