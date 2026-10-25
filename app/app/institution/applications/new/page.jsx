"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  Building2,
  GraduationCap,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  UploadCloud,
  FileCheck2,
  ShieldCheck,
  AlertCircle,
  FileText,
  Search,
  Save,
  Loader2,
  Trash2,
  Eye,
  Check,
  ExternalLink,
} from "lucide-react";

export default function NewApplicationPage() {
  const router = useRouter();
  const { userProfile } = useAuth();

  // Wizard state
  const [step, setStep] = useState(1);
  const [applicationTypes, setApplicationTypes] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [formConfig, setFormConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(true);

  // Search & category filter for step 1
  const [typeSearch, setTypeSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Application instance state
  const [applicationId, setApplicationId] = useState(null);
  const [applicationNumber, setApplicationNumber] = useState(null);
  const [formData, setFormData] = useState({});
  const [uploadedDocs, setUploadedDocs] = useState({}); // { [docName]: { id, originalFilename, fileSize, storagePath } }
  const [uploadingDoc, setUploadingDoc] = useState(null);

  // Validation & UI states
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [missingFieldsList, setMissingFieldsList] = useState([]);
  const [missingDocsList, setMissingDocsList] = useState([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftBanner, setDraftBanner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

  // 1. Load Application Types on mount
  useEffect(() => {
    async function fetchTypes() {
      try {
        setLoadingTypes(true);
        const res = await fetch(`${API_BASE}/application-types`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setApplicationTypes(data);
          if (data.length > 0) {
            setSelectedType(data[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load application types:", err);
      } finally {
        setLoadingTypes(false);
      }
    }
    fetchTypes();
  }, [API_BASE]);

  // 1b. Check for existing draftId in query parameters to resume
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const draftId = params.get("draftId");
    if (!draftId) return;

    async function loadDraft() {
      try {
        const res = await fetch(`${API_BASE}/applications/${draftId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const app = await res.json();
          setApplicationId(app.id);
          setApplicationNumber(app.applicationNumber);
          if (app.applicationType) {
            setSelectedType(app.applicationType);
          } else if (app.applicationTypeId && applicationTypes.length > 0) {
            const found = applicationTypes.find((t) => t.id === app.applicationTypeId);
            if (found) setSelectedType(found);
          }
          if (app.formData) {
            setFormData(app.formData);
          }
          if (Array.isArray(app.documents)) {
            const docMap = {};
            app.documents.forEach((d) => {
              docMap[d.documentType] = {
                id: d.id,
                originalFilename: d.originalFilename,
                fileSize: d.fileSize || 0,
                storagePath: d.storagePath,
              };
            });
            setUploadedDocs(docMap);
          }
          setDraftBanner(`Resumed Draft: ${app.applicationNumber}`);
          setStep(3); // Jump directly to Application Details
        }
      } catch (err) {
        console.error("Failed to load draft:", err);
      }
    }
    loadDraft();
  }, [API_BASE, applicationTypes]);

  // 2. Load Form Configuration when selectedType changes
  useEffect(() => {
    if (!selectedType) return;
    async function fetchFormConfig() {
      try {
        setLoadingConfig(true);
        const res = await fetch(`${API_BASE}/application-types/${selectedType.id}/form`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setFormConfig(data);
          // Initialize default form data for fields if not yet set
          const initial = { ...formData };
          data.fieldDefinitions?.forEach((f) => {
            if (initial[f.fieldKey] === undefined) {
              initial[f.fieldKey] = f.fieldType === "boolean" ? false : "";
            }
          });
          setFormData(initial);
        }
      } catch (err) {
        console.error("Failed to load form config:", err);
      } finally {
        setLoadingConfig(false);
      }
    }
    fetchFormConfig();
  }, [selectedType, API_BASE]);

  // Handle Field Input
  const handleFieldChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
    setServerError("");
  };

  // Step Validation
  const validateCurrentStep = () => {
    const errors = {};
    if (!formConfig) return true;

    if (step === 3) {
      // Validate application_details
      const sectionFields = formConfig.sections?.application_details || [];
      sectionFields.forEach((f) => {
        if (f.required) {
          const val = formData[f.fieldKey];
          if (val === undefined || val === null || val === "" || (f.fieldType === "boolean" && !val)) {
            errors[f.fieldKey] = `${f.label} is required.`;
          }
        }
      });
    } else if (step === 4) {
      // Validate academic_infrastructure
      const sectionFields = formConfig.sections?.academic_infrastructure || [];
      sectionFields.forEach((f) => {
        if (f.required) {
          const val = formData[f.fieldKey];
          if (val === undefined || val === null || val === "" || (f.fieldType === "boolean" && !val)) {
            errors[f.fieldKey] = `${f.label} is required.`;
          }
        }
        // Custom rule validation
        if (f.validationRule === "greater_than:existing_intake") {
          const reqVal = Number(formData[f.fieldKey]);
          const existVal = Number(formData.existing_intake);
          if (!isNaN(reqVal) && !isNaN(existVal) && reqVal <= existVal) {
            errors[f.fieldKey] = `Requested intake (${reqVal}) must be greater than existing intake (${existVal}).`;
          }
        }
        if (f.validationRule === "less_than:existing_intake") {
          const redVal = Number(formData[f.fieldKey]);
          const existVal = Number(formData.existing_intake);
          if (!isNaN(redVal) && !isNaN(existVal) && redVal >= existVal) {
            errors[f.fieldKey] = `Proposed reduced intake (${redVal}) must be less than existing intake (${existVal}).`;
          }
        }
      });
    } else if (step === 5) {
      // Validate documents
      const reqDocs = formConfig.documentRequirements?.filter((d) => d.required) || [];
      const missing = reqDocs.filter((d) => !uploadedDocs[d.documentName]);
      if (missing.length > 0) {
        setServerError(`Please upload all mandatory documents (${missing.map((m) => m.documentName).join(", ")}) before proceeding.`);
        return false;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setServerError("");
      setStep((prev) => Math.min(6, prev + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    setServerError("");
    setStep((prev) => Math.max(1, prev - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Save Draft to Backend
  const handleSaveDraft = async () => {
    setSavingDraft(true);
    setDraftBanner("");
    setServerError("");
    try {
      const payload = {
        applicationTypeId: selectedType?.id,
        applicationCategory: selectedType?.name,
        formData,
        status: "draft",
      };

      const url = applicationId ? `${API_BASE}/applications/${applicationId}` : `${API_BASE}/applications`;
      const method = applicationId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to save draft");
      }

      setApplicationId(json.application.id);
      setApplicationNumber(json.application.applicationNumber);
      setDraftBanner(`Draft saved successfully! Application Reference: ${json.application.applicationNumber}`);
      setTimeout(() => setDraftBanner(""), 6000);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error saving draft");
    } finally {
      setSavingDraft(false);
    }
  };

  // Upload Document Handler (10MB limit)
  const handleFileUpload = async (reqDoc, file) => {
    if (!file) return;

    // 10 MB limit check on client
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setServerError(`File "${file.name}" exceeds the maximum allowed size of 10 MB.`);
      return;
    }

    // Ensure we have an application record in DB to attach document to
    let currentAppId = applicationId;
    if (!currentAppId) {
      try {
        const draftRes = await fetch(`${API_BASE}/applications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            applicationTypeId: selectedType?.id,
            applicationCategory: selectedType?.name,
            formData,
            status: "draft",
          }),
        });
        const draftData = await draftRes.json();
        if (!draftRes.ok) throw new Error(draftData.error || "Failed to initialize application");
        currentAppId = draftData.application.id;
        setApplicationId(draftData.application.id);
        setApplicationNumber(draftData.application.applicationNumber);
      } catch (e) {
        setServerError(e instanceof Error ? e.message : "Failed to initialize application for upload");
        return;
      }
    }

    try {
      setUploadingDoc(reqDoc.documentName);
      setServerError("");

      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("documentType", reqDoc.documentName);
      uploadFormData.append("documentRequirementId", reqDoc.id);

      const res = await fetch(`${API_BASE}/applications/${currentAppId}/documents`, {
        method: "POST",
        credentials: "include",
        body: uploadFormData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to upload document");
      }

      setUploadedDocs((prev) => ({
        ...prev,
        [reqDoc.documentName]: {
          id: data.document.id,
          originalFilename: file.name,
          fileSize: file.size,
          storagePath: data.document.storagePath,
        },
      }));
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Upload error");
    } finally {
      setUploadingDoc(null);
    }
  };

  // Remove Document Handler
  const handleRemoveDoc = async (reqDoc) => {
    const existing = uploadedDocs[reqDoc.documentName];
    if (!existing || !applicationId) return;

    try {
      await fetch(`${API_BASE}/applications/${applicationId}/documents/${existing.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setUploadedDocs((prev) => {
        const copy = { ...prev };
        delete copy[reqDoc.documentName];
        return copy;
      });
    } catch (e) {
      console.error("Error removing document:", e);
    }
  };

  // Final Submit Handler
  const handleFinalSubmit = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    setServerError("");
    setMissingFieldsList([]);
    setMissingDocsList([]);

    try {
      // 1. Ensure draft is up to date
      let currentAppId = applicationId;
      const draftRes = await fetch(
        currentAppId ? `${API_BASE}/applications/${currentAppId}` : `${API_BASE}/applications`,
        {
          method: currentAppId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            applicationTypeId: selectedType?.id,
            applicationCategory: selectedType?.name,
            formData,
            status: "draft",
          }),
        }
      );
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(draftData.error || "Failed to save final application state");
      currentAppId = draftData.application.id;

      // 2. Submit to backend validation & workflow engine
      const submitRes = await fetch(`${API_BASE}/applications/${currentAppId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        if (submitData.missingFields) setMissingFieldsList(submitData.missingFields);
        if (submitData.missingDocuments) setMissingDocsList(submitData.missingDocuments);
        throw new Error(submitData.error || submitData.message || "Submission validation failed");
      }

      // Success -> navigate to application view
      router.push(`/institution/applications/${currentAppId}`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Error submitting application");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter application types for Step 1
  const categoriesList = ["all", ...new Set(applicationTypes.map((t) => t.category))];
  const filteredTypes = applicationTypes.filter((t) => {
    const matchesSearch =
      !typeSearch ||
      t.name.toLowerCase().includes(typeSearch.toLowerCase()) ||
      t.code.toLowerCase().includes(typeSearch.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(typeSearch.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <RequireRole roles={["institution"]}>
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                APH AY 2026-27
              </span>
              {applicationNumber && (
                <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {applicationNumber}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl mt-1">
              New AICTE Regulatory Application
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Complete statutory proposal submission for institutional approvals, intake variations, and program additions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={savingDraft || step === 1}
              className="text-xs text-slate-700 bg-white"
            >
              {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save Draft
            </Button>
            <Link href="/institution/applications">
              <Button variant="ghost" size="sm" className="text-xs text-slate-500">
                Exit to Portfolio
              </Button>
            </Link>
          </div>
        </div>

        {/* Global Notifications */}
        {draftBanner && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{draftBanner}</span>
          </div>
        )}

        {serverError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{serverError}</p>
              {missingFieldsList.length > 0 && (
                <p className="mt-1 text-[11px]">
                  Missing fields: <code className="bg-rose-100 px-1 py-0.5 rounded">{missingFieldsList.join(", ")}</code>
                </p>
              )}
              {missingDocsList.length > 0 && (
                <p className="mt-1 text-[11px]">
                  Missing documents: <code className="bg-rose-100 px-1 py-0.5 rounded">{missingDocsList.join(", ")}</code>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Wizard Multi-Step Progress Indicator */}
        <div className="flex items-center justify-between bg-white px-4 sm:px-6 py-3 rounded-xl border border-slate-200/80 shadow-2xs overflow-x-auto">
          {[
            { num: 1, label: "Category" },
            { num: 2, label: "Institute Profile" },
            { num: 3, label: "Application Details" },
            { num: 4, label: "Academic / Infra" },
            { num: 5, label: "Documents" },
            { num: 6, label: "Review & Submit" },
          ].map((s) => (
            <div key={s.num} className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (s.num < step) setStep(s.num);
                }}
                disabled={s.num > step}
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  step === s.num
                    ? "bg-[#0a2540] text-white"
                    : step > s.num
                    ? "bg-emerald-600 text-white cursor-pointer"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
              </button>
              <span
                className={`text-xs font-medium hidden md:inline ${
                  step === s.num ? "text-slate-900 font-bold" : "text-slate-500"
                }`}
              >
                {s.label}
              </span>
              {s.num < 6 && <div className="h-px w-3 sm:w-6 bg-slate-200 hidden sm:block" />}
            </div>
          ))}
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: Select Application Type                                           */}
        {/* ========================================================================= */}
        {step === 1 && (
          <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Step 1: Select AICTE Application Category & Type
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Choose the statutory application type. Dynamic form fields and required documents will adapt automatically from AICTE regulatory rules.
              </CardDescription>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={typeSearch}
                    onChange={(e) => setTypeSearch(e.target.value)}
                    placeholder="Search from 16 statutory application types..."
                    className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 outline-none"
                >
                  <option value="all">All Regulatory Categories</option>
                  {categoriesList.filter((c) => c !== "all").map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {loadingTypes ? (
                <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Loading AICTE Application Types from Regulatory Database...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                  {filteredTypes.map((type) => {
                    const isSelected = selectedType?.id === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSelectedType(type)}
                        className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-500"
                            : "border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              {type.name}
                            </span>
                            {type.requiresEvc && (
                              <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                                EVC Inspection Required
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                            {type.description || "Approval Process Handbook regulatory petition."}
                          </p>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                          <span className="uppercase font-semibold tracking-wider text-slate-500">{type.category}</span>
                          <span className="font-mono text-blue-600 font-semibold">{isSelected ? "Selected ✓" : "Select →"}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Selected Type: <strong>{selectedType?.name || "None"}</strong>
                </span>
                <Button
                  type="button"
                  onClick={handleNext}
                  disabled={!selectedType}
                  className="text-xs bg-[#0a2540] hover:bg-[#1a3b5c] text-white"
                >
                  Continue to Institute Profile →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: Common Institute Profile Details (Pre-filled)                     */}
        {/* ========================================================================= */}
        {step === 2 && (
          <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Step 2: Institutional Information Verification
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Verified details automatically fetched from your official institution profile. No repetitive manual entry needed.
                  </CardDescription>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Profile Synchronized
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Institution Name</span>
                  <p className="font-bold text-slate-900 text-sm">
                    {userProfile?.institutionName || "Pune Institute of Computer Technology"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">AICTE Permanent ID (PID)</span>
                  <p className="font-mono font-bold text-slate-900 text-sm">
                    {userProfile?.institutionCode || "1-482910381"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Official Head of Institute / User</span>
                  <p className="font-semibold text-slate-800">
                    {userProfile?.displayName || "Dr. P. T. Kulkarni (Principal)"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Institutional Registered Email</span>
                  <p className="font-mono text-slate-800">
                    {userProfile?.email || "principal@pict.edu"}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Regional Bureau Jurisdiction</span>
                  <p className="font-semibold text-slate-800">Western Region (Mumbai Bureau)</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400">Registered Campus Address</span>
                  <p className="text-slate-800">Survey No. 27, Near Trimurti Chowk, Dhankawadi, Pune, Maharashtra - 411043</p>
                </div>
              </div>

              <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-3 text-xs text-blue-900 flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Statutory Authority Confirmation</p>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    This proposal will be submitted under the digital authorization of your registered institution. If any official profile parameters require updating, please notify the Regional Officer via the Helpdesk.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={handleBack} className="text-xs">
                  ← Back to Categories
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  className="text-xs bg-[#0a2540] hover:bg-[#1a3b5c] text-white"
                >
                  Continue to Application Details →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: Dynamic Application Details Fields                                */}
        {/* ========================================================================= */}
        {step === 3 && (
          <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Step 3: {selectedType?.name} — Application Details
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Specific regulatory fields required by AICTE Approval Process Handbook (APH) 2026-27 for {selectedType?.category}.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {loadingConfig ? (
                <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Loading field configuration...
                </div>
              ) : (
                <div className="space-y-4">
                  {(formConfig?.sections?.application_details || []).map((f) => (
                    <div key={f.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={f.fieldKey} className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          {f.label} {f.required && <span className="text-rose-500 font-bold">*</span>}
                        </Label>
                        <span className="text-[10px] text-slate-400 capitalize">{f.fieldType.replace("_", " ")}</span>
                      </div>

                      {/* Field Renderers by Type */}
                      {f.fieldType === "textarea" ? (
                        <Textarea
                          id={f.fieldKey}
                          value={formData[f.fieldKey] || ""}
                          onChange={(e) => handleFieldChange(f.fieldKey, e.target.value)}
                          placeholder={f.placeholder || ""}
                          rows={3}
                          className={`text-xs rounded-lg ${fieldErrors[f.fieldKey] ? "border-rose-500 ring-1 ring-rose-500" : ""}`}
                        />
                      ) : f.fieldType === "dropdown" ? (
                        <select
                          id={f.fieldKey}
                          value={formData[f.fieldKey] || ""}
                          onChange={(e) => handleFieldChange(f.fieldKey, e.target.value)}
                          className={`w-full h-9 px-3 rounded-lg border bg-white text-xs text-slate-800 outline-none ${
                            fieldErrors[f.fieldKey] ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-200"
                          }`}
                        >
                          <option value="">-- Select {f.label} --</option>
                          {(f.optionsJson ? JSON.parse(f.optionsJson) : []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : f.fieldType === "boolean" ? (
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                          <input
                            type="checkbox"
                            id={f.fieldKey}
                            checked={!!formData[f.fieldKey]}
                            onChange={(e) => handleFieldChange(f.fieldKey, e.target.checked)}
                            className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                          />
                          <Label htmlFor={f.fieldKey} className="text-xs text-slate-700 font-normal leading-relaxed cursor-pointer">
                            {f.placeholder || f.label}
                          </Label>
                        </div>
                      ) : (
                        <Input
                          id={f.fieldKey}
                          type={f.fieldType === "number" ? "number" : f.fieldType === "date" ? "date" : "text"}
                          value={formData[f.fieldKey] || ""}
                          onChange={(e) => handleFieldChange(f.fieldKey, e.target.value)}
                          placeholder={f.placeholder || ""}
                          className={`h-9 text-xs rounded-lg ${fieldErrors[f.fieldKey] ? "border-rose-500 ring-1 ring-rose-500" : ""}`}
                        />
                      )}

                      {fieldErrors[f.fieldKey] && (
                        <p className="text-[11px] text-rose-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {fieldErrors[f.fieldKey]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={handleBack} className="text-xs">
                  ← Back to Profile
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  className="text-xs bg-[#0a2540] hover:bg-[#1a3b5c] text-white"
                >
                  Continue to Academic / Infrastructure →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: Dynamic Academic & Infrastructure Details                         */}
        {/* ========================================================================= */}
        {step === 4 && (
          <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Step 4: Academic, Intake & Infrastructure Prerequisites
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Intake capacity parameters, faculty allocations, and physical carpet area validation rules.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <div className="space-y-4">
                {(formConfig?.sections?.academic_infrastructure || []).map((f) => (
                  <div key={f.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor={f.fieldKey} className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        {f.label} {f.required && <span className="text-rose-500 font-bold">*</span>}
                      </Label>
                      {f.validationRule && (
                        <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          Rule: {f.validationRule}
                        </span>
                      )}
                    </div>

                    {/* Field Renderers */}
                    {f.fieldType === "textarea" ? (
                      <Textarea
                        id={f.fieldKey}
                        value={formData[f.fieldKey] || ""}
                        onChange={(e) => handleFieldChange(f.fieldKey, e.target.value)}
                        placeholder={f.placeholder || ""}
                        rows={3}
                        className={`text-xs rounded-lg ${fieldErrors[f.fieldKey] ? "border-rose-500 ring-1 ring-rose-500" : ""}`}
                      />
                    ) : f.fieldType === "boolean" ? (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <input
                          type="checkbox"
                          id={f.fieldKey}
                          checked={!!formData[f.fieldKey]}
                          onChange={(e) => handleFieldChange(f.fieldKey, e.target.checked)}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <Label htmlFor={f.fieldKey} className="text-xs text-slate-700 font-normal leading-relaxed cursor-pointer">
                          {f.placeholder || f.label}
                        </Label>
                      </div>
                    ) : (
                      <Input
                        id={f.fieldKey}
                        type={f.fieldType === "number" ? "number" : "text"}
                        value={formData[f.fieldKey] || ""}
                        onChange={(e) => handleFieldChange(f.fieldKey, e.target.value)}
                        placeholder={f.placeholder || ""}
                        className={`h-9 text-xs rounded-lg ${fieldErrors[f.fieldKey] ? "border-rose-500 ring-1 ring-rose-500" : ""}`}
                      />
                    )}

                    {fieldErrors[f.fieldKey] && (
                      <p className="text-[11px] text-rose-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {fieldErrors[f.fieldKey]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={handleBack} className="text-xs">
                  ← Back to Application Details
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  className="text-xs bg-[#0a2540] hover:bg-[#1a3b5c] text-white"
                >
                  Continue to Required Documents →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* STEP 5: Required Document Checklist & Upload (10MB Max)                   */}
        {/* ========================================================================= */}
        {step === 5 && (
          <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Step 5: Statutory Document Checklist & Upload
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Upload official certificates and resolutions. PDF format preferred. Maximum file size: <strong>10 MB per file</strong>.
                  </CardDescription>
                </div>
                <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded border">
                  Max 10 MB / File
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <div className="space-y-3">
                {(formConfig?.documentRequirements || []).map((reqDoc) => {
                  const uploaded = uploadedDocs[reqDoc.documentName];
                  const isUploading = uploadingDoc === reqDoc.documentName;

                  return (
                    <div
                      key={reqDoc.id}
                      className={`p-4 rounded-xl border transition-all ${
                        uploaded
                          ? "border-emerald-200 bg-emerald-50/40"
                          : reqDoc.required
                          ? "border-slate-200 bg-white"
                          : "border-slate-100 bg-slate-50/50"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{reqDoc.documentName}</span>
                            {reqDoc.required ? (
                              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                MANDATORY
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                OPTIONAL
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">{reqDoc.description}</p>
                        </div>

                        {/* Upload Status / Action */}
                        <div className="flex items-center gap-2 shrink-0">
                          {uploaded ? (
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Uploaded ✓
                                </span>
                                <p className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                                  {uploaded.originalFilename} ({(uploaded.fileSize / 1024).toFixed(0)} KB)
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveDoc(reqDoc)}
                                className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                title="Remove file"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <label className="cursor-pointer">
                              <input
                                type="file"
                                accept={reqDoc.allowedExtensions || ".pdf,.jpg,.jpeg,.png"}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(reqDoc, file);
                                }}
                                disabled={isUploading}
                                className="hidden"
                              />
                              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs transition">
                                {isUploading ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
                                  </>
                                ) : (
                                  <>
                                    <UploadCloud className="h-3.5 w-3.5 text-blue-600" /> Upload Document
                                  </>
                                )}
                              </span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={handleBack} className="text-xs">
                  ← Back to Academic / Infra
                </Button>
                <Button
                  type="button"
                  onClick={handleNext}
                  className="text-xs bg-[#0a2540] hover:bg-[#1a3b5c] text-white"
                >
                  Continue to Review & Submit →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ========================================================================= */}
        {/* STEP 6: Review & Final Submit                                             */}
        {/* ========================================================================= */}
        {step === 6 && (
          <Card className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl">
            <CardHeader className="p-5 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">
                Step 6: Comprehensive Review & Statutory Submission
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Verify all application parameters before formal submission to AICTE Scrutiny Committee. Once submitted, records are locked from arbitrary alteration.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-5">
              {/* Summary Cards */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Application Profile
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs text-blue-600 font-semibold hover:underline"
                  >
                    Edit Type
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Type: </span>
                    <strong className="text-slate-900">{selectedType?.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Category: </span>
                    <strong className="text-slate-900">{selectedType?.category}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Institution: </span>
                    <strong className="text-slate-900">{userProfile?.institutionName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">PID: </span>
                    <strong className="font-mono text-slate-900">{userProfile?.institutionCode}</strong>
                  </div>
                </div>
              </div>

              {/* Dynamic Field Values Review */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Entered Field Parameters
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-xs text-blue-600 font-semibold hover:underline"
                  >
                    Edit Fields
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
                  {Object.entries(formData).map(([k, v]) => {
                    if (k === "declaration_agreed") return null;
                    const def = formConfig?.fieldDefinitions?.find((f) => f.fieldKey === k);
                    const label = def ? def.label : k.replace(/_/g, " ");
                    return (
                      <div key={k} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <span className="text-[10px] text-slate-500 block capitalize">{label}</span>
                        <span className="font-semibold text-slate-800 break-words">
                          {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v || "-")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Uploaded Documents Review */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Submitted Documents ({Object.keys(uploadedDocs).length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="text-xs text-blue-600 font-semibold hover:underline"
                  >
                    Edit Documents
                  </button>
                </div>
                <div className="space-y-1.5 pt-2">
                  {Object.entries(uploadedDocs).map(([docName, info]) => (
                    <div key={docName} className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 text-xs">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium text-slate-900">{docName}</span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {info.originalFilename} ({(info.fileSize / 1024).toFixed(0)} KB)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Statutory Declaration Checkbox */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="declaration_agreed"
                    checked={!!formData.declaration_agreed}
                    onChange={(e) => handleFieldChange("declaration_agreed", e.target.checked)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <Label htmlFor="declaration_agreed" className="text-xs text-slate-700 leading-relaxed cursor-pointer font-normal">
                    <strong>Statutory Undertaking:</strong> I, as Authorized Signatory / Head of Institution, solemnly affirm and declare that the information provided in this proposal is complete, true, and compliant with all AICTE Approval Process Handbook (APH) regulations. I acknowledge that any suppression or false representation will incur immediate withdrawal of approval.
                  </Label>
                </div>
                {fieldErrors.declaration_agreed && (
                  <p className="text-[11px] text-rose-600 pl-7 font-semibold">
                    {fieldErrors.declaration_agreed}
                  </p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={handleBack} className="text-xs">
                  ← Back to Documents
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDraft}
                    disabled={savingDraft}
                    className="text-xs"
                  >
                    {savingDraft ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save as Draft
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (!formData.declaration_agreed) {
                        setFieldErrors({ declaration_agreed: "You must check the statutory undertaking before final submission." });
                        return;
                      }
                      setShowConfirmModal(true);
                    }}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                  >
                    Submit Application to AICTE →
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Confirm Final Regulatory Submission</h3>
                  <p className="text-[11px] text-slate-500">AY 2026-27 Approval Processing</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Once submitted, this application will be sent for <strong>AICTE Scrutiny Committee processing</strong> and assigned an official docket number. Field edits will be locked. Continue?
              </p>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={submitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleFinalSubmit}
                  disabled={submitting}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Validating & Routing...
                    </>
                  ) : (
                    "Confirm & Submit Application"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
