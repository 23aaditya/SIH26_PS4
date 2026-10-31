"use client";
import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight, Clock, Lock, ChevronRight, GraduationCap, Check, FileCheck2, Shield, KeyRound, UserPlus, LogIn, } from "lucide-react";
import { AicteLogo } from "@/components/ui/AicteLogo";
export default function HighProductionLandingPage() {
    // Interactive Live Hero Preview Widget State
    const [heroTab, setHeroTab] = useState("scrutiny");
    const [doc1Verified, setDoc1Verified] = useState(true);
    const [doc2Verified, setDoc2Verified] = useState(true);

    const handleMouseMove = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
      e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
    };

    return (<div onMouseMove={handleMouseMove} className="min-h-screen bg-[#F4F6FB] flex flex-col font-sans text-[#0F172A] selection:bg-blue-600 selection:text-white antialiased">
      {/* Top Government Official Banner */}
      <div className="bg-[#0F172A] text-slate-300 text-xs py-2 px-4 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 tracking-wide font-medium">
            <span className="text-white font-semibold">Government of India</span>
            <span className="text-slate-500">•</span>
            <span>Ministry of Education</span>
            <span className="text-slate-500">•</span>
            <span className="text-[#38BDF8] font-semibold">All India Council for Technical Education</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span className="font-mono text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-800 font-semibold">
              ● APH AY 2026-27 Active
            </span>
          </div>
        </div>
      </div>

      {/* Modern Executive Sticky Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <AicteLogo variant="horizontal" size={48} withLink href="/" />

          <div className="flex items-center gap-3">
            <Link href="/login">
              <span className="text-xs sm:text-sm font-semibold text-[#0F172A] hover:text-[#1E40AF] px-3 py-2 transition-all">
                Sign In
              </span>
            </Link>
            <Link href="/register">
              <Button size="sm" className="bg-[#1E40AF] hover:bg-[#1E3A8A] text-white rounded-[6px] px-4 h-8 text-xs font-semibold shadow-xs transition duration-150">
                Register Institute <ChevronRight className="h-3.5 w-3.5 ml-1"/>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section with Interactive 3D Blue Grid */}
      <section className="relative interactive-blue-grid pt-16 pb-20 md:pt-24 md:pb-28 border-b border-slate-200 overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Left 7 Columns: Executive Typography */}
            <div className="lg:col-span-7 space-y-6">
              {/* Product Badge Pill */}
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1 rounded-[6px] bg-white border border-slate-200 text-xs font-medium text-[#0F172A] shadow-2xs">
                <span className="flex h-1.5 w-1.5 rounded-full bg-[#1E40AF] animate-pulse"/>
                <span>Statutory Approval Process Handbook 2026-27</span>
                <span className="text-slate-300">|</span>
                <span className="text-[#1E40AF] text-[11px] font-bold">Now Live</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400"/>
              </div>

              {/* Stripe Weight 300 Signature Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-light text-[#061B31] tracking-[-0.04em] leading-[1.08]">
                The unified approval platform for India’s <span className="text-[#81B81A] font-light">technical institutions</span>.
              </h1>

              {/* Subheading */}
              <p className="text-base sm:text-lg text-slate-600 leading-[1.65] max-w-2xl font-normal">
                A modern regulatory operating system connecting over 10,000 engineering, polytechnic, and management colleges with AICTE. File Extension of Approval (EoA), start New Programs, expand student intake, and verify statutory compliance with full transparency.
              </p>

              {/* Primary Action Buttons */}
              <div className="pt-2 flex flex-wrap items-center gap-3.5">
                <Link href="/login">
                  <Button size="lg" className="bg-[#1E40AF] hover:bg-[#1E3A8A] text-white rounded-[6px] px-6 h-11 text-sm font-normal transition duration-150 flex items-center gap-2">
                    <LogIn className="h-4 w-4"/> Sign In to Portal
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="outline" size="lg" className="bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE] rounded-[6px] px-6 h-11 text-sm font-normal transition duration-150 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-[#1E40AF]"/> Register New Institute
                  </Button>
                </Link>
              </div>

              {/* Proof Metric Strip */}
              <div className="pt-8 border-t border-[#E5EDF5] grid grid-cols-3 gap-6 text-xs max-w-lg">
                <div>
                  <span className="block text-2xl font-light text-[#061B31] font-mono tracking-tight">100%</span>
                  <span className="text-slate-500 font-normal">Digital Transparency</span>
                </div>
                <div>
                  <span className="block text-2xl font-light text-[#061B31] font-mono tracking-tight">29.7 Days</span>
                  <span className="text-slate-500 font-normal">Average Approval Cycle</span>
                </div>
                <div>
                  <span className="block text-2xl font-light text-[#061B31] font-mono tracking-tight">Zero Delay</span>
                  <span className="text-slate-500 font-normal">Automated Escalation</span>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Official National Process Overview & Statistics Graphic (Stripe Style) */}
            <div className="lg:col-span-5 animate-float-subtle">
              <div className="rounded-[6px] bg-white border border-[#E5EDF5] p-7 space-y-6 stripe-card">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-[#E5EDF5]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[#061B31] text-white">
                      <ShieldCheck className="h-5 w-5 text-[#1E40AF]"/>
                    </div>
                    <div>
                      <h3 className="text-sm font-normal text-[#061B31] tracking-tight">
                        AICTE National Operations
                      </h3>
                      <p className="text-[11px] text-slate-500 font-normal">
                        Live Approval Workflow Hub • AY 2026-27
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-[#00D66F]/10 text-[#003724] border border-[#00D66F]/20 text-[10px] font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00D66F] animate-pulse-subtle"/>
                    Live System
                  </span>
                </div>

                {/* 4 Core National Metrics Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="p-3.5 rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 block">
                      Approved Institutes
                    </span>
                    <span className="text-2xl font-light text-[#061B31] font-mono tracking-tight block">
                      10,480+
                    </span>
                    <span className="text-[10px] font-normal text-[#003724] block">
                      Pan-India Technical Network
                    </span>
                  </div>

                  <div className="p-3.5 rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 block">
                      Citizens Charter SLA
                    </span>
                    <span className="text-2xl font-light text-[#061B31] font-mono tracking-tight block">
                      96.4%
                    </span>
                    <span className="text-[10px] font-normal text-[#1E40AF] block">
                      On-Schedule Delivery
                    </span>
                  </div>

                  <div className="p-3.5 rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 block">
                      Regional Bureaus
                    </span>
                    <span className="text-2xl font-light text-[#061B31] font-mono tracking-tight block">
                      5 Offices
                    </span>
                    <span className="text-[10px] font-normal text-slate-500 block">
                      Regional Jurisdictions
                    </span>
                  </div>

                  <div className="p-3.5 rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] space-y-1">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 block">
                      Digital Processing
                    </span>
                    <span className="text-2xl font-light text-[#061B31] font-mono tracking-tight block">
                      100%
                    </span>
                    <span className="text-[10px] font-normal text-[#1E40AF] block">
                      Paperless Workflow
                    </span>
                  </div>
                </div>

                {/* Regional Status Indicators */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wider block">
                    Regional Bureau Real-Time Velocity
                  </span>
                  <div className="space-y-1.5 text-xs">
                    {[
                      { name: "Western Bureau (Mumbai)", status: "Active • 24h Turnaround" },
                      { name: "Northern Bureau (New Delhi)", status: "Active • Normal SLA" },
                      { name: "Southern Bureau (Chennai)", status: "Active • Zero Backlog" },
                    ].map((bureau, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-[6px] bg-white border border-[#E5EDF5] text-xs font-normal">
                        <span className="text-[#061B31] text-[11px]">{bureau.name}</span>
                        <span className="text-[10px] text-[#003724] bg-[#00D66F]/10 px-2 py-0.5 rounded-[4px] border border-[#00D66F]/20 font-medium">
                          {bureau.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Portal Access CTA */}
                <Link href="/login" className="block pt-1">
                  <Button size="sm" className="w-full bg-[#061B31] hover:bg-[#061B31]/90 text-white rounded-[6px] text-xs font-normal h-10 transition duration-150 flex items-center justify-center gap-1.5">
                    Enter Institutional Gateway <ArrowRight className="h-3.5 w-3.5 text-[#E2E4FF]"/>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About The Platform Section: What the Platform Does */}
      <section className="py-20 bg-white border-b border-[#E5EDF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-14">
            <span className="inline-block px-2.5 py-1 text-xs font-normal uppercase tracking-wider text-[#1E40AF] bg-[#EFF6FF] border border-[#BFDBFE] rounded-[4px]">
              Core Capabilities
            </span>
            <h2 className="mt-3 stripe-h2 text-3xl sm:text-4xl text-[#061B31]">
              A comprehensive operating platform for institutional compliance.
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed font-normal">
              Built in accordance with the AICTE Act 1987 and the Approval Process Handbook (APH 2026-27), this system replaces manual paperwork with automated regulatory workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="stripe-card rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] p-7 space-y-4 hover:border-[#1E40AF]/40 transition duration-150">
              <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-[#EFF6FF] text-[#1E40AF]">
                <FileCheck2 className="h-5 w-5"/>
              </div>
              <h3 className="stripe-h3 text-lg text-[#061B31]">
                Annual Extension of Approval (EoA)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Streamlined renewal for existing programs. Fast-track validation for institutes maintaining NBA accreditation, clean compliance history, and mandatory faculty-cadre ratios.
              </p>
            </div>

            <div className="stripe-card rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] p-7 space-y-4 hover:border-[#1E40AF]/40 transition duration-150">
              <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-[#EFF6FF] text-[#1E40AF]">
                <GraduationCap className="h-5 w-5"/>
              </div>
              <h3 className="stripe-h3 text-lg text-[#061B31]">
                New Programs & Intake Expansions
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Apply to start emerging engineering departments (AI/ML, Data Science, Robotics) or expand existing class capacities with automated instructional area verification.
              </p>
            </div>

            <div className="stripe-card rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] p-7 space-y-4 hover:border-[#1E40AF]/40 transition duration-150">
              <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-[#00D66F]/15 text-[#003724]">
                <Clock className="h-5 w-5 text-[#00D66F]"/>
              </div>
              <h3 className="stripe-h3 text-lg text-[#061B31]">
                Citizens Charter SLA Assurance
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                Guaranteed time-bound processing. Applications not acted upon within statutory deadlines trigger automated Level 1, 2, and 3 escalations to Bureau Officers and Chairman.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5-Stage Approval Lifecycle */}
      <section className="py-20 bg-[#F8FAFD] border-b border-[#E5EDF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="inline-block px-2.5 py-1 text-xs font-normal uppercase tracking-wider text-[#1E40AF] bg-[#EFF6FF] border border-[#BFDBFE] rounded-[4px]">
              Statutory Workflow
            </span>
            <h2 className="mt-3 stripe-h2 text-3xl text-[#061B31]">
              The 5-Stage AICTE Approval Lifecycle
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 font-normal">
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
              <div key={item.step} className="p-5 rounded-[6px] border border-[#E5EDF5] bg-white space-y-2 hover:-translate-y-0.5 transition duration-150">
                <span className="font-mono text-sm font-medium text-[#1E40AF] bg-[#EFF6FF] px-2 py-0.5 rounded-[4px] border border-[#BFDBFE]">
                  {item.step}
                </span>
                <h4 className="text-sm font-normal text-[#061B31] pt-1">{item.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prominent Authentication Gateway: Sign In & Register */}
      <section className="py-20 bg-white border-b border-[#E5EDF5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="inline-block px-2.5 py-1 text-xs font-normal uppercase tracking-wider text-[#1E40AF] bg-[#EFF6FF] border border-[#BFDBFE] rounded-[4px]">
              Portal Authentication
            </span>
            <h2 className="mt-3 stripe-h2 text-3xl sm:text-4xl text-[#061B31]">
              Get Started with Your Institutional Account
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 font-normal">
              Sign in with your registered credentials or register a new technical institution
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Card 1: Existing Institute (Sign In) */}
            <div className="stripe-card rounded-[6px] bg-white border border-[#E5EDF5] p-8 flex flex-col justify-between hover:border-[#1E40AF]/40 transition duration-150">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-[#061B31] text-white">
                    <LogIn className="h-5 w-5 text-[#E2E4FF]"/>
                  </div>
                  <span className="text-xs font-normal text-slate-700 bg-[#F8FAFD] px-3 py-1 rounded-[4px] border border-[#E5EDF5]">
                    Existing Institutions
                  </span>
                </div>

                <h3 className="mt-6 stripe-h3 text-xl text-[#061B31]">
                  Sign In to Active Portal
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed font-normal">
                  For colleges with an assigned AICTE Permanent Institute ID (PID). Access your dashboard, submit annual Extension of Approval (EoA), reply to scrutiny deficiencies, or track pending committee hearings.
                </p>

                <div className="mt-6 space-y-2 text-xs text-slate-700 font-normal">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#00D66F]"/>
                    <span>Track active applications in real time</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#00D66F]"/>
                    <span>Upload compliance undertakings and proofs</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#E5EDF5]">
                <Link href="/login" className="block">
                  <Button size="lg" className="w-full bg-[#061B31] hover:bg-[#061B31]/90 text-white rounded-[6px] text-xs sm:text-sm font-normal h-11 transition duration-150 flex items-center justify-center gap-2">
                    Sign In to Institution Account <ArrowRight className="h-4 w-4"/>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Card 2: New Institute (Sign Up / Register) */}
            <div className="stripe-card rounded-[6px] bg-white border border-[#E5EDF5] p-8 flex flex-col justify-between hover:border-[#1E40AF]/40 transition duration-150">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[6px] bg-[#EFF6FF] text-[#1E40AF]">
                    <UserPlus className="h-5 w-5"/>
                  </div>
                  <span className="text-xs font-semibold text-[#1E40AF] bg-[#EFF6FF] px-3 py-1 rounded-[4px] border border-[#BFDBFE]">
                    New Registrations
                  </span>
                </div>

                <h3 className="mt-6 stripe-h3 text-xl text-[#061B31]">
                  Register Technical Institute
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed font-normal">
                  For registered academic societies, trusts, or universities establishing a new technical campus. Create your institutional identity, obtain your PID, and initiate preliminary scrutiny.
                </p>

                <div className="mt-6 space-y-2 text-xs text-slate-700 font-normal">
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#1E40AF]"/>
                    <span>Instant institutional profile provisioning</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-[#1E40AF]"/>
                    <span>Direct access to New Institution filing wizard</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-[#E5EDF5]">
                <Link href="/register" className="block">
                  <Button size="lg" className="w-full bg-[#1E40AF] hover:bg-[#1E3A8A] text-white rounded-[6px] text-xs sm:text-sm font-normal h-11 transition duration-150 flex items-center justify-center gap-2">
                    Register New Institution <ArrowRight className="h-4 w-4"/>
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* Security Credentials Strip */}
          <div className="mt-12 max-w-4xl mx-auto rounded-[6px] border border-[#E5EDF5] bg-[#F8FAFD] p-5 flex flex-wrap items-center justify-around gap-4 text-xs text-slate-600 font-normal">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-[#00D66F]"/>
              <span>256-Bit Encrypted Statutory Vault</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#1E40AF]"/>
              <span>Role-Based Access Control (RBAC)</span>
            </div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-[#2563EB]"/>
              <span>Immutable Audit Trail</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stripe-Grade Clean Footer */}
      <footer className="mt-auto bg-[#F8FAFD] border-t border-[#E5EDF5] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <AicteLogo variant="mark" size={36} />
            <div>
              <span className="font-semibold text-[#061B31] block">
                All India Council for Technical Education (AICTE)
              </span>
              <p className="text-[11px] text-slate-500 font-normal">
                Approval Workflow Automation System • Ministry of Education
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-slate-500 text-xs font-normal">
            <Link href="/login" className="hover:text-[#1E40AF] transition duration-150">
              Sign In
            </Link>
            <Link href="/register" className="hover:text-[#1E40AF] transition duration-150">
              Register
            </Link>
            <span>Nelson Mandela Marg, Vasant Kunj, New Delhi</span>
          </div>
        </div>
      </footer>
    </div>);
}
