"use client";
import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORIES, APPLICATION_CATEGORY_LABELS } from "@/lib/types";
import { Plus, Search, FileText, Edit, ArrowRight, Loader2 } from "lucide-react";

function ApplicationsContent() {
  const { userProfile } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/applications/my`, {
        headers: {
          "x-user-id": userProfile?.uid || userProfile?.email || "principal@pict.edu",
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
      console.warn("Could not fetch from backend:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [userProfile]);

  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const typeLabel = app.applicationType?.name || APPLICATION_CATEGORY_LABELS[app.applicationCategory] || app.applicationCategory || "";
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
                    APPLICATION_CATEGORY_LABELS[app.applicationCategory] ||
                    app.applicationCategory ||
                    "General Application";
                  const isDraft = app.status === "draft";

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
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {isDraft ? "Draft Composition" : app.currentStageName || "Scrutiny Verification"}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                        {isDraft
                          ? "Complete required fields & upload documents"
                          : app.nextActionDescription || "Under examination by AICTE Scrutiny Committee"}
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
