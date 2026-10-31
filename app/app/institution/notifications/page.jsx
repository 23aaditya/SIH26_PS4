"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dataService } from "@/lib/dataService";
import { Check, ArrowRight, AlertTriangle, Clock, Info } from "lucide-react";
function NotificationsContent() {
    const { userProfile } = useAuth();
    const [notifications, setNotifications] = useState(() => dataService.getNotifications(userProfile?.uid));
    const handleMarkRead = (id) => {
        dataService.markNotificationRead(id);
        setNotifications(dataService.getNotifications(userProfile?.uid));
    };
    const handleMarkAllRead = () => {
        notifications.forEach((n) => dataService.markNotificationRead(n.id));
        setNotifications(dataService.getNotifications(userProfile?.uid));
    };
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Notifications & Alerts
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Real-time regulatory communications, deficiency alerts, and deadline reminders
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="text-xs">
          <Check className="h-3.5 w-3.5 mr-1"/> Mark All as Read
        </Button>
      </div>

      {/* Notifications List */}
      <Card className="border border-slate-200/90 shadow-2xs bg-white">
        <div className="divide-y divide-slate-100">
          {notifications.map((item) => {
            const isDeficiency = item.type.includes("deficiency");
            const isCompliance = item.type.includes("compliance");
            return (<div key={item.id} className={`p-4 flex items-start gap-4 transition ${item.read ? "bg-white" : "bg-blue-50/30"}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${isDeficiency
                    ? "bg-amber-100 text-amber-700"
                    : isCompliance
                        ? "bg-blue-100 text-[#1E40AF]"
                        : "bg-slate-100 text-slate-700"}`}>
                  {isDeficiency ? (<AlertTriangle className="h-4 w-4"/>) : isCompliance ? (<Clock className="h-4 w-4"/>) : (<Info className="h-4 w-4"/>)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-900 leading-tight">
                      {item.title}
                    </h3>
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

                  <div className="mt-2.5 flex items-center gap-3">
                    {item.actionUrl && (<Link href={item.actionUrl} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline">
                        Take Action <ArrowRight className="h-3 w-3"/>
                      </Link>)}
                    {!item.read && (<button onClick={() => handleMarkRead(item.id)} className="text-[11px] text-slate-400 hover:text-slate-700 transition">
                        Mark as read
                      </button>)}
                  </div>
                </div>
              </div>);
        })}
        </div>
      </Card>
    </div>);
}
export default function InstitutionNotificationsPage() {
    return (<RequireRole roles={["institution"]}>
      <NotificationsContent />
    </RequireRole>);
}
