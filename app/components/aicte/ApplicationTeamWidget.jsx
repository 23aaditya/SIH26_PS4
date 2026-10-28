"use client";
import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/dataService";
import { useAuth } from "@/components/providers/AuthProvider";
import { Users, User, ArrowRight, MessageSquare, UserCheck, ShieldCheck, CornerDownRight, CheckCircle2 } from "lucide-react";

export function ApplicationTeamWidget({ applicationId, onOpenMessage, onOpenDelegate }) {
  const { userProfile } = useAuth();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!applicationId) return;
    async function fetchTeam() {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE}/applications/${applicationId}/work-tree`, {
          headers: {
            "x-user-id": userProfile?.employeeCode || userProfile?.uid || "DEMO-AIC-034",
          },
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setTeam(data);
        }
      } catch (err) {
        console.warn("Failed to load application team:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTeam();
  }, [applicationId, userProfile]);

  if (loading || !team) {
    return (
      <div className="p-4 bg-white rounded-xl border border-slate-200 animate-pulse space-y-2">
        <div className="h-4 bg-slate-100 rounded w-1/3"></div>
        <div className="h-12 bg-slate-50 rounded"></div>
      </div>
    );
  }

  const { previousStageOfficer, currentOwner, supervisor } = team;

  return (
    <Card className="border border-slate-200/90 shadow-2xs bg-white overflow-hidden rounded-xl">
      <div className="p-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-slate-200/80 text-slate-700">
            <Users className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Application Case Team
            </h3>
            <p className="text-[10px] text-slate-500">
              Responsible regulatory hierarchy & transition chain
            </p>
          </div>
        </div>
        {onOpenDelegate && (
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenDelegate}
            className="h-7 text-[11px] px-2.5 font-semibold text-slate-700"
          >
            <UserCheck className="h-3 w-3 mr-1 text-blue-600" />
            Delegate Task
          </Button>
        )}
      </div>

      <div className="p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Previous Stage */}
        <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Previous Stage
            </span>
            {previousStageOfficer && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                Completed
              </span>
            )}
          </div>

          {previousStageOfficer ? (
            <div>
              <p className="text-xs font-bold text-slate-900">{previousStageOfficer.name}</p>
              <p className="text-[11px] text-slate-500">{previousStageOfficer.designation}</p>
              <p className="text-[10px] text-slate-400 mt-1">Stage: {previousStageOfficer.stageHandled}</p>
              {onOpenMessage && (
                <button
                  type="button"
                  onClick={() => onOpenMessage(previousStageOfficer)}
                  className="mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <MessageSquare className="h-3 w-3" /> Clarification query
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Initial Stage (No prior officer)</p>
          )}
        </div>

        {/* Current Stage Owner */}
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/30 space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
              Current Active Owner
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold animate-pulse">
              Active Desk
            </span>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-900">{currentOwner?.name || "Official Evaluator"}</p>
            <p className="text-[11px] text-slate-500">{currentOwner?.designation || "AICTE Officer"}</p>
            <p className="text-[10px] text-blue-700 font-medium mt-1">
              Active Stage: {currentOwner?.stage || "Review"}
            </p>
            {onOpenMessage && currentOwner?.employeeCode !== userProfile?.employeeCode && (
              <button
                type="button"
                onClick={() => onOpenMessage(currentOwner)}
                className="mt-2 text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <MessageSquare className="h-3 w-3" /> Contact Case Owner
              </button>
            )}
          </div>
        </div>

        {/* Supervising Authority */}
        <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Supervising Authority
            </span>
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          </div>

          <div>
            <p className="text-xs font-bold text-slate-900">{supervisor?.name || "Bureau Authority"}</p>
            <p className="text-[11px] text-slate-500">{supervisor?.designation || "Regional Officer"}</p>
            <p className="text-[10px] text-slate-400 mt-1">Bureau: {supervisor?.bureau || "Approval Bureau"}</p>
            {onOpenMessage && (
              <button
                type="button"
                onClick={() => onOpenMessage(supervisor)}
                className="mt-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
              >
                <MessageSquare className="h-3 w-3" /> Consult Supervisor
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
