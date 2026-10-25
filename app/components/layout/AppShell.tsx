"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RequireAuth } from "@/components/guards/RequireAuth";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <RequireAuth>
      <div className="flex h-screen overflow-hidden bg-slate-50/60 font-sans text-slate-900 antialiased">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
