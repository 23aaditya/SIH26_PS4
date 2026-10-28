"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/AuthProvider";
import { API_BASE } from "@/lib/dataService";
import { Calendar, AlertTriangle, CheckCircle2, ShieldCheck, Loader2 } from "lucide-react";

export function AvailabilityModal({ isOpen, onClose, currentAvailability, onSuccess }) {
  const { userProfile } = useAuth();
  const [status, setStatus] = useState("AVAILABLE");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentAvailability) {
      setStatus(currentAvailability.status || "AVAILABLE");
      setAvailableFrom(currentAvailability.availableFrom ? currentAvailability.availableFrom.split("T")[0] : "");
      setAvailableUntil(currentAvailability.availableUntil ? currentAvailability.availableUntil.split("T")[0] : "");
      setReason(currentAvailability.reason || "");
      setNote(currentAvailability.note || "");
    }
  }, [currentAvailability, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError("");

      const res = await fetch(`${API_BASE}/aicte/availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
        },
        credentials: "include",
        body: JSON.stringify({
          status,
          availableFrom: availableFrom || undefined,
          availableUntil: availableUntil || undefined,
          reason: reason.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update availability status.");
      }

      const data = await res.json();
      if (data.continuityWarning) {
        setWarning(data.continuityWarning);
      } else {
        if (onSuccess) onSuccess(data.availability);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onClose}
      title="Staff Availability & Work Continuity"
      description="Declare operational status to maintain regulatory deadlines and facilitate delegation."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-md">
              {error}
            </div>
          )}

          {warning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Work Continuity Advisory
              </div>
              <p className="text-amber-800 text-[11px] leading-relaxed">
                {warning.message}
              </p>
            </div>
          )}

          {/* Operational Status */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-800">Operational Status</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "AVAILABLE", label: "Available", desc: "Active on duty" },
                { id: "ON_LEAVE", label: "On Leave", desc: "Planned absence" },
                { id: "TEMPORARILY_UNAVAILABLE", label: "Unavailable", desc: "Special duty" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setStatus(opt.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    status === opt.id
                      ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold text-xs">{opt.label}</p>
                  <p className={`text-[10px] ${status === opt.id ? "text-slate-300" : "text-slate-400"}`}>
                    {opt.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Date range if not Available */}
          {status !== "AVAILABLE" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">From Date</Label>
                <Input
                  type="date"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="text-xs h-9"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Until Date</Label>
                <Input
                  type="date"
                  value={availableUntil}
                  onChange={(e) => setAvailableUntil(e.target.value)}
                  className="text-xs h-9"
                  required
                />
              </div>
            </div>
          )}

          {/* Reason */}
          {status !== "AVAILABLE" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Reason / Absence Memo</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Annual sanctioned leave, official conference duty"
                className="text-xs h-9"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting} className="text-xs">
              Close
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold">
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Updating...
                </>
              ) : (
                "Update Availability"
              )}
            </Button>
          </div>
        </form>
    </Dialog>
  );
}
