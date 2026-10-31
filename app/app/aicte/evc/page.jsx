"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dataService } from "@/lib/dataService";
import { Plus, } from "lucide-react";
const EVC_ROLES = ["evc_coordinator", "regional_officer", "bureau_officer", "admin"];
function EvcContent() {
    const { userProfile } = useAuth();
    const [visits, setVisits] = useState(() => dataService.getEvcVisits());
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [formAppId, setFormAppId] = useState("app-2026-0041");
    const [formDate, setFormDate] = useState("2026-11-08");
    const [formExperts, setFormExperts] = useState("Prof. R. C. Mittal (IIT Roorkee), Dr. P. Sneha (NIT Warangal)");
    const [formNotes, setFormNotes] = useState("Physical inspection of computing labs, bandwidth NOC, and Divyangjan accessibility.");
    const reloadData = () => {
        setVisits(dataService.getEvcVisits());
    };
    const handleScheduleSubmit = () => {
        dataService.scheduleEvc({
            applicationId: formAppId,
            institutionId: "inst-001",
            regionId: "western",
            scheduledAt: new Date(formDate).toISOString(),
            assignedExperts: formExperts.split(",").map((s) => s.trim()),
            notes: formNotes,
        }, { uid: userProfile?.uid || "aicte-evc-1", role: "evc_coordinator" });
        setShowScheduleModal(false);
        reloadData();
    };
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Expert Visiting Committee (EVC) Operations
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Scheduling physical and virtual inspection panels, assigning university experts, and tracking reports
          </p>
        </div>
        <Button size="sm" onClick={() => setShowScheduleModal(true)} className="bg-[#1E40AF] hover:bg-[#1E3A8A] text-white text-xs shadow-xs">
          <Plus className="h-3.5 w-3.5 mr-1"/> Schedule Inspection Panel
        </Button>
      </div>

      {/* Visits Table */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-900">
              Active EVC Inspection Schedules ({visits.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Physical on-site and hybrid committee inspections
            </CardDescription>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Application ID</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Scheduled Date</th>
                <th className="py-3 px-4">Assigned Expert Panel</th>
                <th className="py-3 px-4">Inspection Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visits.map((v) => {
            const app = dataService.getApplicationById(v.applicationId);
            const inst = dataService.getInstitutionById(v.institutionId);
            return (<tr key={v.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <Link href={`/aicte/applications/${v.applicationId}`} className="text-blue-600 hover:underline">
                        {app?.applicationNumber || v.applicationId}
                      </Link>
                      <p className="text-[11px] font-sans font-medium text-slate-600 mt-0.5 truncate max-w-xs">
                        {inst?.institutionName}
                      </p>
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-700 font-medium">
                      {v.regionId}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {v.scheduledAt
                    ? new Date(v.scheduledAt).toLocaleDateString("en-IN", {
                        dateStyle: "medium",
                    })
                    : "TBD"}
                    </td>
                    <td className="py-3 px-4 max-w-sm">
                      <ul className="text-[11px] text-slate-700 list-disc pl-4 space-y-0.5">
                        {v.assignedExperts.map((exp, i) => (<li key={i}>{exp}</li>))}
                      </ul>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${v.status === "scheduled"
                    ? "bg-blue-50 text-blue-800 border border-blue-200"
                    : v.status === "report_received"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${v.status === "scheduled"
                    ? "bg-blue-600"
                    : v.status === "report_received"
                        ? "bg-emerald-600"
                        : "bg-amber-600"}`}/>
                        {v.status.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/aicte/applications/${v.applicationId}`}>
                        <Button variant="outline" size="sm" className="h-7 text-xs px-2.5">
                          View Case
                        </Button>
                      </Link>
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal} title="Schedule Expert Visiting Committee" description="Establish inspection panel and dispatch appointment letters">
        <div className="space-y-3.5 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Target Application ID</Label>
            <Input value={formAppId} onChange={(e) => setFormAppId(e.target.value)} className="h-8 text-xs font-mono"/>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Visit Date</Label>
            <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="h-8 text-xs"/>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Expert Members (Comma-separated)
            </Label>
            <Input value={formExperts} onChange={(e) => setFormExperts(e.target.value)} className="h-8 text-xs"/>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Inspection Terms</Label>
            <Textarea rows={3} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="text-xs"/>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowScheduleModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleScheduleSubmit} className="bg-[#1E40AF] hover:bg-[#1E3A8A] text-white">
              Confirm Schedule
            </Button>
          </div>
        </div>
      </Dialog>
    </div>);
}
export default function EvcPage() {
    return (<RequireRole roles={[...EVC_ROLES]}>
      <EvcContent />
    </RequireRole>);
}
