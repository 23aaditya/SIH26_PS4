import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors", {
    variants: {
        variant: {
            default: "bg-blue-100 text-blue-700",
            secondary: "bg-gray-100 text-gray-700",
            success: "bg-emerald-100 text-emerald-700",
            warning: "bg-amber-100 text-amber-700",
            danger: "bg-red-100 text-red-700",
            outline: "border border-gray-300 text-gray-700 bg-transparent",
            purple: "bg-purple-100 text-purple-700",
            indigo: "bg-indigo-100 text-indigo-700",
            orange: "bg-orange-100 text-orange-700",
            cyan: "bg-cyan-100 text-cyan-700",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
function Badge({ className, variant, ...props }) {
    return <div className={cn(badgeVariants({ variant }), className)} {...props}/>;
}
export { Badge, badgeVariants };
