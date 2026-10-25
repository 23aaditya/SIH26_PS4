import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-10 w-10",
};
export function Spinner({ className, size = "md", label }) {
    return (<div className={cn("flex items-center justify-center gap-2", className)}>
      <Loader2 className={cn("animate-spin text-blue-600", sizeClasses[size])}/>
      {label && <span className="text-sm text-gray-500">{label}</span>}
    </div>);
}
/** Full-page loading state */
export function PageLoader({ label = "Loading..." }) {
    return (<div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="lg" label={label}/>
    </div>);
}
