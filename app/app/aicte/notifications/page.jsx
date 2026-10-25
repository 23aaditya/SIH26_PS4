"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dataService } from "@/lib/dataService";
import { AlertTriangle, ArrowRight, Check, Flame } from "lucide-react";
const AICTE_ROLES = [
    "regional_officer",
    "bureau_officer",
    "scrutiny_committee",
    "evc_coordinator",
    "competent_authority",
    "admin",
];
function NotificationsEscalationsContent() {
    const { userProfile } = useAuth();
    const [notifications, setNotifications] = useState(() => dataService.getNotifications());
    const handleMarkAll = () => {
        notifications.forEach((n) => dataService.markNotificationRead(n.id));
        setNotifications(dataService.getNotifications());
    };
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Regulatory Alerts & SLA Escalation Center
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Citizens Charter timeline monitoring, automated escalation matrix, and regulatory warnings
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAll} className="text-xs">
          <Check className="h-3.5 w-3.5 mr-1"/> Mark All as Read
        </Button>
      </div>

      {/* Escalation Matrix Explainer Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-bold">
            <span className="h-2 w-2 rounded-full bg-amber-500"/>
            Level 1 Escalation (&gt; 7 Days)
          </div>
          <p className="mt-1 text-[11px] text-amber-800">
            Regional Officer alerted with expedited priority review notice.
          </p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-3.5 text-xs text-orange-900">
          <div className="flex items-center gap-2 font-bold">
            <span className="h-2 w-2 rounded-full bg-orange-500"/>
            Level 2 Escalation (&gt; 14 Days)
          </div>
          <p className="mt-1 text-[11px] text-orange-800">
            Bureau Officer intervention; dossier automatically highlighted in national pending list.
          </p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3.5 text-xs text-rose-900">
          <div className="flex items-center gap-2 font-bold">
            <Flame className="h-3.5 w-3.5 text-rose-600"/>
            Level 3 Escalation (&gt; 21 Days)
          </div>
          <p className="mt-1 text-[11px] text-rose-800">
            Competent Authority & Chairman executive query issued to regional director.
          </p>
        </div>
      </div>

      {/* Notifications List */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <div className="divide-y divide-slate-100">
          {notifications.map((item) => {
            const isUrgent = item.priority === "urgent";
            const isHigh = item.priority === "high";
            return (<div key={item.id} className={`p-4 flex items-start gap-4 transition ${item.read ? "bg-white" : isUrgent ? "bg-rose-50/40" : "bg-blue-50/30"}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${isUrgent
                    ? "bg-rose-100 text-rose-700"
                    : isHigh
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"}`}>
                  <AlertTriangle className="h-4 w-4"/>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-900 leading-tight">
                        {item.title}
                      </h3>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${isUrgent
                    ? "bg-rose-600 text-white"
                    : isHigh
                        ? "bg-amber-600 text-white"
                        : "bg-slate-200 text-slate-700"}`}>
                        {item.priority}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(item.createdAt).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {item.message}
                  </p>

                  {item.actionUrl && (<div className="mt-2.5">
                      <Link href={item.actionUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                        Open Target Dossier <ArrowRight className="h-3 w-3"/>
                      </Link>
                    </div>)}
                </div>
              </div>);
        })}
        </div>
      </Card>
    </div>);
}
export default function NotificationsEscalationsPage() {
    return (<RequireRole roles={[...AICTE_ROLES]}>
      <NotificationsEscalationsContent />
    </RequireRole>);
}
