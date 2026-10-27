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
import { Search, FileText, } from "lucide-react";
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
            const matchesSearch = search === "" ||
                app.applicationNumber.toLowerCase().includes(search.toLowerCase()) ||
                (inst && inst.institutionName.toLowerCase().includes(search.toLowerCase())) ||
                app.currentStageName.toLowerCase().includes(search.toLowerCase());
            const matchesStage = selectedStage === "all" ||
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
            }
            else if (slaFilter === "urgent") {
                matchesSla =
                    !!app.dueAt &&
                        new Date(app.dueAt).getTime() - Date.now() < 3 * 24 * 3600 * 1000 &&
                        new Date(app.dueAt).getTime() > Date.now();
            }
            return matchesSearch && matchesStage && matchesRegion && matchesCategory && matchesSla;
        });
    }, [apps, search, selectedStage, selectedRegion, selectedCategory, slaFilter]);
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Official Application Review Queue
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Regulatory case management, scrutiny verification, EVC coordination, and final approvals
          </p>
        </div>
      </div>

      {/* Filter and Search Console */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-2xs space-y-3">
        {/* Stage Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "all", label: "All Cases" },
            { id: "scrutiny", label: "Regional Scrutiny" },
            { id: "clarification", label: "Deficiency Pending" },
            { id: "evc", label: "EVC Inspections" },
            { id: "committee", label: "Committee Hearings" },
            { id: "approved", label: "Approved Orders" },
        ].map((tab) => (<button key={tab.id} onClick={() => setSelectedStage(tab.id)} className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${selectedStage === tab.id
                ? "bg-slate-900 text-white font-semibold shadow-xs"
                : "text-slate-600 hover:bg-slate-100"}`}>
              {tab.label}
            </button>))}
        </div>

        {/* Dropdowns & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"/>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by ID or college..." className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-500"/>
          </div>

          <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)} className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700 outline-none">
            <option value="all">All Regional Bureaus</option>
            <option value="western">Western (Mumbai)</option>
            <option value="northern">Northern (New Delhi)</option>
            <option value="southern">Southern (Chennai)</option>
            <option value="eastern">Eastern (Kolkata)</option>
            <option value="south_west">South-West (Bengaluru)</option>
          </select>

          <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700 outline-none">
            <option value="all">All Categories</option>
            {APPLICATION_CATEGORIES.map((cat) => (<option key={cat} value={cat}>
                {APPLICATION_CATEGORY_LABELS[cat]}
              </option>))}
          </select>

          <select value={slaFilter} onChange={(e) => setSlaFilter(e.target.value)} className="h-8 px-2.5 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-700 outline-none">
            <option value="all">All SLA Timelines</option>
            <option value="urgent">Due Soon (&lt; 3 Days)</option>
            <option value="overdue">Overdue Violations</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Application Number</th>
                <th className="py-3 px-4">Institution & Region</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Current Workflow Stage</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">SLA Deadline</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApps.length === 0 ? (<tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2"/>
                    <p className="text-sm font-semibold text-slate-700">No applications match criteria</p>
                    <p className="text-xs text-slate-400 mt-1">Try resetting the stage or region filters</p>
                  </td>
                </tr>) : (filteredApps.map((app) => {
            const inst = dataService.getInstitutionById(app.institutionId);
            return (<tr key={app.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        <Link href={`/aicte/applications/${app.id}`} className="hover:underline text-blue-600 flex items-center gap-1">
                          {app.applicationNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 truncate max-w-xs">
                          {inst?.institutionName || "College of Engineering"}
                        </p>
                        <p className="text-[11px] text-slate-400 capitalize">{app.regionId} Region</p>
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {getApplicationCategoryLabel(app?.applicationCategory)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {app.currentStageName}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={app.status}/>
                      </td>
                      <td className="py-3 px-4">
                        <SlaCountdown dueAt={app.dueAt}/>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link href={`/aicte/applications/${app.id}`}>
                          <Button size="sm" className="h-7 text-xs bg-slate-900 hover:bg-slate-800 text-white font-medium">
                            Review Case
                          </Button>
                        </Link>
                      </td>
                    </tr>);
        }))}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredApps.length} active regulatory cases</span>
          <span className="font-mono text-[11px]">AICTE Official Portal v2.4</span>
        </div>
      </Card>
    </div>);
}
export default function ApplicationQueuePage() {
    return (<RequireRole roles={[...AICTE_ROLES]}>
      <ApplicationQueueContent />
    </RequireRole>);
}
