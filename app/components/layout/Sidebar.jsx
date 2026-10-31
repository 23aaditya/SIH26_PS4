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
  Network,
} from "lucide-react";
import { AicteLogo } from "@/components/ui/AicteLogo";

const navItems = [
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
    roles: [
      "regional_officer",
      "bureau_officer",
      "scrutiny_committee",
      "evc_coordinator",
      "competent_authority",
      "admin",
      "super_admin",
      "aicte",
      "reviewing_officer",
      "unit_head",
    ],
  },
  {
    category: "Core Processing",
    label: "My Work Tree",
    href: "/aicte/my-work-tree",
    icon: Network,
    roles: [
      "regional_officer",
      "bureau_officer",
      "scrutiny_committee",
      "evc_coordinator",
      "competent_authority",
      "admin",
      "super_admin",
      "aicte",
      "reviewing_officer",
      "unit_head",
    ],
  },
  {
    category: "Core Processing",
    label: "Application Queue",
    href: "/aicte/applications",
    icon: FileText,
    badge: "Active",
    roles: [
      "regional_officer",
      "bureau_officer",
      "scrutiny_committee",
      "evc_coordinator",
      "competent_authority",
      "admin",
      "super_admin",
      "aicte",
      "reviewing_officer",
      "unit_head",
    ],
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
    roles: [
      "regional_officer",
      "bureau_officer",
      "scrutiny_committee",
      "evc_coordinator",
      "competent_authority",
      "admin",
    ],
  },
  {
    category: "Monitoring & Audits",
    label: "Alerts & Escalations",
    href: "/aicte/notifications",
    icon: Bell,
    roles: [
      "regional_officer",
      "bureau_officer",
      "scrutiny_committee",
      "evc_coordinator",
      "competent_authority",
      "admin",
    ],
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

export function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }) {
  const { userProfile, isAicte } = useAuth();
  const pathname = usePathname();
  const role = userProfile?.role || "institution";
  const filtered = navItems.filter((item) => item.roles.includes(role));
  const categories = Array.from(new Set(filtered.map((item) => item.category || "General")));

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#061B31]/30 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Main Sidebar with Stripe technical luxury layout */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[#E5EDF5] bg-white transition-all duration-200 lg:static lg:z-auto",
          collapsed ? "w-16" : "w-64",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Header / Brand */}
        <div className="flex h-14 items-center justify-between border-b border-[#E5EDF5] px-3.5">
          {collapsed ? (
            <AicteLogo variant="mark" size={32} />
          ) : (
            <AicteLogo variant="sidebar" />
          )}
          <button
            onClick={onToggleCollapse}
            className="hidden lg:flex h-6 w-6 items-center justify-center rounded-[4px] text-slate-400 hover:text-[#061B31] hover:bg-[#F8FAFD] transition"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* User Context Strip */}
        {!collapsed && (
          <div className="border-b border-[#E5EDF5] bg-[#F8FAFD] px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {isAicte ? "AICTE Regulatory Bureau" : "Institution Portal"}
              </span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00D66F]" />
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-[#061B31]">
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
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
                        "group relative flex items-center gap-2.5 rounded-[6px] px-3 py-1.5 text-xs font-normal transition-all duration-150",
                        isActive
                          ? "bg-[#EFF6FF] text-[#1E40AF] font-semibold border border-[#DBEAFE]"
                          : "text-[#061B31]/80 hover:bg-[#F8FAFD] hover:text-[#1E40AF]",
                        collapsed && "justify-center px-0 py-2"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-[#1E40AF]" : "text-slate-400 group-hover:text-[#1E40AF]"
                        )}
                      />
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <span className="text-[10px] font-medium text-[#1E40AF] bg-[#EFF6FF] px-1.5 py-0.5 rounded-[4px] border border-[#BFDBFE]">
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

        {/* Footer / Process Handbook Badge */}
        {!collapsed && (
          <div className="border-t border-[#E5EDF5] bg-[#F8FAFD] p-3">
            <div className="rounded-[6px] border border-[#E5EDF5] bg-white p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  AICTE APH 2026-27
                </span>
                <span className="text-[10px] font-mono text-[#1E40AF] font-semibold">Active</span>
              </div>
              <p className="mt-1 text-[11px] text-[#061B31]/70 leading-tight">
                Process Handbook Compliance Engine
              </p>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
