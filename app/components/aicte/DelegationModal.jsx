"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/AuthProvider";
import { API_BASE } from "@/lib/dataService";
import { Users, AlertTriangle, Clock, CheckCircle2, ShieldCheck, UserCheck, Loader2 } from "lucide-react";

export function DelegationModal({ isOpen, onClose, application, onSuccess }) {
  const { userProfile } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [delegatedToId, setDelegatedToId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [reason, setReason] = useState("Workload Distribution");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");

  const appId = application?.id || application?.applicationId;
  const appNumber = application?.applicationNumber || application?.id;

  useEffect(() => {
    if (!isOpen || !appId) return;
    async function fetchEligible() {
      try {
        setLoadingCandidates(true);
        setError("");
        const res = await fetch(`${API_BASE}/delegations/eligible-users?applicationId=${appId}`, {
          headers: {
            "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
          },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setCandidates(data);
          if (data.length > 0 && !delegatedToId) {
            setDelegatedToId(data[0].id);
          }
        }
      } catch (err) {
        console.warn("Failed to load eligible delegates:", err);
      } finally {
        setLoadingCandidates(false);
      }
    }
    fetchEligible();
  }, [isOpen, appId, userProfile]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!delegatedToId) {
      setError("Please select an eligible colleague to delegate to.");
      return;
    }
    if (!taskTitle.trim()) {
      setError("Please enter a specific task title.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const res = await fetch(`${API_BASE}/delegations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
        },
        credentials: "include",
        body: JSON.stringify({
          applicationId: appId,
          workflowStageId: application?.currentStageId,
          delegatedToId,
          taskTitle: taskTitle.trim(),
          taskDescription: taskDescription.trim(),
          priority,
          reason,
          deadline: deadline || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create task delegation.");
      }

      const delegation = await res.json();
      if (onSuccess) onSuccess(delegation);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCandidate = candidates.find((c) => c.id === delegatedToId);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onClose}
      title="Temporary Work Delegation"
      description="Delegate a specific operational sub-task. Primary application ownership remains with you."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-md flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Context Banner */}
          <div className="p-3 bg-slate-100/70 rounded-lg border border-slate-200/80 text-xs flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-500 font-semibold">Application</span>
              <p className="font-mono font-bold text-slate-900">{appNumber || "Regulatory Application"}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase text-slate-500 font-semibold">Current Stage</span>
              <p className="font-semibold text-slate-800">{application?.currentStageName || "Active Review"}</p>
            </div>
          </div>

          {/* Task Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">
              Task Title <span className="text-rose-600">*</span>
            </Label>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Verify revised land ownership sale deed and revenue NOC"
              className="text-xs h-9"
              required
            />
          </div>

          {/* Task Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">
              Specific Instructions & Scope
            </Label>
            <Textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Describe specific document numbers, norms to cross-reference, or findings to evaluate..."
              className="text-xs min-h-[70px] resize-none"
            />
          </div>

          {/* Delegate Recipient Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-800">
                Delegate To (Eligible Officers) <span className="text-rose-600">*</span>
              </Label>
              {loadingCandidates && (
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Verifying eligibility...
                </span>
              )}
            </div>

            <select
              value={delegatedToId}
              onChange={(e) => setDelegatedToId(e.target.value)}
              className="w-full text-xs h-9 rounded-md border border-slate-200 bg-white px-2.5 text-slate-800 font-medium outline-none focus:border-blue-500"
              required
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.designation} ({c.organizationUnit}) • {c.currentWorkload.total} Active Tasks {c.isAvailable ? "" : "• [ON LEAVE]"}
                </option>
              ))}
            </select>

            {selectedCandidate && (
              <div className="mt-1 p-2 bg-slate-50 border border-slate-200/70 rounded text-[11px] text-slate-600 flex items-center justify-between">
                <span>
                  <strong>Workload:</strong> {selectedCandidate.currentWorkload.assignedApplications} Applications • {selectedCandidate.currentWorkload.delegatedTasks} Delegations
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  selectedCandidate.isAvailable ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}>
                  {selectedCandidate.availability}
                </span>
              </div>
            )}
          </div>

          {/* Priority & Reason Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-800">Priority Level</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full text-xs h-9 rounded-md border border-slate-200 bg-white px-2.5 text-slate-800 outline-none focus:border-blue-500 font-medium"
              >
                <option value="NORMAL">Normal</option>
                <option value="IMPORTANT">Important</option>
                <option value="URGENT">Urgent (Prioritised in Queue)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-800">Reason for Delegation</Label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full text-xs h-9 rounded-md border border-slate-200 bg-white px-2.5 text-slate-800 outline-none focus:border-blue-500 font-medium"
              >
                <option value="Planned Leave">Planned Leave</option>
                <option value="Workload Distribution">Workload Distribution</option>
                <option value="Domain Expertise">Domain Expertise</option>
                <option value="Supervisor Instruction">Supervisor Instruction</option>
                <option value="Temporary Unavailability">Temporary Unavailability</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Deadline */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">Task Completion Deadline</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="text-xs h-9"
            />
          </div>

          {/* Statutory Notice */}
          <div className="p-2.5 rounded bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              <strong>Statutory Note:</strong> Delegating a verification task does not transfer statutory approval or rejection authority. When completed, findings will return to you for final stage endorsement.
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting} className="text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold">
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Delegating...
                </>
              ) : (
                "Issue Delegation Request"
              )}
            </Button>
          </div>
        </form>
    </Dialog>
  );
}
