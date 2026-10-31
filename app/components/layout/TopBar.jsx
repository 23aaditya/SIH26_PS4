"use client";
import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, Search, LogOut, Menu, ChevronRight, Shield, Check } from "lucide-react";
import { ROLE_LABELS } from "@/lib/types";
import { dataService } from "@/lib/dataService";
import { AicteLogo } from "@/components/ui/AicteLogo";

export function TopBar({ onMenuToggle }) {
  const { userProfile, signOut, availableDemoUsers, switchDemoUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const notifications = dataService.getNotifications(userProfile?.uid);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Generate breadcrumb items
  const pathSegments = pathname.split("/").filter(Boolean);
  const breadcrumbs = pathSegments.map((segment, idx) => {
    const href = "/" + pathSegments.slice(0, idx + 1).join("/");
    const label = segment
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { label, href, isLast: idx === pathSegments.length - 1 };
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (userProfile?.role === "institution") {
      router.push(`/institution/applications?query=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push(`/aicte/applications?query=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[#E5EDF5] bg-white/95 backdrop-blur-md px-4 lg:px-6">
      {/* Left: Mobile hamburger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8 text-[#061B31]"
          onClick={onMenuToggle}
          aria-label="Toggle navigation"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="lg:hidden flex items-center">
          <AicteLogo variant="mark" size={28} />
        </div>

        {/* Breadcrumb Trail in Clean Typography */}
        <nav className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 overflow-hidden font-normal">
          <Link
            href={userProfile?.role === "institution" ? "/institution/dashboard" : "/aicte/dashboard"}
            className="hover:text-[#1E40AF] transition"
          >
            AICTE
          </Link>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.href}>
              <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
              {crumb.isLast ? (
                <span className="font-medium text-[#061B31] truncate">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="hover:text-[#1E40AF] transition truncate">
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Center / Search Input */}
      <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center flex-1 max-w-sm mx-4">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search applications, institutions, PIDs..."
            className="w-full h-8 pl-8 pr-12 rounded-[6px] border border-[#E5EDF5] bg-[#F8FAFD] text-xs text-[#061B31] placeholder:text-slate-400 focus:bg-white focus:border-[#1E40AF] focus:ring-1 focus:ring-[#1E40AF] transition outline-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-block px-1.5 py-0.2 text-[9px] font-mono text-slate-400 bg-white border border-[#E5EDF5] rounded-[4px]">
            ↵
          </kbd>
        </div>
      </form>

      {/* Right: Persona Switcher, Notifications, User */}
      <div className="flex items-center gap-2">
        {/* Quick Persona Switcher (CRITICAL for judges & evaluators) */}
        <div className="relative">
          <button
            onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#E5EDF5] bg-white px-2.5 py-1 text-xs font-normal text-[#061B31] hover:border-[#cbd5e1] hover:bg-[#F8FAFD] transition"
          >
            <Shield className="h-3.5 w-3.5 text-[#1E40AF]" />
            <span className="hidden sm:inline text-slate-500">Role:</span>
            <span className="font-medium text-[#061B31] max-w-[120px] truncate">
              {userProfile ? ROLE_LABELS[userProfile.role] : "Select Role"}
            </span>
            <span className="text-[10px] text-slate-400">▾</span>
          </button>

          {showRoleSwitcher && (
            <div className="absolute right-0 mt-2 w-72 rounded-[6px] border border-[#E5EDF5] bg-white p-2 shadow-sm z-50 animate-in fade-in zoom-in-95">
              <div className="px-2 py-1.5 border-b border-[#E5EDF5] bg-[#F8FAFD] rounded-[4px]">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1E40AF]">
                  Official Switcher (Dev Mode)
                </p>
                <p className="text-[11px] text-slate-500">
                  Select RBAC persona to inspect approval workflows
                </p>
              </div>
              <div className="mt-1 space-y-1 max-h-64 overflow-y-auto">
                {availableDemoUsers.map((user) => {
                  const isCurrent = user.uid === userProfile?.uid;
                  return (
                    <button
                      key={user.uid}
                      onClick={() => {
                        switchDemoUser(user.uid);
                        setShowRoleSwitcher(false);
                        if (user.accountType === "institution") {
                          router.push("/institution/dashboard");
                        } else {
                          router.push("/aicte/dashboard");
                        }
                      }}
                      className={cn(
                        "w-full flex items-start gap-2 rounded-[5px] p-2 text-left transition text-xs",
                        isCurrent
                          ? "bg-[#EFF6FF] text-[#1E40AF] font-semibold"
                          : "hover:bg-[#F8FAFD] text-[#061B31]"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">
                            {user.displayName}
                          </span>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-[#1E40AF] shrink-0" />}
                        </div>
                        <span className="text-[11px] text-slate-500 block">
                          {ROLE_LABELS[user.role]} ({user.accountType})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Notifications Popover */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 text-[#061B31] hover:bg-[#F8FAFD] rounded-[6px]"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2 items-center justify-center rounded-full bg-[#1E40AF] ring-2 ring-white" />
            )}
          </Button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-[6px] border border-[#E5EDF5] bg-white p-3 shadow-sm z-50 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5EDF5]">
                <span className="text-xs font-medium text-[#061B31]">Notifications</span>
                <span className="text-[10px] text-[#1E40AF] bg-[#EFF6FF] px-1.5 py-0.2 rounded-[4px] border border-blue-200">
                  {unreadCount} unread
                </span>
              </div>
              <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      dataService.markNotificationRead(n.id);
                      if (n.actionUrl) {
                        router.push(n.actionUrl);
                        setShowNotifications(false);
                      }
                    }}
                    className="p-2 rounded-[5px] border border-[#E5EDF5] hover:border-[#cbd5e1] hover:bg-[#F8FAFD] transition cursor-pointer text-xs"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-medium text-[#061B31] text-[11px] leading-tight">
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1E40AF] shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {n.message}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-[#E5EDF5] text-center">
                <Link
                  href={userProfile?.role === "institution" ? "/institution/notifications" : "/aicte/notifications"}
                  onClick={() => setShowNotifications(false)}
                  className="text-[11px] text-[#1E40AF] font-normal hover:text-[#1E3A8A] hover:opacity-80 transition"
                >
                  View all alerts →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#E5EDF5]">
          <Avatar
            fallback={userProfile?.displayName?.slice(0, 2).toUpperCase() || "U"}
            size="sm"
            className="h-7 w-7 text-xs bg-[#061B31] text-white font-medium rounded-[5px]"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-slate-400 hover:text-[#061B31] hover:bg-[#F8FAFD] rounded-[6px]"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
