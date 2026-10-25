"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dataService } from "@/lib/dataService";
import {
  APPLICATION_CATEGORIES,
  APPLICATION_CATEGORY_LABELS,
  ApplicationCategory,
} from "@/lib/types";
import {
  Building2,
  GraduationCap,
  TrendingUp,
  FileText,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  UploadCloud,
  FileCheck2,
  AlertCircle,
  ShieldCheck,
  XCircle,
  PenLine,
} from "lucide-react";

const CATEGORY_DETAILS: Record<
  ApplicationCategory,
  { icon: typeof Building2; description: string; requirements: string[] }
> = {
  extension_of_approval: {
    icon: ArrowRight,
    description: "Annual extension of approval (EoA) for existing accredited technical programs.",
    requirements: ["Previous Year EoA Letter", "Fire Safety NOC", "Building Occupancy Certificate", "Faculty Cadre Certificate"],
  },
  increase_intake: {
    icon: TrendingUp,
    description: "Request additional student intake capacity for eligible accredited departments.",
    requirements: ["NBA Accreditation Certificate (valid for 3+ years)", "Classroom/Lab Carpet Area Certificate", "Faculty Recruitment Undertaking"],
  },
  new_program: {
    icon: GraduationCap,
    description: "Introduce a new UG/PG/Diploma engineering, technology, or management program.",
    requirements: ["University Affiliation In-Principle Letter", "Curriculum Structure", "Laboratory Setup Budget & Purchase Orders"],
  },
  new_institution: {
    icon: Building2,
    description: "Establish a brand-new technical institution with trust/society incorporation.",
    requirements: ["Registered Land Sale/Gift Deed", "Town Planning Land Use Certificate", "Fixed Deposit Receipts (Security Deposit)"],
  },
  closure: {
    icon: XCircle,
    description: "Progressive or complete closure of unviable programs or institution.",
    requirements: ["Governing Body Resolution", "No-Objection Certificate from State Govt & University", "Student Relocation Plan"],
  },
  name_change: {
    icon: PenLine,
    description: "Change in institution name, trust name, or shifting of campus site.",
    requirements: ["Registrar of Societies Approval", "University Senate Endorsement", "Title verification of new site"],
  },
};

