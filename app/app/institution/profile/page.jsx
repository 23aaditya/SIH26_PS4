"use client";
import React, { useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataService } from "@/lib/dataService";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
function ProfileContent() {
    const { userProfile } = useAuth();
    const institution = dataService.getInstitutionById(userProfile?.institutionId || "inst-001");
    const [saved, setSaved] = useState(false);
    const [formData, setFormData] = useState({
        institutionName: institution?.institutionName || "Pune Institute of Computer Technology",
        institutionCode: institution?.institutionCode || "1-482910381",
        address: institution?.address || "Survey No. 27, Near Trimurti Chowk, Dhankawadi",
        city: institution?.city || "Pune",
        state: institution?.state || "Maharashtra",
        contactEmail: institution?.contactEmail || "principal@pict.edu",
        contactPhone: institution?.contactPhone || "+91 20 2437 1101",
        headName: "Dr. P. T. Kulkarni",
        headDesignation: "Principal & Member Secretary",
        affiliatingUniversity: "Savitribai Phule Pune University (SPPU)",
    });
    const handleSave = (e) => {
        e.preventDefault();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              Permanent PID: {formData.institutionCode}
            </span>
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5"/> AICTE Accredited
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            {formData.institutionName}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Statutory registry and institutional contact information
          </p>
        </div>
      </div>

      {saved && (<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600"/>
          Institutional profile changes saved successfully.
        </div>)}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Core Statutory Info */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Statutory Registry Data
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Official records maintained with AICTE Western Regional Office
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-slate-700">Full Institution Name</Label>
                <Input value={formData.institutionName} onChange={(e) => setFormData({ ...formData, institutionName: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">AICTE Permanent Institute ID (PID)</Label>
                <Input value={formData.institutionCode} disabled className="mt-1 h-8 text-xs bg-slate-50 font-mono text-slate-600"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">Affiliating University</Label>
                <Input value={formData.affiliatingUniversity} onChange={(e) => setFormData({ ...formData, affiliatingUniversity: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">Campus Address</Label>
                <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">City / District</Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">State / UT</Label>
                <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Head of Institution Contact */}
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-4 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-900">
              Head of Institution / Signatory Authority
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Authorized officer responsible for regulatory filings and compliance affidavits
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-medium text-slate-700">Name of Principal / Director</Label>
                <Input value={formData.headName} onChange={(e) => setFormData({ ...formData, headName: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">Official Designation</Label>
                <Input value={formData.headDesignation} onChange={(e) => setFormData({ ...formData, headDesignation: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">Official Email</Label>
                <Input type="email" value={formData.contactEmail} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>

              <div>
                <Label className="text-xs font-medium text-slate-700">Office Telephone / Mobile</Label>
                <Input value={formData.contactPhone} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} className="mt-1 h-8 text-xs"/>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                Save Profile Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>);
}
export default function InstitutionProfilePage() {
    return (<RequireRole roles={["institution"]}>
      <ProfileContent />
    </RequireRole>);
}
