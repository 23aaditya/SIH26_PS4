"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  ClipboardCheck,
  FolderLock,
  Bell,
  Building2,
  Users,
  CalendarDays,
  BarChart4,
  Sliders,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
  badge?: string;
  category?: string;
}

const navItems: NavItem[] = [
  // ─── Institution Portal Items ───
  {
    category: "Main Workflow",
    label: "Dashboard",
    href: "/institution/dashboard",
    icon: LayoutDashboard,
    roles: ["institution"],
  },
  {
    category: "Main Workflow",
    label: "My Applications",
    href: "/institution/applications",
    icon: FileText,
    roles: ["institution"],
  },
  {
    category: "Main Workflow",
    label: "New Application",
    href: "/institution/applications/new",
    icon: PlusCircle,
    roles: ["institution"],
  },
  {
    category: "Compliance & Vault",
    label: "Compliance & Undertakings",
    href: "/institution/compliance",
    icon: ClipboardCheck,
    roles: ["institution"],
  },
  {
    category: "Compliance & Vault",
    label: "Document Repository",
    href: "/institution/documents",
    icon: FolderLock,
    roles: ["institution"],
  },
  {
    category: "Account & Alerts",
    label: "Notifications",
    href: "/institution/notifications",
    icon: Bell,
    roles: ["institution"],
  },
  {
    category: "Account & Alerts",
    label: "Institution Profile",
    href: "/institution/profile",
    icon: Building2,
    roles: ["institution"],
  },

  // ─── AICTE Official Portal Items ───
  {
    category: "Core Processing",
    label: "Official Dashboard",
    href: "/aicte/dashboard",
    icon: LayoutDashboard,
    roles: ["regional_officer", "bureau_officer", "scrutiny_committee", "evc_coordinator", "competent_authority", "admin"],
  },
  {
    category: "Core Processing",
    label: "Application Queue",
    href: "/aicte/applications",
    icon: FileText,
    badge: "Active",
    roles: ["regional_officer", "bureau_officer", "scrutiny_committee", "evc_coordinator", "competent_authority", "admin"],
  },
  {
    category: "Core Processing",
    label: "EVC Scheduling",
    href: "/aicte/evc",
    icon: CalendarDays,
    roles: ["evc_coordinator", "regional_officer", "bureau_officer", "admin"],
  },
  {
    category: "Monitoring & Audits",
    label: "Compliance Monitoring",
    href: "/aicte/compliance",
    icon: ClipboardCheck,
    roles: ["regional_officer", "bureau_officer", "admin"],
  },
  {
    category: "Monitoring & Audits",
    label: "Document Validity",
    href: "/aicte/documents",
    icon: FolderLock,
    roles: ["regional_officer", "bureau_officer", "scrutiny_committee", "evc_coordinator", "competent_authority", "admin"],
  },
  {
    category: "Monitoring & Audits",
    label: "Alerts & Escalations",
    href: "/aicte/notifications",
    icon: Bell,
    roles: ["regional_officer", "bureau_officer", "scrutiny_committee", "evc_coordinator", "competent_authority", "admin"],
  },
  {
    category: "Administration & Rules",
    label: "Analytics & Reports",
    href: "/aicte/reports",
    icon: BarChart4,
    roles: ["regional_officer", "bureau_officer", "admin", "competent_authority"],
  },
  {
    category: "Administration & Rules",
    label: "Workflow Configuration",
    href: "/aicte/rules",
    icon: Sliders,
    roles: ["admin"],
  },
  {
    category: "Administration & Rules",
    label: "User & Role Directory",
    href: "/aicte/users",
    icon: Users,
    roles: ["admin", "bureau_officer"],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const { userProfile, isAicte } = useAuth();
  const pathname = usePathname();

  const role = userProfile?.role || "institution";
  const filtered = navItems.filter((item) => item.roles.includes(role));

  // Group by category
  const categories = Array.from(new Set(filtered.map((item) => item.category || "General")));

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-slate-50/70 backdrop-blur-md transition-all duration-200 lg:static lg:z-auto",
          collapsed ? "w-16" : "w-64",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header / Brand */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5 text-blue-400" />
            </div>
            {!collapsed && (
              <div className="leading-tight truncate">
                <span className="text-xs font-bold text-slate-900 tracking-tight">AICTE PORTAL</span>
                <span className="block text-[10px] text-slate-500 font-medium">Approval Workflow</span>
              </div>
            )}
          </div>
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* User Context Strip */}
        {!collapsed && (
          <div className="border-b border-slate-200/80 bg-white/70 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {isAicte ? "AICTE Regulatory Bureau" : "Institution Portal"}
              </span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-800">
              {userProfile?.displayName || "Authorized User"}
            </p>
          </div>
        )}

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {categories.map((category) => {
            const items = filtered.filter((i) => i.category === category);
            return (
              <div key={category} className="space-y-0.5">
                {!collapsed && (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                    {category}
                  </p>
                )}
                {items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/institution/dashboard" &&
                      item.href !== "/aicte/dashboard" &&
                      pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-slate-200/70 text-slate-900 font-semibold shadow-xs"
                          : "text-slate-600 hover:bg-slate-200/40 hover:text-slate-900",
                        collapsed && "justify-center px-0 py-2"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r-md bg-blue-600" />
                      )}
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-blue-600" : "text-slate-600 group-hover:text-slate-700"
                        )}
                      />
                      {!collapsed && (
                        <span className="truncate flex-1">{item.label}</span>
                      )}
                      {!collapsed && item.badge && (
                        <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer / Quick Help */}
        {!collapsed && (
          <div className="border-t border-slate-200 bg-white/50 p-3">
            <div className="rounded-md border border-slate-200 bg-white p-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  AICTE APH 2026-27
                </span>
                <span className="text-[10px] font-mono text-slate-400">v2.4</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 leading-tight">
                Process Handbook Compliance Active
              </p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
