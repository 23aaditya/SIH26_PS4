"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocumentBadge } from "@/components/shared/StatusBadge";
import { dataService } from "@/lib/dataService";
import { ApplicationDocument } from "@/lib/types";
import {
  FolderLock,
  UploadCloud,
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  Eye,
} from "lucide-react";

function DocumentsContent() {
  const { userProfile } = useAuth();
  const [docs, setDocs] = useState<ApplicationDocument[]>(() =>
    dataService.getDocuments(undefined, userProfile?.institutionId || "inst-001")
  );
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const filtered = docs.filter((d) => {
    const matchesSearch =
      search === "" ||
      d.documentType.toLowerCase().includes(search.toLowerCase()) ||
      d.originalFilename.toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      filterType === "all" ||
      (filterType === "verified" && d.verificationStatus === "verified") ||
      (filterType === "expiring" &&
        d.expiryDate &&
        new Date(d.expiryDate).getTime() - Date.now() < 60 * 24 * 3600 * 1000);

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Institutional Document Repository
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Secure vault of statutory clearances, land deeds, building approvals, and accreditation letters
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => alert("Upload new document modal opened")}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs shadow-xs"
        >
          <UploadCloud className="h-3.5 w-3.5 mr-1.5" /> Upload Document
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-1">
          {[
            { id: "all", label: "All Documents" },
            { id: "verified", label: "AICTE Verified" },
            { id: "expiring", label: "Expiring Soon" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filterType === tab.id
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
            placeholder="Search documents..."
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
                <th className="py-3 px-4">Document Title</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Verification Status</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((doc) => {
                const isExpiring =
                  doc.expiryDate &&
                  new Date(doc.expiryDate).getTime() - Date.now() < 60 * 24 * 3600 * 1000;

                return (
                  <tr key={doc.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {doc.documentType}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {doc.originalFilename}
                    </td>
                    <td className="py-3 px-4">
                      <DocumentBadge status={doc.verificationStatus} />
                    </td>
                    <td className="py-3 px-4 text-xs">
                      {doc.expiryDate ? (
                        <span
                          className={`font-medium ${
                            isExpiring ? "text-rose-600 font-semibold" : "text-slate-700"
                          }`}
                        >
                          {new Date(doc.expiryDate).toLocaleDateString("en-IN", {
                            dateStyle: "medium",
                          })}
                          {isExpiring && (
                            <span className="ml-1.5 text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200">
                              Renew Soon
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">Permanent Validity</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => alert(`Previewing ${doc.originalFilename}`)}
                          className="h-7 text-xs px-2 text-slate-600 hover:text-slate-900"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1 text-slate-400" /> View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => alert(`Downloading ${doc.originalFilename}`)}
                          className="h-7 text-xs px-2"
                        >
                          <Download className="h-3.5 w-3.5 mr-1 text-slate-400" /> PDF
                        </Button>
                      </div>
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

export default function InstitutionDocumentsPage() {
  return (
    <RequireRole roles={["institution"]}>
      <DocumentsContent />
    </RequireRole>
  );
}
