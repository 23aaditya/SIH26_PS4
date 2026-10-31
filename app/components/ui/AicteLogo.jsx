"use client";
import React from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * AicteLogo Component
 * Renders the official AICTE Approval Workflow Automation System emblem & branding
 * 
 * @param {"full" | "mark" | "horizontal" | "sidebar"} variant
 * @param {number} size - base size in pixels
 * @param {string} className - extra container classes
 * @param {boolean} withLink - whether to wrap in home link
 */
export function AicteLogo({
  variant = "horizontal",
  size = 40,
  className = "",
  withLink = false,
  href = "/",
}) {
  const content = (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {variant === "mark" && (
        <div
          className="relative shrink-0 flex items-center justify-center transition-transform hover:scale-105"
          style={{ width: Math.max(size, 52), height: Math.max(size, 52) }}
        >
          <img
            src="/aicte-logo.png"
            alt="AICTE Logo Mark"
            className="w-full h-full object-contain filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            loading="eager"
          />
        </div>
      )}

      {variant === "sidebar" && (
        <div className="flex items-center gap-3 overflow-hidden">
          <div
            className="relative shrink-0 flex items-center justify-center"
            style={{ width: 48, height: 48 }}
          >
            <img
              src="/aicte-logo.png"
              alt="AICTE Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              loading="eager"
            />
          </div>
          <div className="leading-tight truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-[#0F172A] tracking-tight">AICTE</span>
              <span className="text-xs text-slate-400 font-light">|</span>
              <span className="text-xs font-bold text-[#1E40AF] tracking-tight truncate">AWAS</span>
            </div>
            <span className="block text-[10px] text-slate-500 font-medium truncate">
              Workflow Automation
            </span>
          </div>
        </div>
      )}

      {variant === "horizontal" && (
        <div className="flex items-center gap-3.5">
          <div
            className="relative shrink-0 flex items-center justify-center"
            style={{ width: Math.max(size, 54), height: Math.max(size, 54) }}
          >
            <img
              src="/aicte-logo.png"
              alt="AICTE Emblem"
              className="w-full h-full object-contain filter drop-shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              loading="eager"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-extrabold text-[#0F172A] tracking-tight">
                AICTE
              </span>
              <span className="text-slate-300 font-light">|</span>
              <span className="text-sm sm:text-base font-bold text-[#0F172A] tracking-tight">
                Approval Workflow
              </span>
              <span className="hidden sm:inline-block text-[10px] font-semibold text-[#1E40AF] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                APH 2026-27
              </span>
            </div>
            <span className="text-[11px] sm:text-xs text-slate-500 font-normal tracking-wide">
              Automate • Monitor • Ensure Compliance
            </span>
          </div>
        </div>
      )}

      {variant === "full" && (
        <div className="flex flex-col items-center text-center">
          <div
            className="relative flex items-center justify-center p-2"
            style={{ width: Math.max(size, 200), height: "auto", minHeight: 100 }}
          >
            <img
              src="/aicte-logo.png"
              alt="AICTE Approval Workflow Automation System"
              className="w-full h-auto max-h-[180px] object-contain filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.08)]"
              loading="eager"
            />
          </div>
        </div>
      )}
    </div>
  );

  if (withLink) {
    return (
      <Link href={href} className="inline-flex hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

export default AicteLogo;
