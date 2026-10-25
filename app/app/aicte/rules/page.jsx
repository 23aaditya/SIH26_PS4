"use client";
import React, { useState } from "react";
import { RequireRole } from "@/components/guards/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";
function WorkflowRulesContent() {
    const [rules, setRules] = useState([
        {
            id: "rule-1",
            name: "Automated EVC Waiver for NBA Accredited Departments",
            category: "Increase in Intake",
            description: "Automatically waive physical EVC inspection if target department holds valid NBA Tier-1 accreditation for 3+ years and zero structural deficiency history.",
            enabled: true,
            trigger: "nbaAccredited === true && naacGrade in ['A+', 'A++']",
        },
        {
            id: "rule-2",
            name: "Fast-Track Extension of Approval (EoA Green Channel)",
            category: "Extension of Approval",
            description: "Institutions with verified PWD occupancy certificate, fire safety NOC, and cadre ratio >= 1:20 skip Hearing Committee and proceed straight to Order Issuance.",
            enabled: true,
            trigger: "allStatutoryDocsVerified === true && facultyRatioSatisfied === true",
        },
        {
            id: "rule-3",
            name: "Mandatory Multi-Disciplinary EVC for New Technical Institutes",
            category: "New Institution",
            description: "Require 3-member expert committee inspection covering Land & Title, Building PWD structural norms, and Financial Deposit validation.",
            enabled: true,
            trigger: "applicationCategory === 'new_institution'",
        },
        {
            id: "rule-4",
            name: "Strict 10-Day SLA for Deficiency Rectification",
            category: "All Categories",
            description: "Automatic generation of rejection recommendation if an institution fails to provide clarification evidence within 10 statutory working days.",
            enabled: false,
            trigger: "daysInClarification > 10",
        },
    ]);
    const toggleRule = (id) => {
        setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
    };
    return (<div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:text-2xl">
            Workflow Configuration & Policy Automation Engine
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Configure dynamic stage transitions, SLA bounds, and automated regulatory waiver criteria
          </p>
        </div>
      </div>

      {/* Rules Cards */}
      <div className="space-y-4">
        {rules.map((rule) => (<Card key={rule.id} className="border border-slate-200/90 shadow-2xs bg-white">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {rule.category}
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">{rule.name}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                  {rule.description}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    Rule Logic: {rule.trigger}
                  </span>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-3">
                <button onClick={() => toggleRule(rule.id)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${rule.enabled ? "bg-blue-600" : "bg-slate-300"}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${rule.enabled ? "translate-x-5" : "translate-x-0"}`}/>
                </button>
                <span className="text-xs font-semibold text-slate-800 w-16">
                  {rule.enabled ? "Active" : "Disabled"}
                </span>
              </div>
            </CardContent>
          </Card>))}
      </div>
    </div>);
}
export default function WorkflowRulesPage() {
    return (<RequireRole roles={["admin"]}>
      <WorkflowRulesContent />
    </RequireRole>);
}
