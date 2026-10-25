"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  ShieldAlert,
  Search,
  UserCheck,
  Edit2,
  CheckCircle2,
  Clock,
  History,
  AlertCircle,
  Filter,
  X,
  Users,
} from "lucide-react";

export function StaffManagementModule({ currentStaff }) {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [committeeFilter, setCommitteeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalStaff, setTotalStaff] = useState(0);

  // Edit Modal State
  const [editingStaff, setEditingStaff] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [selectedCommittees, setSelectedCommittees] = useState([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  // Audit Logs State
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

  const loadStaff = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "15");
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (committeeFilter) params.set("committee", committeeFilter);

      const res = await fetch(`${API_BASE}/admin/staff?${params.toString()}`, {
        credentials: "include",
        headers: { "x-user-id": currentStaff?.employeeCode || "DEMO-AIC-001" },
      });
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.staff || []);
        setTotalStaff(data.total || 0);
      }
    } catch (e) {
      console.error("Failed to load staff list", e);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await fetch(`${API_BASE}/admin/audit-logs?limit=30`, {
        credentials: "include",
        headers: { "x-user-id": currentStaff?.employeeCode || "DEMO-AIC-001" },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, [page, search, roleFilter, committeeFilter]);

  const handleOpenEdit = (staff) => {
    setEditingStaff(staff);
    setSelectedRoles([...staff.platformRoles]);
    setSelectedCommittees(
      staff.committeeMemberships.map((cm) => ({
        committeeCode: cm.committeeCode,
        committeeRole: cm.role || "MEMBER",
        docketNumber: cm.docket || "",
      }))
    );
    setReason("Administrative assignment via Super Admin console");
    setSaveSuccess("");
    setSaveError("");
  };

  const handleSaveRolesAndCommittees = async () => {
    if (!editingStaff) return;
    setSaving(true);
    setSaveSuccess("");
    setSaveError("");

    try {
      // 1. Update Platform Roles
      const roleRes = await fetch(`${API_BASE}/admin/staff/${editingStaff.employeeCode}/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentStaff?.employeeCode || "DEMO-AIC-001",
        },
        credentials: "include",
        body: JSON.stringify({
          roles: selectedRoles,
          reason,
        }),
      });

      if (!roleRes.ok) {
        const d = await roleRes.json();
        throw new Error(d.error || "Failed to update platform roles");
      }

      // 2. Update Committee Memberships
      const commRes = await fetch(`${API_BASE}/admin/staff/${editingStaff.employeeCode}/committees`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": currentStaff?.employeeCode || "DEMO-AIC-001",
        },
        credentials: "include",
        body: JSON.stringify({
          committees: selectedCommittees,
          reason,
        }),
      });

      if (!commRes.ok) {
        const d = await commRes.json();
        throw new Error(d.error || "Failed to update committees");
      }

      setSaveSuccess(`Authorities successfully updated for ${editingStaff.name}!`);
      setTimeout(() => {
        setEditingStaff(null);
        loadStaff();
      }, 1200);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const AVAILABLE_ROLES = [
    { code: "SUPER_ADMIN", label: "Super Admin" },
    { code: "GOVERNANCE_AUTHORITY", label: "Governance Authority" },
    { code: "UNIT_HEAD", label: "Unit Head / Advisor" },
    { code: "REGIONAL_OFFICER", label: "Regional Officer" },
    { code: "REVIEWING_OFFICER", label: "Reviewing Officer" },
    { code: "COMMITTEE_MEMBER", label: "Committee Member" },
    { code: "READ_ONLY_AUDITOR", label: "Read-Only Auditor" },
    { code: "SUPPORT_STAFF", label: "Support Staff" },
  ];

  const AVAILABLE_COMMITTEES = [
    { code: "SCRUTINY", name: "Scrutiny Committee" },
    { code: "EVC", name: "Expert Visit Committee (EVC)" },
    { code: "SHC", name: "Standing Hearing Committee (SHC)" },
    { code: "SAC", name: "Standing Appellate Committee (SAC)" },
    { code: "SCSC", name: "Standing Complaints Committee (SCSC)" },
    { code: "EXECUTIVE_COMMITTEE", name: "Executive Committee (EC)" },
    { code: "COUNCIL", name: "AICTE Council" },
  ];

  return (
    <Card className="border-2 border-purple-200/90 shadow-sm bg-white overflow-hidden">
      <CardHeader className="p-4 sm:p-5 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white border-b border-purple-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-700 text-white shadow-xs">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold text-slate-900">
                AICTE Staff Directory & RBAC Authority Management
              </CardTitle>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">
                Super Admin Console
              </span>
            </div>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              100 synthetic staff members across Headquarters, Bureaus, Regional Offices and External Expert pools
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowAuditLogs(!showAuditLogs);
              if (!showAuditLogs) loadAuditLogs();
            }}
            className="text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            <History className="h-3.5 w-3.5 mr-1" />
            {showAuditLogs ? "Hide Audit Log" : "View Audit History"}
          </Button>
        </div>
      </CardHeader>

      {/* Audit Log Drawer */}
      {showAuditLogs && (
        <div className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-purple-600" />
              Platform Role & Committee Audit Trail (Immutable Log)
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              Showing recent authority modifications
            </span>
          </div>

          {loadingAudit ? (
            <div className="py-6 text-center text-xs text-slate-400">Loading audit events...</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-400">No modifications logged yet</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg border border-slate-200 bg-white text-xs flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-bold text-purple-700 uppercase tracking-wider text-[10px] bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 mr-2">
                      {log.actionType}
                    </span>
                    <span className="text-slate-700 font-medium">Target: {log.target}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {log.reason} • Previous: <code className="text-slate-600">{log.previousValue || "none"}</code> → New: <code className="text-slate-800 font-semibold">{log.newValue}</code>
                    </p>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 whitespace-nowrap">
                    <div>by {log.actor}</div>
                    <div>{new Date(log.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name, employee code, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8 rounded-lg border-slate-200"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-8 text-xs rounded-lg border border-slate-200 px-2.5 bg-white text-slate-700"
          >
            <option value="">All Platform Roles</option>
            {AVAILABLE_ROLES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>

          <select
            value={committeeFilter}
            onChange={(e) => setCommitteeFilter(e.target.value)}
            className="h-8 text-xs rounded-lg border border-slate-200 px-2.5 bg-white text-slate-700"
          >
            <option value="">All Committees</option>
            {AVAILABLE_COMMITTEES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-3">Emp Code</th>
              <th className="py-2.5 px-3">Staff Member</th>
              <th className="py-2.5 px-3">Designation & Org Unit</th>
              <th className="py-2.5 px-3">Platform Roles</th>
              <th className="py-2.5 px-3">Active Committees</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  Loading staff directory...
                </td>
              </tr>
            ) : staffList.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400">
                  No staff members matched your filter criteria
                </td>
              </tr>
            ) : (
              staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50/70 transition">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                    {staff.employeeCode}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-900">{staff.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{staff.email}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800">{staff.designation}</div>
                    <div className="text-[11px] text-slate-500">{staff.organizationUnit}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      {staff.platformRoles.map((r) => (
                        <span
                          key={r}
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            r === "SUPER_ADMIN"
                              ? "bg-purple-100 text-purple-700 border-purple-200"
                              : r === "GOVERNANCE_AUTHORITY"
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {staff.committeeMemberships.length > 0 ? (
                        staff.committeeMemberships.map((cm) => (
                          <span
                            key={cm.committeeCode}
                            className="text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded"
                          >
                            {cm.committeeCode}: {cm.role}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-300 text-[10px]">None</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(staff)}
                      className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Manage Roles
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
        <div>
          Showing page <strong>{page}</strong> of <strong>{Math.ceil(totalStaff / 15) || 1}</strong> ({totalStaff} total staff)
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-7 text-xs"
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= Math.ceil(totalStaff / 15)}
            onClick={() => setPage((p) => p + 1)}
            className="h-7 text-xs"
          >
            Next
          </Button>
        </div>
      </div>

      {/* Role & Committee Edit Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Update Authority: {editingStaff.name} ({editingStaff.employeeCode})
                </h3>
                <p className="text-xs text-slate-500">
                  {editingStaff.designation} • {editingStaff.organizationUnit}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {saveSuccess && (
              <div className="mt-3 p-2 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {saveSuccess}
              </div>
            )}

            {saveError && (
              <div className="mt-3 p-2 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> {saveError}
              </div>
            )}

            <div className="mt-4 space-y-4 text-xs">
              {/* Platform Roles Selection */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Platform Roles (Multi-select)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_ROLES.map((r) => {
                    const isChecked = selectedRoles.includes(r.code);
                    return (
                      <label
                        key={r.code}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                          isChecked
                            ? "border-purple-300 bg-purple-50/50 text-purple-900 font-semibold"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRoles([...selectedRoles, r.code]);
                            } else {
                              setSelectedRoles(selectedRoles.filter((c) => c !== r.code));
                            }
                          }}
                          className="rounded border-slate-300 text-purple-600"
                        />
                        <span className="text-[11px]">{r.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Committee Memberships Selection */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Assigned Committees & Pools
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_COMMITTEES.map((c) => {
                    const existing = selectedCommittees.find((cm) => cm.committeeCode === c.code);
                    const isChecked = Boolean(existing);
                    return (
                      <label
                        key={c.code}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                          isChecked
                            ? "border-emerald-300 bg-emerald-50/50 text-emerald-900 font-semibold"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCommittees([
                                ...selectedCommittees,
                                { committeeCode: c.code, committeeRole: "MEMBER", docketNumber: `DEMO-${c.code}-DOCKET-01` },
                              ]);
                            } else {
                              setSelectedCommittees(
                                selectedCommittees.filter((cm) => cm.committeeCode !== c.code)
                              );
                            }
                          }}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        <span className="text-[11px] truncate">{c.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Justification / Reason */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Audit Justification / Order Reference
                </label>
                <Input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. AICTE Office Order Ref #2026/RO-04"
                  className="h-8 text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingStaff(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveRolesAndCommittees}
                disabled={saving}
                className="text-xs bg-purple-700 hover:bg-purple-800 text-white shadow-xs"
              >
                {saving ? "Saving Changes..." : "Commit Authority Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
