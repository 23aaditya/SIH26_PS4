"use client";
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { RequireAuth } from "@/components/guards/RequireAuth";

export function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };

  return (
    <RequireAuth>
      <div className="flex h-screen overflow-hidden bg-[#F4F6FB] font-sans text-[#0F172A] antialiased">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
        />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
          <main
            onMouseMove={handleMouseMove}
            className="flex-1 overflow-y-auto interactive-blue-grid p-4 md:p-6 lg:p-8 transition-all"
          >
            <div className="mx-auto max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}
