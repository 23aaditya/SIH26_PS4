"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatusBadge, DocumentBadge, SlaCountdown } from "@/components/shared/StatusBadge";
import { WorkflowStepper, AuditTimeline } from "@/components/shared/WorkflowTimeline";
import { dataService } from "@/lib/dataService";
import { APPLICATION_CATEGORY_LABELS, getApplicationCategoryLabel, ROLE_LABELS, getRoleLabel } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import {
  FileText,
  Building2,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Eye,
  UserCheck,
  Calendar,
  RotateCcw,
  Check,
  Sparkles,
  Bot,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  ArrowRightCircle,
  ArrowRight,
  CornerDownRight,
  User,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { ApplicationTeamWidget } from "@/components/aicte/ApplicationTeamWidget";
import { ApplicationCommunicationPanel } from "@/components/aicte/ApplicationCommunicationPanel";
import { DelegationModal } from "@/components/aicte/DelegationModal";

function AiExecutiveSummary({ content, outcome, versionHash }) {
  if (!content) return null;

  // Extract statutory notice, headline, and findings lines cleanly
  const lines = content.split("\n");
  let headline = "";
  let notice = "";
  let inNotice = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("**Headline:**")) {
      headline = trimmed.replace("**Headline:**", "").trim();
    } else if (trimmed.includes("[!NOTE]")) {
      inNotice = true;
    } else if (inNotice) {
      if (trimmed.startsWith(">")) {
        const cleanNotice = trimmed.replace(/^>\s*/, "").replace(/^\*\*Statutory Notice\*\*:\s*/i, "").trim();
        if (cleanNotice) notice += (notice ? " " : "") + cleanNotice;
      } else if (trimmed === "") {
        // empty line inside notice block
      } else {
        inNotice = false;
      }
    }
  }

  if (!headline) {
    headline = outcome === "RECOMMEND_ACCEPT"
      ? "All Statutory Pre-Checks Compliant"
      : outcome === "DEFICIENCY_SUGGESTED"
      ? "Deficiencies Identified in Self-Disclosure Documents"
      : "Pre-Check Completed: Human Officer Verification Required";
  }

  if (!notice) {
    notice = "This report was generated automatically by the AI Scrutiny Assistant based on AICTE Approval Process Handbook (APH 2024-27). All findings are purely advisory and strictly require human evaluation by the designated AICTE Scrutiny Committee. The AI service does not issue formal deficiencies or alter application status.";
  }

  return (
    <div className={`p-4 rounded-xl border space-y-3 ${
      outcome === "RECOMMEND_ACCEPT"
        ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
        : outcome === "DEFICIENCY_SUGGESTED"
        ? "bg-amber-50/60 border-amber-200 text-amber-950"
        : "bg-blue-50/60 border-blue-200 text-blue-950"
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-current/10 pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-current" />
          <span className="font-bold text-xs uppercase tracking-wide">
            Pre-Check Recommendation: {outcome}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] opacity-75 font-mono">
          <span>Integrity Hash:</span>
          <span className="bg-white/80 px-1.5 py-0.5 rounded border border-current/10">
            {versionHash ? versionHash.substring(0, 12) + "..." : "authoritative"}
          </span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-900">
          {headline}
        </p>
      </div>

      <div className="bg-white/85 rounded-lg p-3 border border-current/15 text-[11px] leading-relaxed text-slate-700">
        <div className="flex items-start gap-2">
          <span className="font-bold text-slate-900 shrink-0 uppercase tracking-wider text-[10px] bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
            Statutory Notice
          </span>
          <p>{notice}</p>
        </div>
      </div>
    </div>
  );
}

const AICTE_ROLES = [
    "regional_officer",
    "bureau_officer",
    "scrutiny_committee",
    "evc_coordinator",
    "competent_authority",
    "admin",
];

const KNOWN_OFFICERS = {
  "DEMO-AIC-034": {
    name: "Dr. R. K. Sharma",
    code: "DEMO-AIC-034",
    role: "Scrutiny Committee Member",
    bureau: "Approval Bureau (Western/Northern)",
  },
  "DEMO-AIC-037": {
    name: "Dr. Neha Rao",
    code: "DEMO-AIC-037",
    role: "EVC Inspection Coordinator",
    bureau: "Regional Inspection Committee",
  },
  "DEMO-AIC-013": {
    name: "Shri Karan Sinha",
    code: "DEMO-AIC-013",
    role: "Regional Officer / Bureau Officer",
    bureau: "Standing Hearing & Approval Bureau",
  },
  "DEMO-AIC-001": {
    name: "Super Administrator",
    code: "DEMO-AIC-001",
    role: "AICTE Headquarter Executive",
    bureau: "Central Governance Council",
  },
};


function AgentDeficiencyProposalCard({
  action,
  onApprove,
  onOpenReject,
  actionProcessing,
  officerNotes,
  setOfficerNotes,
  currentVersionHash,
}) {
  if (!action) return null;
  const actionType = action.action_type || "PROPOSE_DEFICIENCY_NOTICE";
  const isDeficiencyNotice = actionType === "PROPOSE_DEFICIENCY_NOTICE";
  const isStageAdvancement = actionType === "PROPOSE_FORWARD_TO_NEXT_STAGE";
  const isHumanReview = actionType === "REQUEST_HUMAN_REVIEW";

  const isWaiting = action.status === "WAITING_FOR_APPROVAL";
  const isExecuted = action.status === "EXECUTED";
  const isRejected = action.status === "REJECTED";
  const isFailed = action.status === "FAILED" || action.status === "PARTIAL_FAILURE";

  const draft = action.input_payload?.draft_notice || {};
  const transitionProposal = action.input_payload?.transition_proposal || {};
  const reviewRequest = action.input_payload?.review_request || {};

  const items = isDeficiencyNotice
    ? (draft.items || action.input_payload?.deficiency_items || [])
    : isStageAdvancement
    ? (transitionProposal.verified_items || [])
    : (reviewRequest.flagged_items || []);

  const recipient = draft.recipient_institution || transitionProposal.applicant_institution || reviewRequest.applicant_institution || action.input_payload?.institution_name || "Applicant Institution";
  const dueDays = draft.suggested_due_days || action.input_payload?.suggested_due_days || 10;

  // Stale detection: proposal was generated from a different dossier version (relevant when awaiting approval)
  const proposalHash = action.input_payload?.version_hash;
  const isStale = isWaiting && !!(currentVersionHash && proposalHash && currentVersionHash !== proposalHash);

  // Helper to detect if finding was triggered by placeholder or stub
  const isPlaceholderItem = (item) => {
    const ev = (item.evidence || "").toLowerCase();
    return ev.includes("placeholder") || ev.includes("verification stub") || ev.includes("verification copy");
  };

  const renderCardTitle = () => {
    if (isStageAdvancement) return "Autonomous Agent Proposed Stage Advancement";
    if (isHumanReview) return "Autonomous Agent Advisory: Manual Human Review Required";
    return "Autonomous Agent Proposed Deficiency Notice";
  };

  const renderStatusBadge = () => {
    if (isStale) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-orange-100 text-orange-800 border-orange-300 animate-pulse">
          ⚠ Stale Proposal — Requires Re-Evaluation
        </span>
      );
    }
    if (isWaiting) {
      const label = isStageAdvancement
        ? "Action Required: Stage Progression Authorization"
        : isHumanReview
        ? "Action Required: Manual Officer Inspection"
        : "Action Required: Waiting for Human Officer Authorization";
      const color = isStageAdvancement
        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
        : isHumanReview
        ? "bg-blue-100 text-blue-800 border-blue-300"
        : "bg-amber-100 text-amber-800 border-amber-300";
      return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${color} animate-pulse`}>
          {label}
        </span>
      );
    }
    if (isExecuted) {
      const label = isStageAdvancement
        ? "✓ EXECUTED — Stage Transition Approved"
        : isHumanReview
        ? "✓ EXECUTED — Human Review Acknowledged"
        : "✓ EXECUTED — Official Notice Issued";
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-800 border-emerald-300">
          {label}
        </span>
      );
    }
    if (isRejected) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-800 border-red-300">
          ✕ DECLINED BY OFFICER
        </span>
      );
    }
    if (isFailed) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-red-100 text-red-800 border-red-300">
          ⚠ TOOL EXECUTION FAILED
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-300">
        Status: {action.status}
      </span>
    );
  };

  return (
    <Card className={`border shadow-sm mb-4 transition ${
      isStale
        ? "border-orange-400 bg-gradient-to-b from-orange-50/60 to-white"
        : isWaiting
        ? (isStageAdvancement
            ? "border-emerald-300 bg-gradient-to-b from-emerald-50/40 to-white"
            : isHumanReview
            ? "border-blue-300 bg-gradient-to-b from-blue-50/40 to-white"
            : "border-amber-300 bg-gradient-to-b from-amber-50/50 to-white")
        : isExecuted
        ? "border-emerald-300 bg-gradient-to-b from-emerald-50/30 to-white"
        : isRejected
        ? "border-slate-300 bg-slate-50/40"
        : isFailed
        ? "border-red-300 bg-red-50/30"
        : "border-slate-300 bg-slate-50/40"
    }`}>
      <CardHeader className={`p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isExecuted ? "border-emerald-200/70" : isRejected ? "border-slate-200" : isFailed ? "border-red-200" : (isStageAdvancement ? "border-emerald-200/60" : isHumanReview ? "border-blue-200/60" : "border-amber-200/60")
      }`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg shrink-0 ${
            isStale
              ? "bg-orange-100 text-orange-800"
              : isWaiting
              ? (isStageAdvancement ? "bg-emerald-100 text-emerald-800" : isHumanReview ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800")
              : isExecuted
              ? "bg-emerald-100 text-emerald-800"
              : isRejected
              ? "bg-slate-100 text-slate-700"
              : "bg-red-100 text-red-800"
          }`}>
            {isStageAdvancement ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : isHumanReview ? (
              <Search className="h-5 w-5" />
            ) : (
              <Bot className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-bold text-slate-900">
                {renderCardTitle()}
              </CardTitle>
              {renderStatusBadge()}
            </div>
            <CardDescription className="text-xs text-slate-600 mt-1">
              {action.rationale || "AI Lifecycle Agent statutory evaluation per AICTE APH 2024-2027."}
            </CardDescription>
          </div>
        </div>
        <div className="text-right text-[11px] font-mono text-slate-500 shrink-0">
          <div>Action ID: <span className="font-semibold text-slate-700">{action.action_id}</span></div>
          {proposalHash && (
            <div>Proposal Hash: <span className={isStale ? "text-orange-600 font-bold" : "text-slate-600"}>{proposalHash.slice(0, 10)}...</span></div>
          )}
          {currentVersionHash && (
            <div>Current Hash: <span className="text-slate-600">{currentVersionHash.slice(0, 10)}...</span></div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4 text-xs">
        {/* Stale Proposal Warning Banner (only if waiting for approval and hash changed) */}
        {isStale && (
          <div className="p-3 bg-orange-100/80 rounded-lg border border-orange-300 text-[11px] text-orange-950 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-700 shrink-0 mt-0.5" />
            <div>
              <strong>Stale Proposal — Re-Evaluation Required:</strong> This proposal was generated
              from an earlier version of the application dossier (hash mismatch). The application documents
              or category may have changed since this proposal was created. Do not approve this proposal
              without triggering a fresh scrutiny run to generate an up-to-date proposal from the
              current dossier version.
            </div>
          </div>
        )}

        {/* ─── CASE 1: PROPOSE_DEFICIENCY_NOTICE ─────────────────────────────── */}
        {isDeficiencyNotice && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Intended Recipient</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{recipient}</span>
                {(draft.recipient_institution_id || action.input_payload?.institution_id) && (
                  <span className="text-[10px] text-slate-500 font-mono">ID: {draft.recipient_institution_id || action.input_payload?.institution_id}</span>
                )}
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Statutory Authority</span>
                <span className="font-semibold text-slate-800 mt-0.5 block">{draft.statutory_authority || "AICTE Approval Process Handbook (APH 2024-2027)"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Response Window</span>
                <span className="font-bold text-amber-900 mt-0.5 block">{dueDays} Calendar Days</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[10px] font-medium">
              <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded">
                ⚖ Deterministic Statutory — in formal notice
              </span>
              <span className="px-2 py-0.5 bg-orange-50 text-orange-800 border border-orange-200 rounded">
                ⚠ Placeholder / Unsubstantive Document Detected
              </span>
              <span className="px-2 py-0.5 bg-slate-50 text-slate-600 border border-slate-200 rounded italic">
                ℹ Groq Advisory Observations are shown in the AI Scrutiny tab — NOT in this formal notice
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Proposed Deficiency Items — Deterministic Statutory ({items.length})
                </span>
                <span className="text-[10px] text-slate-500">Requires institutional rectification before approval</span>
              </div>

              {items.length === 0 && (
                <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-500 italic">
                  No deterministic statutory deficiency items in this proposal.
                </div>
              )}

              <div className="space-y-2">
                {items.map((item, idx) => {
                  const isPlaceholder = isPlaceholderItem(item);
                  return (
                    <div key={idx} className={`p-3 bg-white rounded-lg border shadow-2xs space-y-1.5 ${isPlaceholder ? "border-orange-300 bg-orange-50/20" : "border-amber-200"}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{idx + 1}. {item.rule_name || item.rule_id}</span>
                          <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200">
                            {item.aph_clause}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                            ⚖ STATUTORY DEFICIENCY
                          </span>
                          {isPlaceholder && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-300">
                              ⚠ PLACEHOLDER DOCUMENT
                            </span>
                          )}
                        </div>
                        {(item.source_document || item.document_name) && (
                          <span className="text-[10px] font-mono bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                            Doc: {item.source_document || item.document_name}
                            {item.source_page || item.page_number ? ` (p. ${item.source_page || item.page_number})` : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-700">
                        <span className="font-semibold text-slate-800">Observed Defect: </span>
                        {item.evidence}
                      </div>
                      <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-2 rounded border border-emerald-200/80">
                        <span className="font-bold text-emerald-950">Requested Corrective Action: </span>
                        {item.corrective_action || item.recommendation}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-700 flex items-start gap-2">
              <Eye className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>Groq LLM Advisory Observations</strong> (if any) are shown separately in the
                &ldquo;AI Scrutiny&rdquo; tab under &ldquo;Groq LLM Qualitative Scrutiny&rdquo;.
                Advisory observations are <em>not</em> included in this formal deficiency notice
                unless a deterministic statutory rule independently establishes the same deficiency.
              </div>
            </div>
          </>
        )}

        {/* ─── CASE 2: PROPOSE_FORWARD_TO_NEXT_STAGE ───────────────────────── */}
        {isStageAdvancement && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Applicant Institution</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{recipient}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Recommended Next Stage</span>
                <span className="font-bold text-emerald-800 mt-0.5 block">
                  {transitionProposal.recommended_stage_name || "Standing Hearing / Decision"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Statutory Pre-Check</span>
                <span className="font-bold text-emerald-700 mt-0.5 block flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> All Norms Satisfied
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Verified Statutory Requirements ({items.length})
                </span>
                <span className="text-[10px] text-slate-500">All applicable norms compliant per APH 2024-2027</span>
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-lg border border-emerald-200 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{idx + 1}. {item.rule_name || item.rule_id}</span>
                        {item.aph_clause && (
                          <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                            {item.aph_clause}
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200">
                          ✓ COMPLIANT
                        </span>
                      </div>
                    </div>
                    {item.evidence && (
                      <div className="text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">Verification Finding: </span>
                        {item.evidence}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ─── CASE 3: REQUEST_HUMAN_REVIEW ─────────────────────────────────── */}
        {isHumanReview && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Applicant Institution</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{recipient}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Assessment Status</span>
                <span className="font-bold text-blue-800 mt-0.5 block">Manual Officer Inspection Required</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-medium uppercase tracking-wider">Items Flagged</span>
                <span className="font-bold text-blue-900 mt-0.5 block">{items.length} Checklist Item(s)</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                  <Search className="h-4 w-4 text-blue-600" />
                  Checks Requiring Human Officer Determination ({items.length})
                </span>
                <span className="text-[10px] text-slate-500">Requires manual scrutiny before final disposition</span>
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-lg border border-blue-200 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{idx + 1}. {item.rule_name || item.rule_id}</span>
                        {item.aph_clause && (
                          <span className="text-[10px] font-mono bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                            {item.aph_clause}
                          </span>
                        )}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-200">
                          🔍 {item.status || "NEEDS_HUMAN_REVIEW"}
                        </span>
                      </div>
                    </div>
                    {item.evidence && (
                      <div className="text-[11px] text-slate-700">
                        <span className="font-semibold text-slate-800">Observation: </span>
                        {item.evidence}
                      </div>
                    )}
                    {item.recommendation && (
                      <div className="text-[11px] text-blue-900 bg-blue-50/70 p-2 rounded border border-blue-200/80">
                        <span className="font-bold text-blue-950">Recommended Action: </span>
                        {item.recommendation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Human Authority Protection Notice (ONLY when WAITING_FOR_APPROVAL) */}
        {isWaiting && (
          <div className="p-2.5 bg-amber-100/60 rounded border border-amber-300/80 text-[11px] text-amber-950 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Human Authority Protection:</strong> This proposed action is purely an AI assistant recommendation and has not taken official legal effect. Only an authorized human AICTE Scrutiny Officer can review and approve it.
            </div>
          </div>
        )}

        {/* Interactive Officer Controls (When WAITING_FOR_APPROVAL) */}
        {isWaiting && (
          <div className="pt-2 border-t border-slate-200 space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Optional Officer Remarks / Justification
              </Label>
              <Textarea
                rows={2}
                value={officerNotes}
                onChange={(e) => setOfficerNotes(e.target.value)}
                placeholder="Add specific officer remarks or conditions..."
                className="text-xs mt-1 bg-white"
                disabled={actionProcessing}
              />
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenReject(action.action_id)}
                disabled={actionProcessing}
                className="text-xs border-red-200 text-red-700 hover:bg-red-50"
              >
                Decline Proposal
              </Button>
              <Button
                size="sm"
                onClick={() => onApprove(action.action_id)}
                disabled={actionProcessing || isStale}
                className={`text-xs text-white font-semibold disabled:opacity-50 ${
                  isStageAdvancement ? "bg-emerald-600 hover:bg-emerald-700" : isHumanReview ? "bg-blue-600 hover:bg-blue-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {actionProcessing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Processing Decision...
                  </>
                ) : isStale ? (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                    Stale — Run Fresh Scrutiny First
                  </>
                ) : isStageAdvancement ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Authorize & Advance Stage
                  </>
                ) : isHumanReview ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Acknowledge & Record Review
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Authorize & Officially Issue Notice
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Historical Audit Record if EXECUTED */}
        {isExecuted && (
          <div className="space-y-3 pt-1">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-300 text-xs text-emerald-950 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span className="font-bold text-emerald-900">
                    Formally Authorized & Processed by Scrutiny Officer
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-800">
                  {action.approved_at || action.updated_at
                    ? new Date(action.approved_at || action.updated_at).toLocaleString()
                    : "Authorized"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                <div className="bg-white/80 p-2 rounded border border-emerald-200">
                  <span className="text-slate-500 block text-[10px] font-medium uppercase">Authorized Officer</span>
                  <span className="font-bold text-slate-800">
                    {action.approved_by || action.output_payload?.approved_by || "DEMO-AIC-034"}
                  </span>
                </div>
                <div className="bg-white/80 p-2 rounded border border-emerald-200">
                  <span className="text-slate-500 block text-[10px] font-medium uppercase">Action Type</span>
                  <span className="font-mono font-semibold text-slate-800 truncate block">
                    {action.action_type}
                  </span>
                </div>
                <div className="bg-white/80 p-2 rounded border border-emerald-200">
                  <span className="text-slate-500 block text-[10px] font-medium uppercase">Execution Status</span>
                  <span className="font-bold text-emerald-800">
                    EXECUTED
                  </span>
                </div>
              </div>

              {(action.output_payload?.approval_notes || action.approval_notes) && (
                <div className="bg-white/80 p-2 rounded border border-emerald-200 text-[11px]">
                  <span className="text-slate-500 font-medium block text-[10px] uppercase">Officer Remarks / Instructions</span>
                  <p className="text-slate-800 italic mt-0.5">
                    &ldquo;{action.output_payload?.approval_notes || action.approval_notes}&rdquo;
                  </p>
                </div>
              )}

              {isDeficiencyNotice && (
                <div className="text-[10px] text-emerald-800/90 pt-1 flex items-center justify-between flex-wrap gap-2">
                  <span>Official Notice Status: <strong className="font-semibold text-emerald-950 uppercase">{action.deficiency_status || "PENDING RESPONSE"}</strong></span>
                  {action.deficiency_due_at && (
                    <span>Response Due By: <strong className="font-semibold text-emerald-950">{new Date(action.deficiency_due_at).toLocaleDateString()}</strong></span>
                  )}
                </div>
              )}
            </div>

            <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-[11px] text-slate-700">
              <strong>Historical Audit Record:</strong> This action has been formally authorized and executed under officer authority. In accordance with AICTE regulatory compliance governance, this record is permanently preserved in the audit trail.
            </div>
          </div>
        )}

        {/* Audit Record if REJECTED */}
        {isRejected && (
          <div className="space-y-2 pt-1">
            <div className="p-3 bg-red-50/70 rounded-lg border border-red-300 text-xs text-red-950 space-y-2">
              <div className="flex items-center justify-between border-b border-red-200 pb-1.5">
                <span className="font-bold text-red-900 flex items-center gap-1.5">
                  ✕ Proposal Declined by Officer
                </span>
                <span className="text-[11px] text-red-700">
                  {action.updated_at ? new Date(action.updated_at).toLocaleString() : ""}
                </span>
              </div>
              <div className="text-[11px] text-slate-800">
                <span className="font-semibold text-slate-900">Rejecting Officer: </span>
                {action.output_payload?.rejected_by || action.rejected_by || "AICTE Scrutiny Officer"}
              </div>
              <div className="text-[11px] text-red-900 bg-white/80 p-2 rounded border border-red-200">
                <span className="font-bold text-red-950">Recorded Rejection Reason: </span>
                &ldquo;{action.rejection_reason || "Officer determined proposal was not applicable or acceptable physical documentation was verified."}&rdquo;
              </div>
            </div>
          </div>
        )}

        {/* Audit Record if FAILED / PARTIAL_FAILURE */}
        {isFailed && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-300 text-xs text-red-950 space-y-1.5">
            <div className="font-bold text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Agent Tool Execution Failed
            </div>
            <p className="text-[11px] text-slate-700">
              {action.error_message || "The agent encountered an unrecoverable error during action execution."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getWorkingOfficer(app, userProfile) {
  if (!app) return null;
  // 1. Check active stage in workflowInstance
  if (app.workflowInstance?.stages) {
    const activeStage =
      app.workflowInstance.stages.find(
        (s) =>
          (s.stageKey === app.currentStageId || s.stageKey === app.workflowInstance?.currentStageKey) &&
          !["COMPLETED", "SKIPPED"].includes(s.stageStatus)
      ) ||
      app.workflowInstance.stages.find(
        (s) => s.stageStatus === "ASSIGNED" || s.stageStatus === "IN_PROGRESS"
      );

    if (activeStage?.assignedStaff) {
      return {
        name: activeStage.assignedStaff.name,
        code: activeStage.assignedStaff.employeeCode || activeStage.assignedStaff.id,
        role: activeStage.assignedStaff.role || activeStage.stageName,
        stage: activeStage.stageName,
        bureau: "AICTE Regulatory Cell",
      };
    }
  }

  // 2. Check assignedUserId in known officers
  if (app.assignedUserId && KNOWN_OFFICERS[app.assignedUserId]) {
    return {
      ...KNOWN_OFFICERS[app.assignedUserId],
      stage: app.currentStageName || "Current Processing Stage",
    };
  }

  // 3. Fallback based on stage ID
  if (app.currentStageId === "scrutiny" || app.status === "in_review") {
    return {
      ...KNOWN_OFFICERS["DEMO-AIC-034"],
      stage: app.currentStageName || "Scrutiny Committee Review",
    };
  } else if (app.currentStageId === "evc" || app.status === "pending_evc") {
    return {
      ...KNOWN_OFFICERS["DEMO-AIC-037"],
      stage: app.currentStageName || "Expert Visit Committee (EVC)",
    };
  } else if (app.currentStageId === "committee" || app.currentStageId === "decision") {
    return {
      ...KNOWN_OFFICERS["DEMO-AIC-013"],
      stage: app.currentStageName || "Standing Hearing Committee",
    };
  }

  return {
    name: userProfile?.name || "Dr. R. K. Sharma",
    code: app.assignedUserId || userProfile?.employeeCode || "DEMO-AIC-034",
    role: app.currentAssigneeRole?.replace(/_/g, " ").toUpperCase() || "Scrutiny Committee Officer",
    stage: app.currentStageName || "Under Review",
    bureau: `${app.regionId || "Western"} Regional Bureau`,
  };
}

function getNextLevelInfo(app) {
  if (!app) {
    return {
      stageId: "evc",
      stageName: "Expert Visit Committee (EVC)",
      assignedRole: "evc_coordinator",
      assignedOfficer: "Dr. Neha Rao (DEMO-AIC-037)",
      description: "Inspection of physical and academic infrastructure.",
    };
  }

  const currentKey = app.currentStageId || "scrutiny";

  if (currentKey === "verification") {
    return {
      stageId: "scrutiny",
      stageName: "Scrutiny Committee Review",
      assignedRole: "scrutiny_committee",
      assignedOfficer: "Dr. R. K. Sharma (DEMO-AIC-034 • Scrutiny Officer)",
      description: "Statutory review of self-disclosure documents and institutional data.",
    };
  }

  if (currentKey === "scrutiny" || currentKey === "re_scrutiny") {
    if (app.requiresEvc) {
      return {
        stageId: "evc",
        stageName: "Expert Visit Committee (EVC) Inspection",
        assignedRole: "evc_coordinator",
        assignedOfficer: "Dr. Neha Rao (DEMO-AIC-037 • EVC Coordinator)",
        description: "On-site physical/virtual infrastructure inspection and land norms validation.",
      };
    } else {
      return {
        stageId: "committee",
        stageName: "Standing Hearing Committee (SHC) Review",
        assignedRole: "bureau_officer",
        assignedOfficer: "Shri Karan Sinha (DEMO-AIC-013 • Bureau Officer)",
        description: "Evaluation of compliance recommendations and hearing proceedings.",
      };
    }
  }

  if (currentKey === "evc") {
    return {
      stageId: "committee",
      stageName: "Standing Hearing Committee (SHC) Review",
      assignedRole: "bureau_officer",
      assignedOfficer: "Shri Karan Sinha (DEMO-AIC-013 • Bureau Officer)",
      description: "Review of inspection report and recommendation formulation.",
    };
  }

  if (currentKey === "committee") {
    return {
      stageId: "decision",
      stageName: "Executive Committee Final Decision",
      assignedRole: "competent_authority",
      assignedOfficer: "Executive Committee / Competent Authority (DEMO-AIC-013)",
      description: "Issuance of formal AICTE approval order (EoA / LoA).",
    };
  }

  return {
    stageId: "decision",
    stageName: "Executive Committee Final Decision",
    assignedRole: "competent_authority",
    assignedOfficer: "Competent Authority Panel",
    description: "Final statutory sealing of decision.",
  };
}

function CaseReviewContent() {
    const params = useParams();
    const router = useRouter();
    const { userProfile } = useAuth();
    const id = params?.id;
    const [app, setApp] = useState(undefined);
    const [docs, setDocs] = useState([]);
    const [auditEvents, setAuditEvents] = useState([]);
    const [activeTab, setActiveTab] = useState("overview");
    const [commsRecipient, setCommsRecipient] = useState(null);
    const [isDelegationOpen, setIsDelegationOpen] = useState(false);
    // Modals state
    const [showClarifyModal, setShowClarifyModal] = useState(false);
    const [showAdvanceModal, setShowAdvanceModal] = useState(false);
    const [showEvcModal, setShowEvcModal] = useState(false);
    const [showDecisionModal, setShowDecisionModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);
    // Form states inside modals
    const [deficiencyNotes, setDeficiencyNotes] = useState("");
    const [advanceReason, setAdvanceReason] = useState("");
    const [evcDate, setEvcDate] = useState("");
    const [evcExperts, setEvcExperts] = useState("");
    const [evcNotes, setEvcNotes] = useState("");
    const [decisionType, setDecisionType] = useState("approved");
    const [decisionReason, setDecisionReason] = useState("");
    const [decisionConditions, setDecisionConditions] = useState("");
    const [reports, setReports] = useState([]);
    const [triggeringAi, setTriggeringAi] = useState(false);
    const [aiJobProgress, setAiJobProgress] = useState(null);
    const [selectedRole, setSelectedRole] = useState("scrutiny_committee");
    const [submittingAdvance, setSubmittingAdvance] = useState(false);
    const [notificationBanner, setNotificationBanner] = useState(null);
    const [agentActions, setAgentActions] = useState([]);
    const [actionProcessing, setActionProcessing] = useState(false);
    const [officerActionNotes, setOfficerActionNotes] = useState("");
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState("");
    const [selectedActionId, setSelectedActionId] = useState(null);
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

    const reloadData = async () => {
        if (!id)
            return;
        try {
            const res = await fetch(`${API_BASE}/aicte/scrutiny/applications/${id}`, {
                headers: {
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                },
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                setApp(data);
                setDocs(data.documents || []);
                setAuditEvents(data.auditEvents || []);
            }
        } catch (e) {
            console.warn("Could not fetch from scrutiny API, checking fallback:", e);
        }

        // Fetch ReviewReports (including AI_SCRUTINY_PRE_CHECK)
        try {
            const repRes = await fetch(`${API_BASE}/aicte/applications/${id}/reports`, {
                headers: {
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                },
                credentials: "include",
            });
            if (repRes.ok) {
                const repData = await repRes.json();
                const list = Array.isArray(repData) ? repData : repData?.reports || [];
                setReports(list);
            }
        } catch (re) {
            console.warn("Could not fetch reports:", re);
        }

        // Fetch Agent Actions (Lifecycle Agent Proposals & States)
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
            const actRes = await fetch(`${API_BASE}/agent/applications/${id}/actions`, {
                headers: {
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: "include",
            });
            if (actRes.ok) {
                const actData = await actRes.json();
                setAgentActions(Array.isArray(actData) ? actData : []);
            }
        } catch (ae) {
            console.warn("Could not fetch agent actions:", ae);
        }

        const found = dataService.getApplicationById(id);
        if (!app && found) {
            setApp(found);
            setDocs(dataService.getDocuments(found.id));
            setAuditEvents(dataService.getAuditEvents(found.id));
        }
    };

    const handleTriggerAi = async (opts = { forceRerun: true, retryLlm: false }) => {
        if (!app || triggeringAi) return;
        setTriggeringAi(true);
        setAiJobProgress({
            status: "PENDING",
            message: "Dispatching AI Scrutiny pre-check to evaluation queue...",
        });

        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
            const res = await fetch(`${API_BASE}/aicte/applications/${app.id}/trigger-ai`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    forceRerun: opts.forceRerun !== false,
                    retryLlm: !!opts.retryLlm,
                }),
                credentials: "include",
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setNotificationBanner({
                    type: "error",
                    message: err.error || err.detail || "Failed to trigger AI Scrutiny pre-check.",
                });
                setTriggeringAi(false);
                setAiJobProgress(null);
                return;
            }

            const triggerData = await res.json();
            const job = triggerData.job || {};
            const jobId = job.job_id;

            if (job.status === "COMPLETED") {
                setNotificationBanner({
                    type: "success",
                    message: "AI Scrutiny pre-check evaluation retrieved successfully.",
                });
                await reloadData();
                setTriggeringAi(false);
                setAiJobProgress(null);
                return;
            }

            // Bounded polling loop: Poll every 1500ms, max 35 attempts (~50s)
            let attempts = 0;
            const maxAttempts = 35;
            const pollInterval = setInterval(async () => {
                attempts++;
                try {
                    const statusRes = await fetch(`${API_BASE}/aicte/applications/${app.id}/ai-job-status/${jobId}`, {
                        headers: {
                            "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        credentials: "include",
                    });

                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        const currentStatus = statusData.status;

                        if (currentStatus === "COMPLETED") {
                            clearInterval(pollInterval);
                            setNotificationBanner({
                                type: "success",
                                message: `AI Scrutiny pre-check completed (${statusData.findings_count || 0} checks evaluated).`,
                            });
                            await reloadData();
                            setTriggeringAi(false);
                            setAiJobProgress(null);
                            return;
                        }

                        if (currentStatus === "FAILED") {
                            clearInterval(pollInterval);
                            setNotificationBanner({
                                type: "error",
                                message: `AI Scrutiny job failed: ${statusData.error_message || "Technical execution failure"}.`,
                            });
                            setTriggeringAi(false);
                            setAiJobProgress(null);
                            return;
                        }

                        setAiJobProgress({
                            status: currentStatus,
                            jobId,
                            message: currentStatus === "PROCESSING"
                                ? "Extracting documents, verifying SHA-256 checksums, and evaluating APH statutory norms..."
                                : "Queued in scrutiny worker pipeline...",
                        });
                    }
                } catch (pollErr) {
                    console.warn("Polling error for AI job:", pollErr);
                }

                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    setNotificationBanner({
                        type: "warning",
                        message: "AI Scrutiny pre-check is taking longer than expected. Please refresh this page shortly.",
                    });
                    setTriggeringAi(false);
                    setAiJobProgress(null);
                }
            }, 1500);

        } catch (e) {
            setNotificationBanner({
                type: "error",
                message: `Could not trigger AI scrutiny service: ${e.message || "Network error"}`,
            });
            setTriggeringAi(false);
            setAiJobProgress(null);
        }
    };

    useEffect(() => {
        reloadData();
    }, [id, userProfile]);
    if (!app) {
        return (<div className="p-8 text-center bg-white rounded-lg border border-slate-200">
        <FileText className="h-10 w-10 text-slate-300 mx-auto"/>
        <h3 className="mt-3 text-sm font-semibold text-slate-900">Application not found</h3>
        <p className="mt-1 text-xs text-slate-500">The requested application ID does not exist in the official queue.</p>
        <Link href="/aicte/applications">
          <Button variant="outline" size="sm" className="mt-4 text-xs">
            <ArrowLeft className="h-3.5 w-3.5 mr-1"/> Return to Queue
          </Button>
        </Link>
      </div>);
    }
    const institution = app.institution || dataService.getInstitutionById(app.institutionId);
    const workingOfficer = getWorkingOfficer(app, userProfile);
    const nextLevel = getNextLevelInfo(app);
    const aiReport = reports.find((r) => r.reportType === "AI_SCRUTINY_PRE_CHECK");
  let aiMeta = null;
  if (aiReport?.metadataJson) {
    try {
      aiMeta = JSON.parse(aiReport.metadataJson);
    } catch (e) {}
  }

  // Active deficiency guard: Application is currently awaiting institutional response
  const pendingDefFromApp = (app?.deficiencies || app?.deficiencyRequests || []).find((d) => d.status === "pending");
  const isDeficiencyActive = Boolean(
    app?.hasActiveDeficiency ||
    app?.status === "awaiting_institution" ||
    app?.currentStageId === "clarification" ||
    pendingDefFromApp ||
    agentActions?.some((a) => a.status === "EXECUTED" && a.action_type === "PROPOSE_DEFICIENCY_NOTICE" && a.deficiency_status === "pending")
  );
  const activeDeficiency = app?.activeDeficiency || (pendingDefFromApp ? {
    id: pendingDefFromApp.id,
    cycleNumber: app?.returnCount || 1,
    dueAt: pendingDefFromApp.dueAt || app?.dueAt,
  } : null);

  // 0. Action: Authenticated View PDF
  const handleViewPdf = async (doc) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${doc.id}/download?inline=true`, {
        headers: {
          "x-user-id": userProfile?.uid || userProfile?.employeeCode || "DEMO-AIC-034",
        },
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNotificationBanner({
          type: "error",
          message: err.error || `Document file payload unavailable on server storage (HTTP ${res.status}).`,
        });
        return;
      }

      const rawBlob = await res.blob();
      const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });
      const url = window.URL.createObjectURL(pdfBlob);
      window.open(url, "_blank");
    } catch (err) {
      setNotificationBanner({
        type: "error",
        message: `Could not fetch document: ${err.message}`,
      });
    }
  };

  // 1. Action: Return for Clarification (Deficiency)

    const handleReturnDeficiency = async () => {
        if (!deficiencyNotes.trim())
            return;
        try {
            await fetch(`${API_BASE}/aicte/scrutiny/applications/${app.id}/deficiencies`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                },
                credentials: "include",
                body: JSON.stringify({
                    deficiencyText: deficiencyNotes,
                    deficiencyCategory: "Documentation Norms",
                    relatedDocument: docs.find(d => d.verificationStatus === "issue_found")?.documentType || "Statutory Evidence",
                    dueDays: 10,
                }),
            });
        } catch (err) {
            console.error("Deficiency API error:", err);
        }
        dataService.returnForClarification(app.id, deficiencyNotes, {
            uid: userProfile?.uid || "DEMO-AIC-034",
            role: userProfile?.role || "scrutiny_committee",
        });
        setShowClarifyModal(false);
        setDeficiencyNotes("");
        setNotificationBanner("Deficiency letter successfully issued to institution. Status updated to 'Awaiting Institution'.");
        reloadData();
    };
    const handleApproveAgentAction = async (actionId) => {
        if (!actionId || actionProcessing) return;
        setActionProcessing(true);
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
            const res = await fetch(`${API_BASE}/agent/applications/${app.id}/actions/${actionId}/approve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ notes: officerActionNotes }),
                credentials: "include",
            });

            if (res.ok) {
                setNotificationBanner("Agent proposed deficiency notice officially authorized and issued to institution.");
                setOfficerActionNotes("");
                await reloadData();
            } else {
                const err = await res.json().catch(() => ({}));
                setNotificationBanner(err.error || "Failed to authorize agent proposal.");
            }
        } catch (err) {
            setNotificationBanner(err.message || "Approval request error.");
        } finally {
            setActionProcessing(false);
        }
    };

    const handleRejectAgentAction = async () => {
        if (!selectedActionId || !rejectReason.trim() || actionProcessing) return;
        setActionProcessing(true);
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
            const res = await fetch(`${API_BASE}/agent/applications/${app.id}/actions/${selectedActionId}/reject`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ reason: rejectReason.trim() }),
                credentials: "include",
            });

            if (res.ok) {
                setNotificationBanner("Agent proposed action declined. No official notice was issued.");
                setShowRejectModal(false);
                setRejectReason("");
                setSelectedActionId(null);
                await reloadData();
            } else {
                const err = await res.json().catch(() => ({}));
                setNotificationBanner(err.error || "Failed to decline agent action.");
            }
        } catch (err) {
            setNotificationBanner(err.message || "Rejection request error.");
        } finally {
            setActionProcessing(false);
        }
    };

    // 2. Action: Complete Review & Pass Application to Next Level
    const handleAdvanceStage = async () => {
        setSubmittingAdvance(true);
        const nextInfo = getNextLevelInfo(app);
        try {
            const res = await fetch(`${API_BASE}/aicte/applications/${app.id}/forward`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.employeeCode || "DEMO-AIC-034",
                },
                credentials: "include",
                body: JSON.stringify({
                    outcome: "PASS",
                    reason: advanceReason || `Scrutiny observations completed and found satisfactory. Passing case to ${nextInfo.stageName}.`,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setShowAdvanceModal(false);
                setAdvanceReason("");
                setNotificationBanner({
                    type: "success",
                    message: `Application ${app.applicationNumber} successfully passed to next level: ${data.application?.currentStageName || nextInfo.stageName}. Assigned to ${nextInfo.assignedOfficer}.`,
                });
                await reloadData();
                setSubmittingAdvance(false);
                return;
            } else {
                const errData = await res.json().catch(() => ({}));
                setShowAdvanceModal(false);
                setSubmittingAdvance(false);
                setNotificationBanner({
                    type: "error",
                    message: errData.error || `Cannot advance application (HTTP ${res.status}): ${errData.code || "FORWARD_REJECTED"}`,
                });
                return;
            }
        } catch (err) {
            setShowAdvanceModal(false);
            setSubmittingAdvance(false);
            setNotificationBanner({
                type: "error",
                message: err.message || "Network error while forwarding application.",
            });
            return;
        }

        // Local dataService fallback
        const isNextEvc = app.requiresEvc && app.currentStageId === "scrutiny";
        const nextStageId = isNextEvc ? "evc_evaluation" : "standing_hearing_committee";
        const nextStageName = isNextEvc ? "Expert Visiting Committee (EVC)" : "Standing Hearing Committee Review";
        const nextRole = isNextEvc ? "evc_coordinator" : "bureau_officer";
        dataService.advanceStage(
            app.id,
            nextStageId,
            nextStageName,
            nextRole,
            isNextEvc ? "pending_evc" : "awaiting_committee",
            advanceReason || "Scrutiny observations satisfactory. Recommending for next regulatory stage.",
            { uid: userProfile?.uid || "DEMO-AIC-034", role: userProfile?.role || "scrutiny_committee" }
        );
        setShowAdvanceModal(false);
        setAdvanceReason("");
        setNotificationBanner({
            type: "success",
            message: `Application advanced to next level: ${nextStageName} (Assigned to: ${nextInfo.assignedOfficer})`,
        });
        reloadData();
        setSubmittingAdvance(false);
    };
    // 3. Action: Schedule EVC
    const handleScheduleEvc = () => {
        dataService.scheduleEvc({
            applicationId: app.id,
            institutionId: app.institutionId,
            regionId: app.regionId,
            scheduledAt: new Date(evcDate).toISOString(),
            assignedExperts: evcExperts.split(",").map((s) => s.trim()),
            notes: evcNotes,
        }, { uid: userProfile?.uid || "aicte-evc-1", role: userProfile?.role || "evc_coordinator" });
        setShowEvcModal(false);
        setNotificationBanner(`EVC visit scheduled for ${evcDate}. Panel of experts notified.`);
        reloadData();
    };
    // 4. Action: Record Final Decision
    const handleRecordDecision = async () => {
        const condList = decisionConditions
            .split(";")
            .map((c) => c.trim())
            .filter(Boolean);

        try {
            const res = await fetch(`${API_BASE}/aicte/applications/${app.id}/decision`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.employeeCode || "DEMO-AIC-034",
                },
                credentials: "include",
                body: JSON.stringify({
                    decisionType,
                    outcome: decisionType === "approved" ? "APPROVED" : "REJECTED",
                    reasonAndFindings: decisionReason || "Final regulatory decision issued per APH norms.",
                    conditions: condList,
                }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                setShowDecisionModal(false);
                setNotificationBanner({
                    type: "error",
                    message: errData.error || `Cannot record decision (HTTP ${res.status}): ${errData.code || "DECISION_REJECTED"}`,
                });
                return;
            }
        } catch (err) {
            setShowDecisionModal(false);
            setNotificationBanner({
                type: "error",
                message: err.message || "Network error while recording decision.",
            });
            return;
        }

        dataService.recordDecision(app.id, decisionType, decisionReason, condList, { uid: userProfile?.uid || "aicte-authority-1", role: userProfile?.role || "competent_authority" });
        setShowDecisionModal(false);
        setNotificationBanner({
            type: "success",
            message: decisionType === "approved"
                ? "Official AICTE Approval Order issued with conditions."
                : "Application officially rejected.",
        });
        reloadData();
    };
    // 5. Action: Reassign
    const handleReassign = () => {
        dataService.addAuditEvent({
            applicationId: app.id,
            institutionId: app.institutionId,
            actorUid: userProfile?.uid || "admin",
            actorRole: userProfile?.role || "admin",
            action: `Officer Reassigned to ${getRoleLabel(selectedRole)}`,
            reason: `Case workflow assignment transferred to ${getRoleLabel(selectedRole)} for regulatory processing.`,
        });
        setShowAssignModal(false);
        setNotificationBanner(`Case reassigned to ${getRoleLabel(selectedRole)}`);
        reloadData();
    };
    // Set individual document verification status
    const handleSetDocStatus = async (docId, nextStatus, notes) => {
        try {
            await fetch(`${API_BASE}/aicte/scrutiny/documents/${docId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-id": userProfile?.uid || userProfile?.email || "DEMO-AIC-034",
                },
                credentials: "include",
                body: JSON.stringify({
                    status: nextStatus,
                    notes: notes || (nextStatus === "verified" ? "Verified and found compliant with APH norms." : "Deficiency noted during scrutiny."),
                }),
            });
        } catch (err) {
            console.error("Doc status API error:", err);
        }
        dataService.verifyDocument(docId, nextStatus, notes, {
            uid: userProfile?.uid || "DEMO-AIC-034",
            role: userProfile?.role || "scrutiny_committee",
        });
        reloadData();
    };
    const handleToggleDocStatus = (docId, currentStatus) => {
        const nextStatus = currentStatus === "verified" ? "issue_found" : "verified";
        handleSetDocStatus(docId, nextStatus);
    };
    return (<div className="space-y-6">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-4">
        <div className="flex items-center gap-2">
          <Link href="/aicte/applications">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600 px-2">
              <ArrowLeft className="h-3.5 w-3.5 mr-1"/> Work Queue
            </Button>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-mono text-xs font-bold text-slate-900">{app.applicationNumber}</span>
          <StatusBadge status={app.status}/>
        </div>

        {/* Action Bar (Top Right) */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsDelegationOpen(true)} className="text-xs text-blue-800 border-blue-300 hover:bg-blue-50">
            <UserCheck className="h-3.5 w-3.5 mr-1 text-blue-600"/> Delegate Task
          </Button>

          <Button variant="outline" size="sm" onClick={() => setShowAssignModal(true)} className="text-xs text-slate-700">
            <UserCheck className="h-3.5 w-3.5 mr-1"/> Reassign
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowClarifyModal(true)}
            disabled={isDeficiencyActive}
            title={isDeficiencyActive ? `Active deficiency notice pending response (Cycle #${app.returnCount || 1})` : "Return application for institutional clarification"}
            className="text-xs text-amber-800 border-amber-300 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1 text-amber-600"/>
            {isDeficiencyActive ? `Deficiency Notice Active (Cycle #${app.returnCount || 1})` : "Return for Clarification"}
          </Button>

          {app.requiresEvc && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEvcModal(true)}
              disabled={isDeficiencyActive}
              title={isDeficiencyActive ? `EVC inspection locked: Official deficiency notice (Cycle #${app.returnCount || 1}) is awaiting institutional response.` : "Schedule Expert Visiting Committee"}
              className="text-xs text-purple-800 border-purple-300 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Calendar className="h-3.5 w-3.5 mr-1 text-purple-600"/> Schedule EVC
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => setShowAdvanceModal(true)}
            disabled={isDeficiencyActive}
            title={isDeficiencyActive ? `Forwarding locked: Official deficiency notice (Cycle #${app.returnCount || 1}) is awaiting institutional response.` : "Pass application to next regulatory level"}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowRightCircle className="h-3.5 w-3.5 text-blue-100" />
            Send to Next Level ({nextLevel.stageName.split(" ")[0]}...)
          </Button>

          <Button
            size="sm"
            onClick={() => setShowDecisionModal(true)}
            disabled={isDeficiencyActive}
            title={isDeficiencyActive ? `Final decision locked: Official deficiency notice (Cycle #${app.returnCount || 1}) is awaiting institutional response.` : "Record final regulatory decision"}
            className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1 text-emerald-400"/> Record Final Decision
          </Button>
        </div>
      </div>

      {/* Active Deficiency Notice Lock Banner */}
      {isDeficiencyActive && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">Active Deficiency Notice (Cycle #{app.returnCount || activeDeficiency?.cycleNumber || 1}) — Forward Workflow Actions Locked:</span>
              <span className="ml-1 text-slate-700">
                Official statutory deficiency notice was dispatched to {institution?.institutionName || "the applicant institution"}. Passing to next regulatory level and recording final decisions are locked until institutional clarification is submitted and scrutiny review is completed.
              </span>
            </div>
          </div>
          {(app.dueAt || activeDeficiency?.dueAt) && (
            <div className="text-[11px] font-mono text-amber-900 shrink-0 bg-amber-100 px-2.5 py-1 rounded border border-amber-300 font-semibold self-start sm:self-auto">
              Response Due: {new Date(Number(app.dueAt || activeDeficiency?.dueAt) || (app.dueAt || activeDeficiency?.dueAt)).toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      {/* Notification Toast Banner */}
      {notificationBanner && (
        <div className={`rounded-lg border p-3 text-xs flex items-center justify-between shadow-2xs ${
          (typeof notificationBanner === "object" && notificationBanner.type === "error")
            ? "border-red-200 bg-red-50 text-red-900"
            : (typeof notificationBanner === "object" && notificationBanner.type === "success")
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-blue-200 bg-blue-50 text-blue-900"
        }`}>
          <div className="flex items-center gap-2">
            {typeof notificationBanner === "object" && notificationBanner.type === "error" ? (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
            )}
            <span>{typeof notificationBanner === "object" ? notificationBanner.message : notificationBanner}</span>
          </div>
          <button onClick={() => setNotificationBanner(null)} className="opacity-70 hover:opacity-100 text-xs font-bold shrink-0 ml-3">
            ✕
          </button>
        </div>
      )}

      {/* Case Header Strip (Jira Detail Banner with Active Officer & Pipeline) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="font-semibold text-slate-900">{institution?.institutionName}</span>
              <span>•</span>
              <span className="font-mono">PID: {institution?.institutionCode}</span>
              <span>•</span>
              <span className="capitalize">{app.regionId} Regional Office</span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">
              {(app?.applicationCategory && APPLICATION_CATEGORY_LABELS[app.applicationCategory]) || getApplicationCategoryLabel(app?.applicationCategory)} — Case Review
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Current Stage: <strong className="text-slate-900">{app.currentStageName || "Scrutiny Review"}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-6">
            {/* Working Officer */}
            <div className="min-w-[140px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Working Officer
              </p>
              <p className="text-xs font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                {workingOfficer?.name}
                <span className="text-[9px] font-mono px-1 py-0.2 bg-slate-100 rounded text-slate-600 border border-slate-200">
                  {workingOfficer?.code}
                </span>
              </p>
              <p className="text-[10px] text-slate-500 truncate max-w-[170px]">{workingOfficer?.role}</p>
            </div>

            {/* Next Level Target */}
            <div className="min-w-[140px]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 flex items-center gap-1">
                <ArrowRight className="h-2.5 w-2.5" /> Next Level
              </p>
              <p className="text-xs font-bold text-blue-900 mt-0.5 truncate max-w-[180px]">
                {nextLevel.stageName}
              </p>
              <p className="text-[10px] text-slate-500 truncate max-w-[170px]">{nextLevel.assignedOfficer}</p>
            </div>

            {/* Regulatory SLA */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Regulatory SLA Window
              </p>
              <div className="mt-0.5">
                <SlaCountdown dueAt={app.dueAt}/>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Progress Stepper */}
      <WorkflowStepper currentStageId={app.currentStageId} status={app.status} requiresEvc={app.requiresEvc}/>

      {/* Application Case Team Hierarchy */}
      <ApplicationTeamWidget
        applicationId={app.id}
        onOpenMessage={(contact) => {
          setCommsRecipient(contact);
          setActiveTab("communication");
        }}
        onOpenDelegate={() => setIsDelegationOpen(true)}
      />

      {/* Main 2-Column Inspector Layout (Jira Style) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Dossier Tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs Navigation */}
          <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 rounded-t-lg overflow-x-auto">
            {[
              { id: "overview", label: "Dossier & Intake" },
              { id: "documents", label: `Documents (${docs.length})` },
              {
                id: "communication",
                label: "Communication & Team",
                badgeText: "Connected",
                badgeColor: "bg-blue-100 text-blue-800 border-blue-200",
              },
              {
                id: "ai_scrutiny",
                label: "AI Scrutiny & Pre-Check",
                isAi: true,
                badgeText: aiJobProgress
                  ? "Running Pre-Check..."
                  : !aiReport
                  ? "Pending Run"
                  : aiMeta?.llmAnalysis?.status === "TECHNICAL_FAILURE"
                  ? "Completed (LLM Warning)"
                  : aiReport.outcome === "RECOMMEND_ACCEPT"
                  ? "Compliant"
                  : "Deficiency Flagged",
                badgeColor: aiJobProgress
                  ? "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                  : !aiReport
                  ? "bg-slate-100 text-slate-700 border-slate-300"
                  : aiMeta?.llmAnalysis?.status === "TECHNICAL_FAILURE"
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : aiReport.outcome === "RECOMMEND_ACCEPT"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : "bg-red-100 text-red-800 border-red-300",
              },
              {
                id: "deficiency",
                label: `Observations & Deficiencies (${app.returnCount || 0})`,
                badgeText: agentActions.some(a => a.status === "WAITING_FOR_APPROVAL") ? "Action Required" : null,
                badgeColor: "bg-amber-100 text-amber-800 border-amber-300 animate-pulse",
              },
              { id: "evc", label: "EVC Inspection" },
              { id: "audit", label: `Audit Log (${auditEvents.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 shrink-0 ${
                  activeTab === tab.id
                    ? "border-indigo-600 text-indigo-900 font-bold bg-indigo-50/40 rounded-t"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.isAi && <Sparkles className="h-3.5 w-3.5 text-indigo-600" />}
                <span>{tab.label}</span>
                {tab.badgeText && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${tab.badgeColor || "bg-slate-100 text-slate-700"}`}>
                    {tab.badgeText}
                  </span>
                )}
              </button>
            ))}
          </div>



          {/* Tab 1: Overview & Data */}
          {activeTab === "overview" && (<Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Institutional Profile & Dynamic Dossier Metrics
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Submitted statutory data for approval evaluation
                  </CardDescription>
                </div>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {Object.keys(app.formData || {}).length} fields recorded
                </span>
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {Object.keys(app.formData || {}).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                    {Object.entries(app.formData || {}).filter(([k]) => !k.startsWith("_") && k !== "declaration").map(([k, v]) => (
                      <div key={k} className="border-b border-slate-100 pb-2">
                        <span className="text-slate-500 block font-medium capitalize">
                          {k.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold text-slate-900 block mt-0.5 break-words">
                          {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v || "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 block">Department / Discipline</span>
                      <span className="font-semibold text-slate-900 block mt-0.5">Computer Engineering</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Academic Year</span>
                      <span className="font-semibold text-slate-900 block mt-0.5">2026-2027</span>
                    </div>
                  </div>
                )}

                {app.formData?.justification && (
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-slate-500 block font-medium">Justification Statement</span>
                    <p className="mt-1 text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed font-normal">
                      {String(app.formData.justification)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>)}

          {/* Tab: Communication & Case Team */}
          {activeTab === "communication" && (
            <ApplicationCommunicationPanel
              applicationId={app.id}
              initialRecipient={commsRecipient}
              onClearInitialRecipient={() => setCommsRecipient(null)}
            />
          )}

          {/* Tab 2: Document Verification Matrix (Interactive!) */}
          {activeTab === "documents" && (<Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Statutory Documents Verification Matrix ({docs.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Verify statutory certificates against municipal, revenue, and state council databases
                  </CardDescription>
                </div>
              </CardHeader>
              <div className="divide-y divide-slate-100">
                {docs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No documents uploaded for this application.
                  </div>
                ) : (
                  docs.map((doc) => (<div key={doc.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{doc.documentType}</span>
                        <DocumentBadge status={doc.verificationStatus}/>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {doc.originalFilename} • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                        {doc.fileSize ? ` • ${(doc.fileSize / (1024 * 1024)).toFixed(2)} MB` : ""}
                      </p>
                      {doc.notes && (<p className="mt-1 text-[11px] text-slate-600 bg-slate-50 p-1.5 rounded border border-slate-200">
                          <strong>Note:</strong> {doc.notes}
                        </p>)}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleViewPdf(doc)} className="h-7 text-xs px-2 text-blue-600 hover:text-blue-800">
                        <Eye className="h-3.5 w-3.5 mr-1"/> View PDF
                      </Button>
                      <Button size="sm" variant={doc.verificationStatus === "verified" ? "default" : "outline"} onClick={() => handleSetDocStatus(doc.id, "verified")} className={`h-7 text-xs ${doc.verificationStatus === "verified"
                    ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                    : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"}`}>
                        <Check className="h-3 w-3 mr-1"/> Verified
                      </Button>
                      <Button size="sm" variant={doc.verificationStatus === "issue_found" ? "default" : "outline"} onClick={() => handleSetDocStatus(doc.id, "issue_found", "Flagged issue in certificate validity or norms")} className={`h-7 text-xs ${doc.verificationStatus === "issue_found"
                    ? "bg-amber-700 hover:bg-amber-800 text-white"
                    : "text-slate-700 hover:bg-amber-50 hover:text-amber-800 border-amber-200"}`}>
                        Flag Issue
                      </Button>
                    </div>
                  </div>))
                )}
              </div>
            </Card>)}

          {/* Tab: AI Scrutiny Pre-Check */}
          {activeTab === "ai_scrutiny" && (
            <div className="space-y-4">
              <Card className="border border-indigo-200 shadow-xs bg-white">
                <CardHeader className="p-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <CardTitle className="text-sm font-semibold text-slate-900">
                        AI Scrutiny Advisory Pre-Check
                      </CardTitle>
                      <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                        APH 2024-2027 Norms
                      </span>
                    </div>
                    <CardDescription className="text-xs text-slate-500 mt-1">
                      Automated statutory rules + Groq LLM qualitative analysis. Non-binding advisory evaluation for Scrutiny Committee.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleTriggerAi}
                      disabled={triggeringAi}
                      className="h-8 text-xs bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggeringAi ? "animate-spin" : ""}`} />
                      {triggeringAi ? "Analyzing..." : "Re-Run AI Scrutiny"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  {/* Live Progress Banner */}
                  {aiJobProgress && (
                    <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-lg flex items-center gap-3">
                      <Loader2 className="h-5 w-5 text-indigo-600 animate-spin shrink-0" />
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-indigo-950 text-xs">
                            AI Scrutiny Analysis Running
                          </span>
                          {aiJobProgress.jobId && (
                            <span className="font-mono text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded border border-indigo-200">
                              {aiJobProgress.jobId}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-indigo-800">
                          {aiJobProgress.message}
                        </p>
                      </div>
                    </div>
                  )}

                  {!aiReport && !aiJobProgress ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                      <Bot className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                      <p className="font-semibold text-slate-800 text-sm">No AI Scrutiny Report Yet</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        Trigger the automated pre-check to extract document text, evaluate APH 2024-2027 statutory rules, and run Groq LLM qualitative analysis.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => handleTriggerAi({ forceRerun: true, retryLlm: false })}
                        disabled={triggeringAi}
                        className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8"
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Run AI Pre-Check Now
                      </Button>
                    </div>
                  ) : aiReport && (
                    <>
                      {/* Autonomous Agent Proposed Deficiency Notice (waiting approval or historical executed/rejected record) */}
                      {agentActions && agentActions.length > 0 && (
                        <AgentDeficiencyProposalCard
                          action={
                            agentActions.find(a => a.status === "WAITING_FOR_APPROVAL") || agentActions.find(a => a.status === "EXECUTED") || agentActions[0]
                          }
                          onApprove={handleApproveAgentAction}
                          onOpenReject={(actionId) => {
                            setSelectedActionId(actionId);
                            setShowRejectModal(true);
                          }}
                          actionProcessing={actionProcessing}
                          officerNotes={officerActionNotes}
                          setOfficerNotes={setOfficerActionNotes}
                          currentVersionHash={aiMeta?.versionHash}
                        />
                      )}

                      {/* Executive Summary Card (Clean, Styled, No Raw Markdown) */}
                      <AiExecutiveSummary
                        content={aiReport.content}
                        outcome={aiReport.outcome}
                        versionHash={aiMeta?.versionHash}
                      />

                      {/* Dossier & Run Provenance Metadata Pills */}
                      <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                        {aiMeta?.versionHash && (
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                            Version Hash: {aiMeta.versionHash.slice(0, 12)}...
                          </span>
                        )}
                        {aiMeta?.reusedReport ? (
                          <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                            Canonical Report Reused (Unchanged Documents)
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                            Fresh Scrutiny Evaluation
                          </span>
                        )}
                        {aiMeta?.isResubmission && (
                          <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                            Event-Triggered Resubmission Scrutiny
                          </span>
                        )}
                      </div>

                      {/* Resubmission Scrutiny Audit Matrix (if available) */}
                      {aiMeta?.resubmissionDiff && aiMeta.resubmissionDiff.length > 0 && (
                        <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <h5 className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                              <ShieldCheck className="h-4 w-4 text-blue-600" />
                              Resubmission Comparison Audit Diff
                            </h5>
                            <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-300">
                              Resubmission vs. Prior Report
                            </span>
                          </div>
                          <div className="space-y-1.5 pt-1">
                            {aiMeta.resubmissionDiff.map((diffItem, didx) => (
                              <div key={didx} className="p-2.5 bg-white border border-blue-100 rounded text-xs flex items-center justify-between gap-2">
                                <div>
                                  <span className="font-semibold text-slate-900">{diffItem.rule_name}</span>
                                  <p className="text-[11px] text-slate-600 mt-0.5">{diffItem.note}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                                  diffItem.classification === "RESOLVED"
                                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                    : diffItem.classification === "STILL_OUTSTANDING"
                                    ? "bg-red-100 text-red-800 border border-red-300"
                                    : "bg-amber-100 text-amber-800 border border-amber-300"
                                }`}>
                                  {diffItem.classification}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section 1: Deterministic Statutory Rules (Category-Aware) */}
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-indigo-700" />
                            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                              Statutory Scrutiny Checklist (APH 2024-2027)
                            </h4>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-md">
                              Category: {aiMeta?.categoryLabel || getApplicationCategoryLabel(app.applicationCategory)}
                            </span>
                            {aiMeta?.category && (
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                                {aiMeta.category}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Unsupported Category Alert Banner */}
                        {aiMeta?.unsupportedCategory && (
                          <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-lg text-xs space-y-1.5">
                            <div className="flex items-center gap-2 font-bold text-amber-950">
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                              <span>Unsupported Application Category — Manual Officer Scrutiny Required</span>
                            </div>
                            <p className="text-[11px] text-amber-900 leading-relaxed">
                              This application category is not mapped to an automated statutory rule matrix under the AICTE Approval Process Handbook (APH 2024-27). Scrutiny Committee officers must conduct manual case-by-case scrutiny of all statutory submissions.
                            </p>
                          </div>
                        )}

                        {/* Category-Specific Statutory Checks */}
                        {(() => {
                          const allFindings = aiMeta?.findings || [];
                          const categoryFindings = allFindings.filter((f) => !f.is_common_check);
                          const commonFindings = allFindings.filter((f) => f.is_common_check);

                          const renderFindingCard = (f, idx) => {
                            const isCompliant = f.status === "COMPLIANT";
                            const isDeficient = f.status === "DEFICIENT";
                            const isNotApplicable = f.status === "NOT_APPLICABLE";
                            const isTechnicalError = f.status === "TECHNICAL_ERROR";

                            const cardBg = isCompliant
                              ? "bg-emerald-50/30 border-emerald-200"
                              : isDeficient
                              ? "bg-red-50/30 border-red-200"
                              : isNotApplicable
                              ? "bg-slate-50 border-slate-200 opacity-80"
                              : isTechnicalError
                              ? "bg-orange-50/30 border-orange-200"
                              : "bg-amber-50/30 border-amber-200";

                            const badgeStyle = isCompliant
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : isDeficient
                              ? "bg-red-100 text-red-800 border-red-300"
                              : isNotApplicable
                              ? "bg-slate-100 text-slate-600 border-slate-300"
                              : isTechnicalError
                              ? "bg-orange-100 text-orange-800 border-orange-300"
                              : "bg-amber-100 text-amber-800 border-amber-300";

                            return (
                              <div key={idx} className={`p-3 rounded-lg border transition ${cardBg}`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-slate-900 text-xs">{f.rule_name}</span>
                                      <span className="text-[10px] text-slate-600 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                        {f.aph_clause}
                                      </span>
                                      {f.aph_chapter && (
                                        <span className="text-[9px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                                          {f.aph_chapter}
                                        </span>
                                      )}
                                      {f.document_name && (
                                        <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                          Doc: {f.document_name}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-700 leading-relaxed">
                                      <strong className="text-slate-900">Evidence:</strong> {f.evidence}
                                    </p>
                                    <p className="text-[11px] text-slate-600">
                                      <strong className="text-slate-800">Recommendation:</strong> {f.recommendation}
                                    </p>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase shrink-0 border ${badgeStyle}`}>
                                    {isNotApplicable
                                      ? "NOT APPLICABLE"
                                      : isTechnicalError
                                      ? "TECH ERROR"
                                      : f.status}
                                  </span>
                                </div>
                              </div>
                            );
                          };

                          if (allFindings.length === 0) {
                            return <p className="text-slate-400 italic text-xs">No deterministic findings recorded.</p>;
                          }

                          return (
                            <div className="space-y-4">
                              {categoryFindings.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                                    <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block"></span>
                                    Category-Specific Statutory Checks ({aiMeta?.categoryLabel || "Application Specific"})
                                  </div>
                                  {categoryFindings.map(renderFindingCard)}
                                </div>
                              )}

                              {commonFindings.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700">
                                    <span className="w-2 h-2 rounded-full bg-slate-400 inline-block"></span>
                                    Common Statutory Baseline Checks
                                  </div>
                                  {commonFindings.map(renderFindingCard)}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Section 2: Groq LLM Qualitative Scrutiny */}
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2.5">
                          <h4 className="font-semibold text-indigo-950 text-xs uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                            Groq LLM Qualitative & Contextual Scrutiny
                          </h4>
                        {/* Advisory Only Disclaimer Pill */}
                        <div className="mb-2.5 p-2 bg-purple-50/70 rounded border border-purple-200 text-[11px] text-purple-900 flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                          <span>
                            <strong>Advisory Only — Not in Formal Deficiency Notice:</strong> Qualitative LLM observations highlight context and evidence gaps for human committee consideration; they are strictly excluded from the official statutory deficiency notice unless backed by an established deterministic APH rule.
                          </span>
                        </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              aiMeta?.llmAnalysis?.status === "SUCCESS"
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : aiMeta?.llmAnalysis?.status === "TECHNICAL_FAILURE"
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : "bg-amber-100 text-amber-800 border border-amber-300"
                            }`}>
                              Status: {aiMeta?.llmAnalysis?.status || "UNKNOWN"}
                            </span>
                            <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-200">
                              Model: {aiMeta?.llmAnalysis?.model || "llama-3.3-70b-versatile"}
                            </span>
                          </div>
                        </div>

                        {/* Distinct State Handling: SKIPPED */}
                        {aiMeta?.llmAnalysis?.status === "SKIPPED" && (
                          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs space-y-1.5">
                            <div className="flex items-center gap-2 font-semibold text-amber-900">
                              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                              <span>Qualitative LLM Scrutiny Skipped</span>
                            </div>
                            <p className="text-amber-800 text-[11px] leading-relaxed">
                              {aiMeta.llmAnalysis.summary || "Groq LLM qualitative scrutiny skipped: GROQ_API_KEY is not configured."}
                            </p>
                            <p className="text-[11px] text-amber-900/80 pt-1.5 border-t border-amber-200/80 font-medium">
                              Deterministic statutory pre-checks above were evaluated independently and remain authoritative. AICTE Scrutiny Committee officers must perform qualitative cross-verification manually.
                            </p>
                          </div>
                        )}

                        {/* Distinct State Handling: TECHNICAL_FAILURE */}
                        {aiMeta?.llmAnalysis?.status === "TECHNICAL_FAILURE" && (
                          <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-lg text-xs space-y-2">
                            <div className="flex items-center gap-2 font-semibold text-red-900">
                              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                              <span>Qualitative Scrutiny Technical Failure</span>
                            </div>
                            <p className="text-red-800 text-[11px] leading-relaxed">
                              {aiMeta.llmAnalysis.errorMessage || aiMeta.llmAnalysis.summary || "An unexpected error occurred during Groq LLM inference."}
                            </p>
                            <p className="text-[11px] text-red-900/80 pt-1 border-t border-red-200/80 font-medium">
                              Advisory LLM analysis did not complete. Deterministic statutory rules remain valid and unimpacted for committee review.
                            </p>
                            <div className="pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTriggerAi({ forceRerun: true, retryLlm: true })}
                                disabled={triggeringAi}
                                className="text-xs bg-white border-red-300 text-red-800 hover:bg-red-50 h-7"
                              >
                                <RefreshCw className={`h-3 w-3 mr-1 ${triggeringAi ? "animate-spin" : ""}`} />
                                Retry Qualitative LLM Scrutiny
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Distinct State Handling: DISABLED */}
                        {aiMeta?.llmAnalysis?.status === "DISABLED" && (
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                            <p className="font-semibold text-slate-800">Qualitative Scrutiny Disabled</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              LLM inference is disabled by configuration (GROQ_ENABLED=false).
                            </p>
                          </div>
                        )}

                        {/* Distinct State Handling: SUCCESS (Only state allowed to claim verified) */}
                        {aiMeta?.llmAnalysis?.status === "SUCCESS" && (
                          <div className="space-y-2">
                            {(!aiMeta?.llmFindings || aiMeta.llmFindings.length === 0) ? (
                              <div className="p-4 bg-emerald-50/50 rounded-lg border border-emerald-200 text-center text-emerald-900">
                                <p className="text-xs font-semibold">No qualitative inconsistencies or conditional clauses flagged.</p>
                                <p className="text-[11px] text-emerald-700 mt-0.5">
                                  Groq scrutiny verified cross-document institutional naming and declarations without discrepancies.
                                </p>
                              </div>
                            ) : (
                              aiMeta.llmFindings.map((lf, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-lg border border-purple-200 bg-purple-50/20 text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-900 text-xs">
                                        {lf.finding_type?.replace(/_/g, " ")}
                                      </span>
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                                        {lf.severity_suggestion || "ADVISORY_LOW"}
                                      </span>
                                      {lf.confidence && (
                                        <span className="text-[10px] text-slate-500 font-mono">
                                          Conf: {Math.round(lf.confidence * 100)}%
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {lf.excerpt_verified === true && (
                                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                                          Verified Source Excerpt
                                        </span>
                                      )}
                                      {lf.excerpt_verified === false && (
                                        <span className="text-[10px] font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-300">
                                          Manual Excerpt Verification Required
                                        </span>
                                      )}
                                      {lf.document_name && (
                                        <span className="text-[11px] text-slate-500 font-mono">
                                          {lf.document_name} {lf.page_number ? `(p. ${lf.page_number})` : ""}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-slate-800 leading-relaxed font-normal">
                                    {lf.explanation}
                                  </p>
                                  {lf.evidence_excerpt && (
                                    <blockquote className="border-l-2 border-purple-400 pl-2.5 py-0.5 text-[11px] text-slate-600 italic bg-white/70 rounded-r">
                                      &ldquo;{lf.evidence_excerpt}&rdquo;
                                    </blockquote>
                                  )}
                                  {lf.facts_vs_inference && (
                                    <p className="text-[11px] text-slate-600 bg-white/60 p-1.5 rounded border border-purple-100">
                                      <strong>Factual Basis vs. Inference:</strong> {lf.facts_vs_inference}
                                    </p>
                                  )}
                                  <p className="text-[11px] text-indigo-700 font-medium">
                                    <strong>Scrutiny Recommendation:</strong> {lf.human_review_recommendation}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tab 3: Observations & Deficiencies */}
          {activeTab === "deficiency" && (
            <div className="space-y-4">
              {agentActions && agentActions.length > 0 && (
                <AgentDeficiencyProposalCard
                  action={
                    agentActions.find(a => a.status === "WAITING_FOR_APPROVAL") || agentActions.find(a => a.status === "EXECUTED") || agentActions[0]
                  }
                  onApprove={handleApproveAgentAction}
                  onOpenReject={(actionId) => {
                    setSelectedActionId(actionId);
                    setShowRejectModal(true);
                  }}
                  actionProcessing={actionProcessing}
                  officerNotes={officerActionNotes}
                  setOfficerNotes={setOfficerActionNotes}
                  currentVersionHash={aiMeta?.versionHash}
                />
              )}

<Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Deficiency Letters & Clarifications
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Official queries issued to institution and corresponding rejoinders
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowClarifyModal(true)}
                  disabled={isDeficiencyActive}
                  title={isDeficiencyActive ? `Deficiency Notice Active (Cycle #${app.returnCount || 1}). Institution must respond before new queries can be issued.` : "Issue Deficiency Letter"}
                  className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="h-3 w-3 mr-1"/>
                  {isDeficiencyActive ? `Deficiency Active (Cycle #${app.returnCount || 1})` : "Issue Deficiency Letter"}
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                {app.returnCount && app.returnCount > 0 ? (<div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900">Deficiency Cycle #{app.returnCount}</span>
                      <span className="text-[11px] text-amber-700">Issued by Regional Scrutiny Officer</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      {app.nextActionDescription}
                    </p>
                  </div>) : (<div className="p-6 text-center text-slate-500">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2"/>
                    <p className="text-xs font-semibold text-slate-800">No deficiencies recorded</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      All submitted documents currently satisfy preliminary checklist criteria.
                    </p>
                  </div>)}
              </CardContent>
            </Card>
            </div>)}

          {/* Tab 4: EVC Inspection */}
          {activeTab === "evc" && (<Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-900">
                    Expert Visiting Committee (EVC) Schedule
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Physical/virtual infrastructure and laboratory inspection panel
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setShowEvcModal(true)} className="h-7 text-xs bg-purple-700 hover:bg-purple-800 text-white">
                  <Calendar className="h-3 w-3 mr-1"/> Schedule / Reschedule EVC
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-slate-500 block">EVC Mandatory Status</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">
                      {app.requiresEvc ? "Mandatory for this Category" : "Optional / Waived"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Inspection Status</span>
                    <span className="font-semibold text-purple-700 block mt-0.5">
                      {app.status === "pending_evc" ? "Scheduled / Panel Formed" : "Pending Action"}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-slate-500 block font-medium">Assigned Expert Panel Members:</span>
                  {app.evcVisit?.assignedExperts && app.evcVisit.assignedExperts.length > 0 ? (
                    <ul className="mt-2 space-y-1.5 list-disc pl-4 text-slate-800 font-medium">
                      {app.evcVisit.assignedExperts.map((expert, idx) => (
                        <li key={idx}>{expert}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-slate-400 italic">No expert inspection panel assigned yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>)}

          {/* Tab 5: Chronological Audit Log */}
          {activeTab === "audit" && (<Card className="border border-slate-200/90 shadow-2xs bg-white">
              <CardHeader className="p-4 border-b border-slate-100">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Regulatory Case Audit Log
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Tamper-evident chronological timeline of all transitions, comments, and outcomes
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <AuditTimeline events={auditEvents}/>
              </CardContent>
            </Card>)}
        </div>

        {/* Right Column (1 Col): Jira Meta Inspector Panel */}
        <div className="space-y-6">
          {/* AI Scrutiny Assistant Widget */}
          <Card className="border border-indigo-200 shadow-2xs bg-gradient-to-b from-white to-indigo-50/40">
            <CardHeader className="p-3.5 border-b border-indigo-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                  AI Scrutiny Pre-Check
                </CardTitle>
              </div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">
                APH 2024-2027
              </span>
            </CardHeader>
            <CardContent className="p-3.5 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Pre-Check Result:</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                  aiReport?.outcome === "RECOMMEND_ACCEPT"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : aiReport?.outcome === "DEFICIENCY_SUGGESTED"
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-slate-100 text-slate-700 border border-slate-300"
                }`}>
                  {aiReport?.outcome || "Pending Run"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Statutory Rules:</span>
                <span className="font-semibold text-slate-800">
                  {aiMeta?.findings?.length || 0} checks evaluated
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Groq LLM Observations:</span>
                <span className="font-semibold text-purple-700">
                  {aiMeta?.llmFindings?.length || 0} flagged
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => setActiveTab("ai_scrutiny")}
                className="w-full h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white mt-1 shadow-2xs font-semibold"
              >
                <Sparkles className="h-3 w-3 mr-1" /> Inspect Scrutiny Findings
              </Button>
            </CardContent>
          </Card>

          <Card className="border border-slate-200/90 shadow-2xs bg-white">
            <CardHeader className="p-4 border-b border-slate-100">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Case Details
              </CardTitle>
            </CardHeader>

            <CardContent className="p-4 space-y-3.5 text-xs">
              <div>
                <span className="text-slate-500 block">Workflow State</span>
                <div className="mt-1">
                  <StatusBadge status={app.status}/>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Assigned Bureau</span>
                <span className="font-semibold text-slate-900 block mt-0.5 capitalize">
                  {app.regionId} Regional Office
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Handling Officer Role</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.currentAssigneeRole
            ? app.currentAssigneeRole.replace(/_/g, " ").toUpperCase()
            : "Terminal"}
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">SLA Expiry Date</span>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-medium text-slate-800">
                    {app.dueAt ? new Date(app.dueAt).toLocaleDateString("en-IN") : "—"}
                  </span>
                  <SlaCountdown dueAt={app.dueAt}/>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Deficiency Cycles Count</span>
                <span className="font-semibold text-slate-900 block mt-0.5">
                  {app.returnCount || 0} times returned
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Institutional Statutory Profile Box */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-blue-600"/>
              Institutional Contact
            </h4>
            <p className="font-semibold text-slate-800">{institution?.institutionName}</p>
            <p className="text-slate-600">{institution?.address}</p>
            <p className="text-slate-600">Email: {institution?.contactEmail}</p>
            <p className="text-slate-600">Phone: {institution?.contactPhone}</p>
          </div>
        </div>
      </div>

      {/* 1. Return for Clarification Dialog */}
      <Dialog open={showClarifyModal} onOpenChange={setShowClarifyModal} title="Issue Deficiency Letter (Return to Institution)" description={`Formal statutory deficiency notice for ${app.applicationNumber}`}>
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Deficiency Items & Specific Rectifications Required
            </Label>
            <Textarea rows={4} value={deficiencyNotes} onChange={(e) => setDeficiencyNotes(e.target.value)} placeholder="State the non-compliant items per AICTE Approval Process Handbook (e.g. Expired Fire Safety NOC, inadequate cadre ratio, incomplete land deed)..." className="text-xs"/>
          </div>

          <div className="rounded-md bg-amber-50 p-3 border border-amber-200 text-amber-800">
            <p className="font-semibold">Notice:</p>
            <p className="mt-0.5">
              The institution will receive an automated email alert and 10 days to upload rectified evidence before the portal closes.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowClarifyModal(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!deficiencyNotes.trim()} onClick={handleReturnDeficiency} className="bg-amber-600 hover:bg-amber-700 text-white">
              Dispatch Deficiency Letter
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 2. Send Application to Next Level Dialog */}
      <Dialog
        open={showAdvanceModal}
        onOpenChange={setShowAdvanceModal}
        title="Pass Application to Next Level"
        description={`Formal regulatory stage forwarding for ${app.applicationNumber}`}
      >
        <div className="space-y-4 text-xs">
          {/* Level Transition Visual Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Current Level Box */}
              <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Current Level (Being Completed)
                </span>
                <p className="font-bold text-slate-900 text-xs">
                  {app.currentStageName || "Scrutiny Committee Review"}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-600">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{workingOfficer?.name}</span>
                  <span className="font-mono text-[9px] bg-slate-100 px-1 rounded text-slate-500 border border-slate-200">
                    {workingOfficer?.code}
                  </span>
                </div>
              </div>

              {/* Next Level Box */}
              <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block mb-1">
                  Next Level (Target Destination)
                </span>
                <p className="font-bold text-blue-950 text-xs">
                  {nextLevel.stageName}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-800">
                  <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="font-semibold">{nextLevel.assignedOfficer}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-200/60 pt-2">
              <strong>Mandate:</strong> {nextLevel.description}
            </p>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Officer Scrutiny Observation & Handover Recommendation Endorsement *
            </Label>
            <Textarea
              rows={3}
              value={advanceReason}
              onChange={(e) => setAdvanceReason(e.target.value)}
              placeholder="e.g. Scrutiny observations completed. All primary statutory documents verified against AICTE APH Chapter I/II norms. Passing application to next level for further evaluation."
              className="text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanceModal(false)} disabled={submittingAdvance}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAdvanceStage}
              disabled={submittingAdvance}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5"
            >
              {submittingAdvance ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Passing to Next Level...
                </>
              ) : (
                <>
                  <ArrowRightCircle className="h-3.5 w-3.5" /> Confirm & Pass to {nextLevel.stageName.split(" ")[0]}
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 3. Schedule EVC Dialog */}
      <Dialog open={showEvcModal} onOpenChange={setShowEvcModal} title="Schedule Expert Visiting Committee (EVC)" description={`Constitutes inspection panel for ${app.applicationNumber}`}>
        <div className="space-y-3.5 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Proposed Inspection Date</Label>
            <Input type="date" value={evcDate} onChange={(e) => setEvcDate(e.target.value)} className="h-8 text-xs"/>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Assigned Expert Committee Members (Comma-separated)
            </Label>
            <Input value={evcExperts} onChange={(e) => setEvcExperts(e.target.value)} className="h-8 text-xs"/>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Special Inspection Directives</Label>
            <Textarea rows={3} value={evcNotes} onChange={(e) => setEvcNotes(e.target.value)} className="text-xs"/>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowEvcModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleScheduleEvc} className="bg-purple-700 text-white">
              Confirm & Dispatch Orders
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 5. Decline Agent Action Dialog */}
      <Dialog
        open={showRejectModal}
        onOpenChange={setShowRejectModal}
        title="Decline Autonomous Agent Proposal"
        description="Provide a formal regulatory reason for declining the agent's proposed action."
      >
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Officer Justification for Declining (Mandatory)
            </Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="State why the proposed deficiency is not being issued (e.g., institution granted extension, manual document verification satisfied, statutory exemption applies)..."
              className="text-xs"
            />
          </div>
          <div className="rounded-md bg-slate-50 p-3 border border-slate-200 text-slate-700">
            <p className="font-semibold text-slate-900">Audited Record:</p>
            <p className="mt-0.5">
              Declining will record your rationale in the regulatory audit trail. No deficiency notice will be dispatched, and the application status remains unchanged.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowRejectModal(false)} disabled={actionProcessing}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!rejectReason.trim() || actionProcessing}
              onClick={handleRejectAgentAction}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {actionProcessing ? "Declining..." : "Confirm Decline Proposal"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 4. Record Final Decision Dialog */}
      <Dialog open={showDecisionModal} onOpenChange={setShowDecisionModal} title="Record Final Regulatory Decision" description={`Executive order for ${app.applicationNumber}`}>
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Decision Outcome</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="decision" checked={decisionType === "approved"} onChange={() => setDecisionType("approved")}/>
                <span className="font-bold text-emerald-700">Grant Approval (Issue EoA Order)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="decision" checked={decisionType === "rejected"} onChange={() => setDecisionType("rejected")}/>
                <span className="font-bold text-rose-700">Reject Application</span>
              </label>
            </div>
          </div>

          <div>
            <Label className="font-semibold text-slate-800 block mb-1">
              Executive Rationale & Committee Findings
            </Label>
            <Textarea rows={3} value={decisionReason} onChange={(e) => setDecisionReason(e.target.value)} className="text-xs"/>
          </div>

          {decisionType === "approved" && (<div>
              <Label className="font-semibold text-slate-800 block mb-1">
                Post-Approval Conditions / Undertakings (Semicolon-separated)
              </Label>
              <Textarea rows={2} value={decisionConditions} onChange={(e) => setDecisionConditions(e.target.value)} className="text-xs"/>
              <p className="mt-1 text-[11px] text-slate-400">
                These conditions will automatically generate enforceable compliance undertakings for the institution.
              </p>
            </div>)}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowDecisionModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRecordDecision} className={decisionType === "approved"
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "bg-rose-600 hover:bg-rose-700 text-white"}>
              Seal and Execute Decision
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 5. Reassign Dialog */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal} title="Reassign Case Handler" description={`Transfer regulatory responsibility for ${app.applicationNumber}`}>
        <div className="space-y-4 text-xs">
          <div>
            <Label className="font-semibold text-slate-800 block mb-1">Target Officer Role</Label>
            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="w-full h-8 px-2 rounded border border-slate-200 text-xs text-slate-800">
              {AICTE_ROLES.map((role) => (<option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="ghost" size="sm" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleReassign} className="bg-slate-900 text-white">
              Reassign Case
            </Button>
          </div>
        </div>
      </Dialog>

      {/* 6. Temporary Work Delegation Modal */}
      {isDelegationOpen && (
        <DelegationModal
          isOpen={isDelegationOpen}
          onClose={() => setIsDelegationOpen(false)}
          application={app}
          onSuccess={() => {
            reloadData();
            setNotificationBanner({
              type: "success",
              message: "Work delegation created successfully and notification sent to colleague.",
            });
          }}
        />
      )}
    </div>);
}
export default function CaseReviewPage() {
    return (<RequireRole roles={[...AICTE_ROLES]}>
      <CaseReviewContent />
    </RequireRole>);
}
