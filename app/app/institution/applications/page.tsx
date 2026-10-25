"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORIES, APPLICATION_CATEGORY_LABELS, ApplicationCategory, ApplicationStatus } from "@/lib/types";
import { Plus, Search, Filter, ArrowUpDown, ChevronRight, FileText, Download } from "lucide-react";

function ApplicationsContent() {
  const { userProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const apps = dataService.getApplications({ institutionId: userProfile?.institutionId || "inst-001" });

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesSearch =
        search === "" ||
        app.applicationNumber.toLowerCase().includes(search.toLowerCase()) ||
        app.currentStageName.toLowerCase().includes(search.toLowerCase()) ||
        APPLICATION_CATEGORY_LABELS[app.applicationCategory].toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        selectedStatus === "all" ||
        (selectedStatus === "active" && app.status !== "approved" && app.status !== "rejected") ||
        (selectedStatus === "action" && app.status === "awaiting_institution") ||
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
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shadow-xs text-xs">
            <Plus className="h-3.5 w-3.5" />
            New Application
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar (Stripe style) */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: "all", label: "All Applications" },
            { id: "active", label: "Active in Progress" },
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
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Current Workflow Stage</th>
                <th className="py-3 px-4">Next Required Step</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">SLA Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">No applications found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search query</p>
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      <Link
                        href={`/institution/applications/${app.id}`}
                        className="hover:underline text-blue-600 flex items-center gap-1"
                      >
                        {app.applicationNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {APPLICATION_CATEGORY_LABELS[app.applicationCategory]}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {app.currentStageName}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                      {app.nextActionDescription}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="py-3 px-4">
                      <SlaCountdown dueAt={app.dueAt} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/institution/applications/${app.id}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                          View Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filteredApps.length} of {apps.length} applications</span>
          <span className="font-mono text-[11px]">AICTE ERP v2.4</span>
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
