import * as React from "react";
import { cn } from "@/lib/utils";
const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
};
export function Avatar({ src, alt, fallback, size = "md", className, ...props }) {
    const [imgError, setImgError] = React.useState(false);
    const initials = fallback
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    return (<div className={cn("relative inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 font-medium overflow-hidden", sizeClasses[size], className)} {...props}>
      {src && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt || fallback} className="h-full w-full object-cover" onError={() => setImgError(true)}/>) : (<span>{initials}</span>)}
    </div>);
}
