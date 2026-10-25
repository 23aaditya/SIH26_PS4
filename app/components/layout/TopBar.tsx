"use client";

import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Search,
  LogOut,
  Menu,
  ChevronRight,
  Shield,
  UserCheck,
  Check,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { ROLE_LABELS } from "@/lib/types";
import { dataService } from "@/lib/dataService";

interface TopBarProps {
  onMenuToggle: () => void;
}

export function TopBar({ onMenuToggle }: TopBarProps) {
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    if (userProfile?.role === "institution") {
      router.push(`/institution/applications?query=${encodeURIComponent(searchQuery)}`);
    } else {
      router.push(`/aicte/applications?query=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur-md px-4 lg:px-6">
      {/* Left: Mobile hamburger & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8 text-slate-600"
          onClick={onMenuToggle}
          aria-label="Toggle navigation"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Breadcrumb Trail */}
        <nav className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 overflow-hidden">
          <Link
            href={userProfile?.role === "institution" ? "/institution/dashboard" : "/aicte/dashboard"}
            className="hover:text-slate-900 font-medium transition"
          >
            AICTE
          </Link>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.href}>
              <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />
              {crumb.isLast ? (
                <span className="font-semibold text-slate-800 truncate">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="hover:text-slate-900 transition truncate">
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {/* Center / Search Input (Stripe style) */}
      <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center flex-1 max-w-sm mx-4">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search applications, institutions, PIDs..."
            className="w-full h-8 pl-8 pr-12 rounded-md border border-slate-200 bg-slate-50/60 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition outline-none"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-block px-1.5 py-0.5 text-[9px] font-mono text-slate-400 bg-white border border-slate-200 rounded">
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
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
          >
            <Shield className="h-3.5 w-3.5 text-blue-600" />
            <span className="hidden sm:inline">Role:</span>
            <span className="font-semibold text-slate-900 max-w-[120px] truncate">
              {userProfile ? ROLE_LABELS[userProfile.role] : "Select Role"}
            </span>
            <span className="text-[10px] text-slate-400">▾</span>
          </button>

          {showRoleSwitcher && (
            <div className="absolute right-0 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg z-50 animate-in fade-in zoom-in-95">
              <div className="px-2 py-1.5 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  Quick Switch Persona
                </p>
                <p className="text-[11px] text-slate-500">
                  Test workflow states across different user roles
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
                      className="w-full flex items-start gap-2 rounded-md p-2 text-left hover:bg-slate-50 transition text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 truncate">
                            {user.displayName}
                          </span>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
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
            className="relative h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2 items-center justify-center rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </Button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-lg z-50 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-900">Notifications</span>
                <span className="text-[10px] text-slate-500">{unreadCount} unread</span>
              </div>
              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
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
                    className="p-2 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition cursor-pointer text-xs"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-slate-800 text-[11px] leading-tight">
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                      {n.message}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                <Link
                  href={userProfile?.role === "institution" ? "/institution/notifications" : "/aicte/notifications"}
                  onClick={() => setShowNotifications(false)}
                  className="text-[11px] text-blue-600 font-medium hover:underline"
                >
                  View all alerts
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Avatar & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <Avatar
            fallback={userProfile?.displayName?.slice(0, 2).toUpperCase() || "U"}
            size="sm"
            className="h-7 w-7 text-xs bg-slate-900 text-white font-medium"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-slate-500 hover:text-slate-900"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
