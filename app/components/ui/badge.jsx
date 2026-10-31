import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[4px] px-2 py-0.5 text-[11px] font-medium tracking-normal transition-colors border select-none",
  {
    variants: {
      variant: {
        default: "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]",
        secondary: "bg-slate-100 text-slate-800 border-slate-200",
        success: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
        warning: "bg-amber-50 text-amber-800 border-amber-200",
        danger: "bg-red-50 text-red-800 border-red-200",
        urgent: "bg-red-50 text-red-800 border-red-200 font-semibold",
        outline: "border-slate-200 text-slate-800 bg-white",
        blue: "bg-[#EFF6FF] text-[#1E40AF] border-[#BFDBFE]",
        indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
        orange: "bg-amber-50 text-amber-900 border-amber-200",
        cyan: "bg-sky-50 text-sky-800 border-sky-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
