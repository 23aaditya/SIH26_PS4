"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentBadge } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { Search, Eye, AlertTriangle, FileText, Download } from "lucide-react";

const AICTE_ROLES = [
  "regional_officer",
  "bureau_officer",
  "scrutiny_committee",
  "evc_coordinator",
  "competent_authority",
  "admin",
] as const;

function DocumentValidityContent() {
  const [docs, setDocs] = useState(() => dataService.getDocuments());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = docs.filter((d) => {
    const matchesSearch =
      search === "" ||
      d.documentType.toLowerCase().includes(search.toLowerCase()) ||
      d.originalFilename.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "flagged" && d.verificationStatus === "rejected") ||
      (filter === "verified" && d.verificationStatus === "verified");

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Statutory Document Validity & Integrity
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Cross-institution audit verification registry for fire NOCs, land deeds, and municipal certificates
          </p>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-1">
          {[
            { id: "all", label: "All Repositories" },
            { id: "verified", label: "Audited & Verified" },
            { id: "flagged", label: "Flagged Deficiencies" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === tab.id
                  ? "bg-slate-900 text-white font-semibold shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search document title or file..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-500"
          />
        </div>
      </div>

      {/* Documents Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Application & Institution</th>
                <th className="py-3 px-4">Document Category</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Verification Audit</th>
                <th className="py-3 px-4">Validity Horizon</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((d) => {
                const app = dataService.getApplicationById(d.applicationId);
                const inst = dataService.getInstitutionById(d.institutionId);

                return (
                  <tr key={d.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 truncate max-w-xs">
                        {inst?.institutionName || "College"}
                      </p>
                      <Link
                        href={`/aicte/applications/${d.applicationId}`}
                        className="font-mono text-[11px] text-blue-600 hover:underline block mt-0.5"
                      >
                        {app?.applicationNumber || d.applicationId}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{d.documentType}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 truncate max-w-xs">
                      {d.originalFilename}
                    </td>
                    <td className="py-3 px-4">
                      <DocumentBadge status={d.verificationStatus} />
                    </td>
                    <td className="py-3 px-4">
                      {d.expiryDate ? (
                        <span className="font-medium text-slate-800">
                          {new Date(d.expiryDate).toLocaleDateString("en-IN", {
                            dateStyle: "medium",
                          })}
                        </span>
                      ) : (
                        <span className="text-slate-400">Permanent Validity</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => alert(`Reviewing document verification audit: ${d.originalFilename}`)}
                        className="h-7 text-xs px-2 text-slate-600 hover:text-slate-900"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1 text-slate-400" /> Audit File
                      </Button>
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

export default function DocumentValidityPage() {
  return (
    <RequireRole roles={[...AICTE_ROLES]}>
      <DocumentValidityContent />
    </RequireRole>
  );
}