function NewApplicationWizard() {
  const router = useRouter();
  const { userProfile } = useAuth();

  const [step, setStep] = useState(1);
  const [category, setCategory] = useState<ApplicationCategory>("extension_of_approval");
  const [formData, setFormData] = useState({
    programName: "Computer Science & Engineering",
    academicYear: "2026-2027",
    proposedIntake: "180",
    existingIntake: "120",
    facultyCount: "32",
    builtUpAreaSqM: "8400",
    landAreaAcres: "4.8",
    justification: "Expanding student intake in emerging areas (Artificial Intelligence & Machine Learning) to cater to high regional industry demand.",
    agreedToTerms: false,
  });

  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({
    "Previous Year EoA Letter": "EoA_AY2025_26_Certified.pdf",
    "Fire Safety NOC": "CFO_Fire_Safety_NOC_2026.pdf",
    "Building Occupancy Certificate": "Municipal_Occupancy_Cert_Bldg4.pdf",
    "Faculty Cadre Certificate": "Form16_Faculty_List_Signed.pdf",
  });

  const [submitting, setSubmitting] = useState(false);

  const handleFileUpload = (docName: string) => {
    // Simulated upload for demo
    setUploadedFiles((prev) => ({
      ...prev,
      [docName]: `${docName.replace(/\s+/g, "_")}_Uploaded.pdf`,
    }));
  };

  const handleFinalSubmit = () => {
    setSubmitting(true);
    const deadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const created = dataService.createApplication({
      institutionId: userProfile?.institutionId || "inst-001",
      createdByUid: userProfile?.uid || "inst-user-1",
      applicationCategory: category,
      workflowDefinitionId: `wf-${category}`,
      workflowVersionId: "v-2.4",
      status: "in_review",
      currentStageId: "scrutiny",
      currentStageName: "Regional Office Scrutiny",
      currentAssigneeRole: "regional_officer",
      assignedUserIds: ["aicte-ro-west"],
      regionId: "western",
      stageEnteredAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      dueAt: deadline,
      nextActionDescription: "Awaiting Scrutiny Officer initial verification of submitted certificates and declarations.",
      requiresEvc: category === "new_institution" || category === "new_program",
      formData: {
        ...formData,
        uploadedDocuments: uploadedFiles,
      },
    });

    setTimeout(() => {
      setSubmitting(false);
      router.push(`/institution/applications/${created.id}`);
    }, 600);
  };

  const currentReqs = CATEGORY_DETAILS[category].requirements;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            New AICTE Application
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Submit your regulatory proposal for Approval Process Handbook AY 2026-27
          </p>
        </div>
        <Link href="/institution/applications">
          <Button variant="ghost" size="sm" className="text-xs text-slate-600">
            Cancel
          </Button>
        </Link>
      </div>

      {/* Wizard Step Indicator (Stripe / Jira Style) */}
      <div className="flex items-center justify-between bg-white px-6 py-3 rounded-lg border border-slate-200/80 shadow-2xs">
        {[
          { num: 1, label: "Category" },
          { num: 2, label: "Program & Intake" },
          { num: 3, label: "Infrastructure" },
          { num: 4, label: "Documents" },
          { num: 5, label: "Declaration" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                step === s.num
                  ? "bg-blue-600 text-white"
                  : step > s.num
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {step > s.num ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                step === s.num ? "text-slate-900 font-bold" : "text-slate-500"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Select Category */}
      {step === 1 && (
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">
              Step 1: Select Application Category
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Choose the statutory category per AICTE Approval Process Handbook (APH)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {APPLICATION_CATEGORIES.map((catKey) => {
                const info = CATEGORY_DETAILS[catKey];
                const Icon = info.icon;
                const isSelected = category === catKey;

                return (
                  <div
                    key={catKey}
                    onClick={() => setCategory(catKey)}
                    className={`cursor-pointer rounded-lg border p-4 transition-all flex items-start gap-3.5 ${
                      isSelected
                        ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-500 shadow-2xs"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                        isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          {APPLICATION_CATEGORY_LABELS[catKey]}
                        </span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-600 leading-normal">
                        {info.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(2)} className="bg-blue-600 text-white text-xs px-4">
                Next: Program Details <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Program & Intake */}
      {step === 2 && (
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">
              Step 2: Program & Intake Specifications
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Category: {APPLICATION_CATEGORY_LABELS[category]}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="programName" className="text-xs font-medium text-slate-700">
                  Target Program / Department
                </Label>
                <Input
                  id="programName"
                  value={formData.programName}
                  onChange={(e) => setFormData({ ...formData, programName: e.target.value })}
                  placeholder="e.g. Artificial Intelligence & Data Science"
                  className="mt-1.5 h-8 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="academicYear" className="text-xs font-medium text-slate-700">
                  Academic Year
                </Label>
                <Input
                  id="academicYear"
                  value={formData.academicYear}
                  disabled
                  className="mt-1.5 h-8 text-xs bg-slate-50 font-mono"
                />
              </div>

              <div>
                <Label htmlFor="existingIntake" className="text-xs font-medium text-slate-700">
                  Existing Approved Intake
                </Label>
                <Input
                  id="existingIntake"
                  type="number"
                  value={formData.existingIntake}
                  onChange={(e) => setFormData({ ...formData, existingIntake: e.target.value })}
                  className="mt-1.5 h-8 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="proposedIntake" className="text-xs font-medium text-slate-700">
                  Proposed Intake Capacity
                </Label>
                <Input
                  id="proposedIntake"
                  type="number"
                  value={formData.proposedIntake}
                  onChange={(e) => setFormData({ ...formData, proposedIntake: e.target.value })}
                  className="mt-1.5 h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="justification" className="text-xs font-medium text-slate-700">
                Institutional Rationale & Justification
              </Label>
              <Textarea
                id="justification"
                rows={3}
                value={formData.justification}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                className="mt-1.5 text-xs"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep(3)} className="bg-blue-600 text-white text-xs">
                Next: Infrastructure <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Infrastructure */}
      {step === 3 && (
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">
              Step 3: Campus Infrastructure & Faculty Availability
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              AICTE norms require verified instructional space and student-to-faculty ratio (1:15 / 1:20)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="builtUpAreaSqM" className="text-xs font-medium text-slate-700">
                  Instructional Built-up Area (sq.m)
                </Label>
                <Input
                  id="builtUpAreaSqM"
                  value={formData.builtUpAreaSqM}
                  onChange={(e) => setFormData({ ...formData, builtUpAreaSqM: e.target.value })}
                  className="mt-1.5 h-8 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="landAreaAcres" className="text-xs font-medium text-slate-700">
                  Total Contiguous Land (Acres)
                </Label>
                <Input
                  id="landAreaAcres"
                  value={formData.landAreaAcres}
                  onChange={(e) => setFormData({ ...formData, landAreaAcres: e.target.value })}
                  className="mt-1.5 h-8 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="facultyCount" className="text-xs font-medium text-slate-700">
                  Regular Full-Time Faculty Count
                </Label>
                <Input
                  id="facultyCount"
                  type="number"
                  value={formData.facultyCount}
                  onChange={(e) => setFormData({ ...formData, facultyCount: e.target.value })}
                  className="mt-1.5 h-8 text-xs"
                />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">AICTE Verification Rule:</p>
              <p className="mt-0.5">
                All submitted square meters will be cross-checked during physical EVC inspection and matched with registered municipal building plan drawings.
              </p>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setStep(2)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep(4)} className="bg-blue-600 text-white text-xs">
                Next: Document Checklist <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Documents */}
      {step === 4 && (
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">
              Step 4: Statutory Document Uploads
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Mandatory attachments required for {APPLICATION_CATEGORY_LABELS[category]}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {currentReqs.map((req) => {
              const fileName = uploadedFiles[req];
              return (
                <div
                  key={req}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50/50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileCheck2
                      className={`h-5 w-5 shrink-0 ${fileName ? "text-emerald-600" : "text-slate-400"}`}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">{req}</p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {fileName ? (
                          <span className="text-emerald-700 font-mono">Attached: {fileName}</span>
                        ) : (
                          "PDF format, max 10MB"
                        )}
                      </p>
                    </div>
                  </div>
                  <div>
                    <Button
                      variant={fileName ? "outline" : "default"}
                      size="sm"
                      onClick={() => handleFileUpload(req)}
                      className="h-7 text-xs"
                    >
                      <UploadCloud className="h-3.5 w-3.5 mr-1" />
                      {fileName ? "Replace" : "Upload PDF"}
                    </Button>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setStep(3)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep(5)} className="bg-blue-600 text-white text-xs">
                Next: Sworn Declaration <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Declaration & Final Submission */}
      {step === 5 && (
        <Card className="border border-slate-200/90 shadow-2xs bg-white">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-base font-semibold text-slate-900">
              Step 5: Review & Final Submission
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Confirm all details prior to electronic sealing and generation of Application Reference Number
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Category:</span>
                <span className="font-semibold text-slate-900">
                  {APPLICATION_CATEGORY_LABELS[category]}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Program Name:</span>
                <span className="font-semibold text-slate-900">{formData.programName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">Proposed Intake:</span>
                <span className="font-semibold text-slate-900">{formData.proposedIntake} seats</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Documents Attached:</span>
                <span className="font-semibold text-emerald-700">
                  {Object.keys(uploadedFiles).length} Verified PDFs
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 leading-relaxed">
                <p className="font-semibold text-slate-900">
                  Statutory Undertaking (Section 10, AICTE Act 1987)
                </p>
                <p className="mt-1">
                  I hereby solemnly affirm that all institutional declarations, infrastructure dimensions, faculty rosters, and uploaded certificates are bona fide and authentic. Any misrepresentation shall render this application liable for immediate summary rejection and disciplinary penalty.
                </p>
                <label className="mt-3 flex items-center gap-2 cursor-pointer font-medium text-slate-900">
                  <input
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  I confirm and endorse this regulatory submission
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setStep(4)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
              </Button>
              <Button
                size="sm"
                disabled={!formData.agreedToTerms || submitting}
                onClick={handleFinalSubmit}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-6 font-semibold shadow-xs"
              >
                {submitting ? "Sealing & Generating Application ID..." : "Submit Application to AICTE"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function NewApplicationPage() {
  return (
    <RequireRole roles={["institution"]}>
      <NewApplicationWizard />
    </RequireRole>
  );
}
