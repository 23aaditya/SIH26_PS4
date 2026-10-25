import React from "react";
import { cn } from "@/lib/utils";
import { ApplicationStatus, DocumentVerificationStatus } from "@/lib/types";

interface StatusBadgeProps {
  status: ApplicationStatus | string;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({ status, className, showDot = true }: StatusBadgeProps) {
  let label = status.replace(/_/g, " ");
  let colorClasses = "bg-slate-100 text-slate-700 border-slate-200";
  let dotColor = "bg-slate-500";

  switch (status) {
    case "draft":
      label = "Draft";
      colorClasses = "bg-slate-50 text-slate-600 border-slate-200";
      dotColor = "bg-slate-400";
      break;
    case "submitted":
      label = "Submitted";
      colorClasses = "bg-sky-50 text-sky-700 border-sky-200";
      dotColor = "bg-sky-500";
      break;
    case "in_review":
      label = "Under Review";
      colorClasses = "bg-blue-50 text-blue-700 border-blue-200";
      dotColor = "bg-blue-600 animate-pulse";
      break;
    case "awaiting_institution":
      label = "Action Required (Deficiency)";
      colorClasses = "bg-amber-50 text-amber-800 border-amber-200 font-medium";
      dotColor = "bg-amber-500";
      break;
    case "pending_evc":
      label = "EVC Scheduled / Pending";
      colorClasses = "bg-purple-50 text-purple-700 border-purple-200";
      dotColor = "bg-purple-600";
      break;
    case "awaiting_committee":
      label = "Awaiting Committee";
      colorClasses = "bg-indigo-50 text-indigo-700 border-indigo-200";
      dotColor = "bg-indigo-600";
      break;
    case "decision_recorded":
      label = "Decision Recorded";
      colorClasses = "bg-teal-50 text-teal-700 border-teal-200";
      dotColor = "bg-teal-600";
      break;
    case "approved":
      label = "Approved (Order Issued)";
      colorClasses = "bg-emerald-50 text-emerald-800 border-emerald-200 font-medium";
      dotColor = "bg-emerald-600";
      break;
    case "rejected":
      label = "Rejected";
      colorClasses = "bg-rose-50 text-rose-700 border-rose-200";
      dotColor = "bg-rose-500";
      break;
    case "closed":
      label = "Closed";
      colorClasses = "bg-gray-100 text-gray-600 border-gray-200";
      dotColor = "bg-gray-400";
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border tracking-wide",
        colorClasses,
        className
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />}
      <span className="capitalize">{label}</span>
    </span>
  );
}

export function DocumentBadge({ status }: { status: DocumentVerificationStatus | string }) {
  switch (status) {
    case "verified":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          Verified
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Pending Scrutiny
        </span>
      );
    case "rejected":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          Deficiency / Rejected
        </span>
      );
    case "expired":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-300">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
          Expired Certificate
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
          {status}
        </span>
      );
  }
}

export function SlaCountdown({ dueAt }: { dueAt?: string }) {
  if (!dueAt) return <span className="text-xs text-slate-400">—</span>;

  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
        Overdue by {Math.abs(diffDays)}d
      </span>
    );
  }

  if (diffDays <= 3) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {diffDays === 0 ? "Due Today" : `${diffDays}d remaining`}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {diffDays}d remaining
    </span>
  );
}
