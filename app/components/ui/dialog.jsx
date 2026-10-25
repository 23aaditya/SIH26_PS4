"use client";
import React, { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export function Dialog({ open, onOpenChange, title, description, children, maxWidth = "lg", }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape" && open) {
                onOpenChange(false);
            }
        };
        if (open) {
            document.body.style.overflow = "hidden";
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.body.style.overflow = "unset";
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, onOpenChange]);
    if (!open)
        return null;
    const maxWidthClasses = {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-xl",
        xl: "max-w-3xl",
    }[maxWidth];
    return (<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in" onClick={() => onOpenChange(false)}/>

      {/* Dialog card */}
      <div className={cn("relative w-full rounded-xl bg-white shadow-xl border border-slate-200 p-6 z-10 transition-all max-h-[90vh] overflow-y-auto", maxWidthClasses)}>
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900 leading-none">{title}</h3>
            {description && (<p className="mt-1.5 text-xs text-slate-500 leading-normal">{description}</p>)}
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X className="h-4 w-4"/>
          </button>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>);
}
