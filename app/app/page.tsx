"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Building2,
  CheckCircle2,
  ArrowRight,
  FileText,
  Clock,
  Lock,
  ChevronRight,
  GraduationCap,
  Sparkles,
  Check,
  Search,
  ExternalLink,
  Layers,
  ArrowUpRight,
  FileCheck2,
  CalendarDays,
  Shield,
  KeyRound,
  UserPlus,
  LogIn,
} from "lucide-react";

export default function HighProductionLandingPage() {
  // Interactive Live Hero Preview Widget State
  const [heroTab, setHeroTab] = useState<"scrutiny" | "deficiency" | "evc" | "decision">("scrutiny");
  const [doc1Verified, setDoc1Verified] = useState(true);
  const [doc2Verified, setDoc2Verified] = useState(true);

  return (
    <div className="min-h-screen bg-[#fcfcfd] flex flex-col font-sans text-[#0a2540] selection:bg-[#635bff] selection:text-white antialiased">
      {/* Top Government Official Banner */}
      <div className="bg-[#0a2540] text-slate-300 text-xs py-2 px-4 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 tracking-wide font-medium">
            <span className="text-white font-semibold">Government of India</span>
            <span className="text-slate-500">•</span>
            <span>Ministry of Education</span>
            <span className="text-slate-500">•</span>
            <span className="text-[#00d4ff] font-semibold">All India Council for Technical Education</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span className="font-mono text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800 font-semibold">
              ● APH AY 2026-27 Active
            </span>
          </div>
        </div>
      </div>

      {/* Stripe-Grade Sticky Navigation */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0a2540] text-white shadow-xs">
              <ShieldCheck className="h-6 w-6 text-[#00d4ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-[#0a2540]">
                  AICTE APPROVAL
                </span>
                <span className="text-[10px] font-bold text-[#635bff] bg-[#635bff]/10 px-2 py-0.5 rounded-full">
                  v2.4
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                National Workflow Automation & Compliance Platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <span className="text-xs sm:text-sm font-semibold text-slate-700 hover:text-[#0a2540] px-3 py-2 transition">
                Sign In
              </span>
            </Link>
            <Link href="/register">
              <Button
                size="sm"
                className="bg-[#0a2540] hover:bg-[#1a3b5c] text-white rounded-full px-5 h-9 text-xs sm:text-sm font-semibold shadow-xs hover:-translate-y-0.5 transition duration-150"
              >
                Register Institute <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Larger Typography and Animated Floating Showcase */}
      <section className="relative stripe-mesh-hero pt-16 pb-20 md:pt-24 md:pb-28 border-b border-black/[0.06] overflow-hidden">
        {/* Subtle geometric background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0a254006_1px,transparent_1px),linear-gradient(to_bottom,#0a254006_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left 7 Columns: Bolder, Bigger Typography */}
            <div className="lg:col-span-7 space-y-6">
              {/* Product Badge Pill */}
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/95 border border-slate-200 shadow-2xs text-xs font-semibold text-slate-800">
                <span className="flex h-2 w-2 rounded-full bg-[#635bff] animate-pulse" />
                <span className="text-[#0a2540]">Statutory Approval Process Handbook 2026-27</span>
                <span className="text-slate-300">|</span>
                <span className="text-[#635bff] text-[11px] font-bold">Now Live</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              </div>

              {/* Bolder, Bigger Headline */}
              <h1 className="text-4xl sm:text-6xl lg:text-[4rem] font-extrabold text-[#0a2540] tracking-[-0.04em] leading-[1.04]">
                The unified approval platform for India’s technical institutions.
              </h1>

              {/* Subheading */}
              <p className="text-base sm:text-lg text-slate-600 leading-[1.65] max-w-2xl font-normal">
                A modern regulatory operating system connecting over 10,000 engineering, polytechnic, and management colleges with AICTE. File Extension of Approval (EoA), start New Programs, expand student intake, and verify statutory compliance with full transparency.
              </p>

              {/* Primary Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3.5">
                <Link href="/login">
                  <Button
                    size="lg"
                    className="bg-[#0a2540] hover:bg-[#1a3b5c] text-white rounded-full px-7 h-12 text-sm font-semibold shadow-xs hover:-translate-y-0.5 transition duration-150 flex items-center gap-2"
                  >
                    <LogIn className="h-4 w-4" /> Sign In to Portal
                  </Button>
                </Link>
                <Link href="/register">
                  <Button
                    variant="outline"
                    size="lg"
                    className="bg-white hover:bg-slate-50 text-slate-800 border-slate-300 rounded-full px-7 h-12 text-sm font-semibold shadow-2xs hover:-translate-y-0.5 transition duration-150 flex items-center gap-2"
                  >
                    <UserPlus className="h-4 w-4 text-[#635bff]" /> Register New Institute
                  </Button>
                </Link>
              </div>

              {/* Proof Metric Strip */}
              <div className="pt-8 border-t border-slate-200/80 grid grid-cols-3 gap-6 text-xs max-w-lg">
                <div>
                  <span className="block text-2xl font-black text-[#0a2540] tracking-tight">100%</span>
                  <span className="text-slate-500 font-medium">Digital Transparency</span>
                </div>
                <div>
                  <span className="block text-2xl font-black text-[#0a2540] tracking-tight">29.7 Days</span>
                  <span className="text-slate-500 font-medium">Average Approval Cycle</span>
                </div>
                <div>
                  <span className="block text-2xl font-black text-[#0a2540] tracking-tight">Zero Delay</span>
                  <span className="text-slate-500 font-medium">Automated Escalation</span>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Official National Process Overview & Statistics Graphic (Stripe Style) */}
            <div className="lg:col-span-5 animate-float-slow">
              <div className="stripe-card-glow rounded-3xl bg-white border border-slate-200/90 p-7 space-y-6 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0a2540] text-white shadow-xs">
                      <ShieldCheck className="h-5 w-5 text-[#00d4ff]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-[#0a2540] tracking-tight">
                        AICTE National Operations
                      </h3>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Live Approval Workflow Hub • AY 2026-27
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live System
                  </span>
                </div>

                {/* 4 Core National Metrics Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Approved Institutes
                    </span>
                    <span className="text-2xl font-black text-[#0a2540] tracking-tight block">
                      10,480+
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 block">
                      Pan-India Technical Network
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Citizens Charter SLA
                    </span>
                    <span className="text-2xl font-black text-[#0a2540] tracking-tight block">
                      96.4%
                    </span>
                    <span className="text-[10px] font-semibold text-blue-600 block">
                      On-Schedule Delivery
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Regional Bureaus
                    </span>
                    <span className="text-2xl font-black text-[#0a2540] tracking-tight block">
                      5 Offices
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 block">
                      Regional Jurisdictions
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      Digital Processing
                    </span>
                    <span className="text-2xl font-black text-[#0a2540] tracking-tight block">
                      100%
                    </span>
                    <span className="text-[10px] font-semibold text-purple-600 block">
                      Paperless Workflow
                    </span>
                  </div>
                </div>

                {/* Regional Status Indicators */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                    Regional Bureau Real-Time Velocity
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { name: "Western Bureau (Mumbai)", status: "Active • 24h Turnaround" },
                      { name: "Northern Bureau (New Delhi)", status: "Active • Normal SLA" },
                      { name: "Southern Bureau (Chennai)", status: "Active • Zero Backlog" },
                    ].map((bureau, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 text-xs font-medium"
                      >
                        <span className="text-[#0a2540] font-semibold text-[11px]">{bureau.name}</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold border border-emerald-100">
                          {bureau.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Portal Access CTA */}
                <Link href="/login" className="block pt-1">
                  <Button
                    size="sm"
                    className="w-full bg-[#0a2540] hover:bg-[#1a3b5c] text-white rounded-full text-xs font-bold h-10 shadow-xs hover:-translate-y-0.5 transition flex items-center justify-center gap-1.5"
                  >
                    Enter Institutional Gateway <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About The Platform Section: What the Platform Does */}
      <section className="py-20 bg-white border-b border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-[#635bff]">
              Core Capabilities
            </span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#0a2540] tracking-tight">
              A comprehensive operating platform for institutional compliance.
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed font-normal">
              Built in accordance with the AICTE Act 1987 and the Approval Process Handbook (APH 2026-27), this system replaces manual paperwork with automated regulatory workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="stripe-card-interactive rounded-2xl bg-[#fafafa] border border-slate-200/90 p-7 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-[#0048e5]">
                <FileCheck2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0a2540]">
                Annual Extension of Approval (EoA)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Streamlined renewal for existing programs. Fast-track validation for institutes maintaining NBA accreditation, clean compliance history, and mandatory faculty-cadre ratios.
              </p>
            </div>

            <div className="stripe-card-interactive rounded-2xl bg-[#fafafa] border border-slate-200/90 p-7 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-[#635bff]">
                <GraduationCap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0a2540]">
                New Programs & Intake Expansions
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Apply to start emerging engineering departments (AI/ML, Data Science, Robotics) or expand existing class capacities with automated instructional area verification.
              </p>
            </div>

            <div className="stripe-card-interactive rounded-2xl bg-[#fafafa] border border-slate-200/90 p-7 space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0a2540]">
                Citizens Charter SLA Assurance
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Guaranteed time-bound processing. Applications not acted upon within statutory deadlines trigger automated Level 1, 2, and 3 escalations to Bureau Officers and Chairman.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5-Stage Approval Lifecycle */}
      <section className="py-20 bg-[#fbfbfd] border-b border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-[#635bff]">
              Statutory Workflow
            </span>
            <h2 className="mt-2 text-3xl font-extrabold text-[#0a2540] tracking-tight">
              The 5-Stage AICTE Approval Lifecycle
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-600">
              Transparent, accountable, and step-by-step regulatory progression
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              {
                step: "01",
                title: "Digital Submission",
                desc: "5-step wizard with built-in APH checks and document upload checklist.",
              },
              {
                step: "02",
                title: "Regional Scrutiny",
                desc: "Verification of municipal building plans, fire NOC, land deeds, and cadre ratio.",
              },
              {
                step: "03",
                title: "EVC Inspection",
                desc: "Physical on-site or hybrid audit by appointed university expert committee panel.",
              },
              {
                step: "04",
                title: "Committee Hearing",
                desc: "Standing Hearing Committee review of rectified deficiencies and institutional rejoinders.",
              },
              {
                step: "05",
                title: "Approval Order",
                desc: "Issuance of official sealed approval letter with statutory compliance conditions.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="p-5 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-2 hover:-translate-y-1 transition duration-150"
              >
                <span className="font-mono text-sm font-black text-[#635bff] bg-[#635bff]/10 px-2 py-0.5 rounded-md">
                  {item.step}
                </span>
                <h4 className="text-sm font-bold text-[#0a2540] pt-1">{item.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prominent Authentication Gateway: Sign In & Register */}
      <section className="py-20 bg-white border-b border-black/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold uppercase tracking-wider text-[#635bff]">
              Portal Authentication
            </span>
            <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold text-[#0a2540] tracking-tight">
              Get Started with Your Institutional Account
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-600">
              Sign in with your registered credentials or register a new technical institution
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Card 1: Existing Institute (Sign In) */}
            <div className="stripe-card-interactive rounded-3xl bg-[#fafafa] border border-slate-200/90 p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0a2540] text-white">
                    <LogIn className="h-6 w-6 text-[#00d4ff]" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
                    Existing Institutions
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold text-[#0a2540]">
                  Sign In to Active Portal
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed font-normal">
                  For colleges with an assigned AICTE Permanent Institute ID (PID). Access your dashboard, submit annual Extension of Approval (EoA), reply to scrutiny deficiencies, or track pending committee hearings.
                </p>

                <div className="mt-6 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>Track active applications in real time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>Upload compliance undertakings and proofs</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200">
                <Link href="/login" className="block">
                  <Button
                    size="lg"
                    className="w-full bg-[#0a2540] hover:bg-[#1a3b5c] text-white rounded-full text-xs sm:text-sm font-semibold h-11 shadow-xs hover:-translate-y-0.5 transition"
                  >
                    Sign In to Institution Account <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Card 2: New Institute (Sign Up / Register) */}
            <div className="stripe-card-interactive rounded-3xl bg-[#fafafa] border border-slate-200/90 p-8 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#635bff] text-white">
                    <UserPlus className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-bold text-[#635bff] bg-[#635bff]/10 px-3 py-1 rounded-full border border-[#635bff]/20">
                    New Registrations
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold text-[#0a2540]">
                  Register Technical Institute
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed font-normal">
                  For registered academic societies, trusts, or universities establishing a new technical campus. Create your institutional identity, obtain your PID, and initiate preliminary scrutiny.
                </p>

                <div className="mt-6 space-y-2 text-xs text-slate-700">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#635bff]" />
                    <span>Instant institutional profile provisioning</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#635bff]" />
                    <span>Direct access to New Institution filing wizard</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200">
                <Link href="/register" className="block">
                  <Button
                    size="lg"
                    className="w-full bg-[#635bff] hover:bg-[#5349e8] text-white rounded-full text-xs sm:text-sm font-semibold h-11 shadow-xs hover:-translate-y-0.5 transition"
                  >
                    Register New Institution <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Security Credentials Strip */}
          <div className="mt-12 max-w-4xl mx-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-5 flex flex-wrap items-center justify-around gap-4 text-xs text-slate-600 font-medium">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-600" />
              <span>256-Bit Encrypted Statutory Vault</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <span>Role-Based Access Control (RBAC)</span>
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-purple-600" />
              <span>Immutable Audit Trail</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stripe-Grade Clean Footer */}
      <footer className="mt-auto bg-white border-t border-black/[0.06] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0a2540] text-white">
              <ShieldCheck className="h-4 w-4 text-[#00d4ff]" />
            </div>
            <div>
              <span className="font-bold text-[#0a2540]">
                All India Council for Technical Education (AICTE)
              </span>
              <p className="text-[11px] text-slate-400">
                Statutory Body, Ministry of Education, Government of India
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-slate-400 text-xs">
            <Link href="/login" className="hover:text-[#0a2540] transition">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-[#0a2540] transition">
              Register
            </Link>
            <span>Nelson Mandela Marg, Vasant Kunj, New Delhi</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
