import React from "react";
import { AuditEvent, ApplicationStatus } from "@/lib/types";
import { CheckCircle2, Clock, AlertCircle, ArrowRight, UserCheck, Shield, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowStepperProps {
  currentStageId: string;
  status: ApplicationStatus;
  requiresEvc?: boolean;
}

export function WorkflowStepper({ currentStageId, status, requiresEvc = true }: WorkflowStepperProps) {
  const stages = [
    { id: "draft", label: "Draft & Submission" },
    { id: "scrutiny", label: "Scrutiny Review" },
    ...(requiresEvc ? [{ id: "evc_evaluation", label: "EVC Inspection" }] : []),
    { id: "standing_hearing_committee", label: "Committee Hearing" },
    { id: "approved_terminal", label: "Approval Decision" },
  ];

  const getStageIndex = (stageId: string) => {
    if (stageId === "approved_terminal" || stageId === "rejected_terminal") return stages.length - 1;
    if (stageId === "evc_scheduled" || stageId === "evc_evaluation") return 2;
    if (stageId === "clarification" || stageId === "scrutiny") return 1;
    if (stageId === "draft") return 0;
    return 1;
  };

  const activeIndex = getStageIndex(currentStageId);

  return (
    <div className="w-full py-4 border-b border-slate-200 bg-white px-6">
      <div className="flex items-center justify-between max-w-4xl mx-auto relative">
        {/* Connecting bar */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 -translate-y-1/2 z-0" />
        <div
          className="absolute top-1/2 left-0 h-0.5 bg-blue-600 -translate-y-1/2 z-0 transition-all duration-500"
          style={{ width: `${(activeIndex / (stages.length - 1)) * 100}%` }}
        />

        {stages.map((stage, idx) => {
          const isCompleted = idx < activeIndex || status === "approved";
          const isCurrent = idx === activeIndex && status !== "approved";
          const isRejected = status === "rejected" && idx === activeIndex;

          return (
            <div key={stage.id} className="relative z-10 flex flex-col items-center">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all border-2",
                  isCompleted
                    ? "bg-blue-600 text-white border-blue-600"
                    : isCurrent
                    ? "bg-white text-blue-600 border-blue-600 ring-4 ring-blue-50"
                    : isRejected
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-white text-slate-400 border-slate-300"
                )}
              >
                {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </div>
              <span
                className={cn(
                  "mt-2 text-[11px] font-medium tracking-tight text-center max-w-[90px]",
                  isCurrent ? "text-blue-900 font-semibold" : isCompleted ? "text-slate-800" : "text-slate-400"
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        No audit activity recorded yet.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {events.map((event, idx) => {
          const isLast = idx === events.length - 1;
          const isDeficiency = event.action.toLowerCase().includes("deficiency") || event.action.toLowerCase().includes("clarification");
          const isApproval = event.action.toLowerCase().includes("approval") || event.action.toLowerCase().includes("granted");

          return (
            <li key={event.id || idx}>
              <div className="relative pb-8">
                {!isLast && (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200"
                    aria-hidden="true"
                  />
                )}
                <div className="relative flex space-x-3 items-start">
                  <div>
                    <span
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white",
                        isDeficiency
                          ? "bg-amber-100 text-amber-700"
                          : isApproval
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-50 text-blue-700"
                      )}
                    >
                      {isDeficiency ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : isApproval ? (
                        <FileCheck className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="font-semibold text-slate-900">{event.action}</div>
                      <time className="text-slate-400 text-[11px]">
                        {new Date(event.timestamp).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">Role: {event.actorRole.replace(/_/g, " ")}</span>
                      {event.fromStage && event.toStage && (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          • {event.fromStage} <ArrowRight className="h-3 w-3 inline text-slate-400" /> {event.toStage}
                        </span>
                      )}
                    </div>
                    {event.reason && (
                      <p className="mt-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded border border-slate-200 leading-relaxed font-normal">
                        {event.reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
