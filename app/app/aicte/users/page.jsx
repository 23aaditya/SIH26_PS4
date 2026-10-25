"use client";
import React, { useState } from "react";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/types";
import { DEMO_USERS } from "@/lib/mockData";
function UserManagementContent() {
    const [users, setUsers] = useState(DEMO_USERS);
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            User, Officer & Role Directory
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            RBAC permissions, regional jurisdictional allocations, and committee rosters
          </p>
        </div>
      </div>

      {/* Users Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Officer / Official Name</th>
                <th className="py-3 px-4">Official Email</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Jurisdiction / Regions</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (<tr key={u.uid} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {u.displayName}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                    {u.email}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">
                    <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-200 text-xs">
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="py-3 px-4 capitalize text-slate-600">
                    {u.regionIds ? u.regionIds.join(", ") : u.institutionId ? "Institutional" : "National HQ"}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-semibold border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"/>
                      Active
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="outline" size="sm" onClick={() => alert(`Role permissions updated for ${u.displayName}`)} className="h-7 text-xs px-2">
                      Edit Role
                    </Button>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>);
}
export default function UserManagementPage() {
    return (<RequireRole roles={["admin", "bureau_officer"]}>
      <UserManagementContent />
    </RequireRole>);
}
