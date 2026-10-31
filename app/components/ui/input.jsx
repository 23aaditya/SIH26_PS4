import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[6px] border border-[#E5EDF5] bg-white px-3 py-1.5 text-xs sm:text-sm text-[#061B31] placeholder:text-slate-400 transition-all duration-150",
        "hover:border-[#cbd5e1]",
        "focus:outline-none focus:border-[#1E40AF] focus:ring-1 focus:ring-[#1E40AF]",
        "disabled:cursor-not-allowed disabled:bg-[#F8FAFD] disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-xs file:font-normal",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
