import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[#1E40AF] text-white border border-[#1E40AF] hover:bg-[#1E3A8A] hover:border-[#1E3A8A] active:bg-[#172554] shadow-xs",
        secondary:
          "bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] hover:bg-[#DBEAFE] active:bg-[#BFDBFE]",
        tertiary:
          "bg-[#F1F5F9] text-[#0F172A] border border-[#E2E8F0] hover:bg-[#E2E8F0] active:bg-[#CBD5E1]",
        outline:
          "border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC] hover:border-[#94A3B8] active:bg-slate-100",
        ghost:
          "text-[#0F172A] hover:bg-[#EFF6FF] hover:text-[#1E40AF]",
        destructive:
          "bg-[#DC2626] text-white border border-[#DC2626] hover:bg-[#B91C1C] active:bg-[#991B1B]",
        link:
          "text-[#1E40AF] hover:text-[#1E3A8A] p-0 h-auto underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm",
        sm: "h-8 rounded-[5px] px-3 text-xs",
        lg: "h-11 rounded-[6px] px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
