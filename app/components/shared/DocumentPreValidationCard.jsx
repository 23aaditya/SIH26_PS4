"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  HelpCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  FileText,
  Clock,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { API_BASE } from "@/lib/dataService";

const DEMO_USER_KEY = "aicte_active_demo_user_id";

function getActiveUid() {
  if (typeof window !== "undefined") {
    return localStorage.getItem(DEMO_USER_KEY) || "inst-user-1";
  }
  return "inst-user-1";
}

/**
 * AICTE Document Pre-Validation Status & Advisory Card
 * 
 * Provides non-blocking, asynchronous qualitative AI pre-check feedback
 * directly below statutory document upload fields.
 * 
 * Strictly advisory: Does NOT accept, reject, or issue deficiency notices.
 */
export function DocumentPreValidationCard({
  applicationId,
  documentId,
  documentName,
  requirementName,
  onReplace,
  initialData = null,
  className = "",
}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const pollCountRef = useRef(0);

  const fetchStatus = useCallback(async (isManualRefresh = false) => {
    if (!applicationId || !documentId) return;
    if (inFlightRef.current && !isManualRefresh) return;

    inFlightRef.current = true;
    if (isManualRefresh) setRefreshing(true);

    try {
      const uid = getActiveUid();
      const res = await fetch(
        `${API_BASE}/applications/${applicationId}/documents/${documentId}/prevalidation`,
        {
          headers: {
            "Content-Type": "application/json",
            "x-user-id": uid,
          },
          credentials: "include",
        }
      );

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Unauthorized tenant access.");
        }
        if (res.status === 404) {
          throw new Error("Document pre-validation record not found.");
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const json = await res.json();
      if (isMountedRef.current) {
        setData(json);
        setFetchError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.warn("[DocumentPreValidationCard] Fetch error:", err.message);
        setFetchError(err.message);
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
        if (isManualRefresh) setRefreshing(false);
      }
    }
  }, [applicationId, documentId]);

  // Initial fetch and automatic polling for active jobs
  useEffect(() => {
    isMountedRef.current = true;
    pollCountRef.current = 0;

    fetchStatus();

    const intervalId = setInterval(() => {
      // Poll only if job is in-flight (QUEUED, PROCESSING, RETRY_SCHEDULED, or not loaded yet)
      const currentStatus = data?.status;
      const isTerminal = ["COMPLETED", "FAILED"].includes(currentStatus);

      if (!isTerminal && pollCountRef.current < 40) {
        pollCountRef.current += 1;
        fetchStatus();
      }
    }, 2800);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [fetchStatus, data?.status]);

  if (!applicationId || !documentId) return null;

  const status = data?.status || (loading ? "LOADING" : "QUEUED");
  const classification = data?.classification;
  const result = classification?.result;

  // Status visual mapping
  let config = {
    badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
    badgeLabel: "Awaiting AI Pre-Check",
    badgeIcon: <Clock className="h-3.5 w-3.5 text-slate-500" />,
    summary: "Document queued for automated APH content pre-validation.",
    accentBorder: "border-slate-200",
  };

  if (loading || status === "LOADING") {
    config = {
      badgeBg: "bg-slate-50 text-slate-600 border-slate-200",
      badgeLabel: "Checking status...",
      badgeIcon: <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />,
      summary: "Retrieving pre-validation status...",
      accentBorder: "border-slate-200",
    };
  } else if (status === "QUEUED") {
    config = {
      badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
      badgeLabel: "AI Pre-Check Queued",
      badgeIcon: <Clock className="h-3.5 w-3.5 text-blue-600" />,
      summary: "Scheduled for Groq qualitative assessment under shared rate-limiting controls.",
      accentBorder: "border-blue-200",
    };
  } else if (status === "PROCESSING") {
    config = {
      badgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse",
      badgeLabel: "AI Analysis In Progress...",
      badgeIcon: <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />,
      summary: "Groq LLM is actively analyzing document text against AICTE APH requirements.",
      accentBorder: "border-indigo-200",
    };
  } else if (status === "RETRY_SCHEDULED") {
    config = {
      badgeBg: "bg-amber-50 text-amber-800 border-amber-300",
      badgeLabel: "AI Queue Retry Scheduled",
      badgeIcon: <Clock className="h-3.5 w-3.5 text-amber-600" />,
      summary: "Provider capacity limit reached; automated retry scheduled without loss of progress.",
      accentBorder: "border-amber-200",
    };
  } else if (status === "COMPLETED") {
    if (result === "LIKELY_MATCH") {
      config = {
        badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-300",
        badgeLabel: "Content Appears Relevant ✓",
        badgeIcon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
        summary: "Document content corresponds to the statutory requirement and appears relevant.",
        accentBorder: "border-emerald-300",
      };
    } else if (result === "POSSIBLE_MISMATCH") {
      config = {
        badgeBg: "bg-amber-50 text-amber-900 border-amber-300 font-bold",
        badgeLabel: "Possible Document Mismatch ⚠",
        badgeIcon: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
        summary: "Uploaded document appears unrelated or potentially incorrect for this field. Verification or replacement advised.",
        accentBorder: "border-amber-400 bg-amber-50/30",
      };
    } else if (result === "MANUAL_REVIEW_REQUIRED") {
      config = {
        badgeBg: "bg-blue-50 text-blue-800 border-blue-200",
        badgeLabel: "Manual Human Review Required",
        badgeIcon: <Info className="h-3.5 w-3.5 text-blue-600" />,
        summary: "Document contains limited text (e.g. single-page order or scanned image). Will be verified by the Scrutiny Officer.",
        accentBorder: "border-blue-200",
      };
    } else if (result === "INSUFFICIENT_EVIDENCE") {
      config = {
        badgeBg: "bg-orange-50 text-orange-800 border-orange-200",
        badgeLabel: "Insufficient Document Information",
        badgeIcon: <HelpCircle className="h-3.5 w-3.5 text-orange-600" />,
        summary: "Extracted document text was insufficient to establish conclusive relevance.",
        accentBorder: "border-orange-200",
      };
    }
  } else if (status === "FAILED") {
    config = {
      badgeBg: "bg-rose-50 text-rose-800 border-rose-200",
      badgeLabel: "Pre-Check Temporarily Unavailable",
      badgeIcon: <XCircle className="h-3.5 w-3.5 text-rose-600" />,
      summary: data?.errorMessage || "Automated pre-validation service could not complete the assessment.",
      accentBorder: "border-rose-200",
    };
  }

  return (
    <div
      className={`mt-2.5 rounded-xl border ${config.accentBorder} bg-white p-3 text-xs transition-all shadow-2xs ${className}`}
    >
      {/* Primary Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${config.badgeBg}`}
          >
            {config.badgeIcon}
            <span>{config.badgeLabel}</span>
          </span>

          <span className="text-[11px] text-slate-500 truncate max-w-[280px]">
            {config.summary}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          {result === "POSSIBLE_MISMATCH" && onReplace && (
            <button
              type="button"
              onClick={onReplace}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md transition border border-amber-300"
            >
              <RotateCcw className="h-3 w-3" /> Replace Document
            </button>
          )}

          <button
            type="button"
            onClick={() => fetchStatus(true)}
            disabled={refreshing}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
            title="Refresh AI Pre-Validation Status"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
          </button>

          {classification && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 px-2 py-1 rounded-md border border-slate-200 transition"
            >
              <span>{expanded ? "Hide Details" : "Show AI Advisory"}</span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Expandable Assessment Details Panel */}
      {expanded && classification && (
        <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
          {/* Advisory Message */}
          {classification.advisoryMessage && (
            <div
              className={`p-3 rounded-lg border text-xs leading-relaxed ${
                result === "POSSIBLE_MISMATCH"
                  ? "bg-amber-50/80 border-amber-200 text-amber-950 font-medium"
                  : result === "LIKELY_MATCH"
                  ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1 text-[11px] uppercase tracking-wider text-slate-600">
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                <span>AI Qualitative Observation</span>
              </div>
              <p>{classification.advisoryMessage}</p>
            </div>
          )}

          {/* Verbatim Evidence Excerpt */}
          {classification.evidenceExcerpt && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Verified Document Excerpt:
              </span>
              <blockquote className="p-2.5 bg-slate-50 rounded-lg border-l-4 border-blue-500 font-mono text-[11px] text-slate-700 italic break-words">
                "{classification.evidenceExcerpt}"
              </blockquote>
            </div>
          )}

          {/* Facts vs Inference */}
          {classification.factsVsInference && (
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Evidence Breakdown:
              </span>
              <p className="leading-relaxed">{classification.factsVsInference}</p>
            </div>
          )}

          {/* Recommended Action & Meta Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-600">Recommended Next Step:</span>
              {classification.recommendedAction === "CHECK_AND_REPLACE" ? (
                <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  Verify or Replace Document
                </span>
              ) : classification.recommendedAction === "CONTINUE_UPLOADS" ? (
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Proceed with Remaining Checklist
                </span>
              ) : (
                <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  Awaiting Scrutiny Officer Verification
                </span>
              )}
            </div>

            {data?.completedAt && (
              <span className="text-[10px]">
                Evaluated: {new Date(data.completedAt).toLocaleTimeString()} ({data.modelUsed || "Groq LLM"})
              </span>
            )}
          </div>

          {/* Persistent Human-in-the-Loop Statutory Disclaimer */}
          <div className="rounded-lg bg-slate-100/80 p-2.5 text-[10.5px] text-slate-500 leading-normal flex items-start gap-2 border border-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
            <p>
              <strong>Advisory Pre-Check:</strong> This AI assessment evaluates content relevance only and does not establish document authenticity, legal validity, or official statutory compliance. Final scrutiny remains exclusively with the designated AICTE Scrutiny Officer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

