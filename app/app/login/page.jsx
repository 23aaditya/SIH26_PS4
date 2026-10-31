"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  Building2,
  Users,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  X,
  Mail,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { AicteLogo } from "@/components/ui/AicteLogo";

export default function LoginPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  // Tab State: 'institution' or 'aicte'
  const [activeTab, setActiveTab] = useState("institution");

  // Form states
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successBanner, setSuccessBanner] = useState("");

  // Forgot Password Modal State
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotErr, setForgotErr] = useState("");

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError("");
    setSuccessBanner("");
    setIdentifier("");
    setPassword("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessBanner("");
    setIsSubmitting(true);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

    try {
      if (activeTab === "institution") {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: identifier, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Authentication failed");
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("aicte_active_demo_user_id", data.user.uid || data.user.id);
          localStorage.setItem("aicte_institute_email", data.user.email);
          localStorage.setItem("aicte_user_profile", JSON.stringify(data.user));
        }

        await refreshProfile();
        router.push("/institution/dashboard");
      } else {
        const res = await fetch(`${API_BASE}/auth/aicte/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ identifier, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Authentication failed");
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("aicte_active_demo_user_id", data.user.employeeCode || data.user.id);
          localStorage.setItem("aicte_user_profile", JSON.stringify(data.user));
        }

        await refreshProfile();
        router.push("/aicte/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in. Please verify credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenForgotPassword = () => {
    setForgotEmail(identifier.includes("@") ? identifier : "");
    setForgotStep(1);
    setForgotOtp("");
    setNewPassword("");
    setConfirmNewPassword("");
    setForgotMsg("");
    setForgotErr("");
    setShowForgotPassword(true);
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setForgotErr("");
    setForgotMsg("");
    setForgotLoading(true);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send OTP verification code.");
      }
      setForgotMsg(data.message || `An OTP verification code has been dispatched to ${forgotEmail}.`);
      setForgotStep(2);
    } catch (err) {
      setForgotErr(err instanceof Error ? err.message : "Error sending OTP");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotErr("");
    setForgotMsg("");

    if (!forgotOtp.trim()) {
      setForgotErr("Please enter the 6-digit OTP code.");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setForgotErr("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setForgotErr("Passwords do not match. Please re-enter.");
      return;
    }

    setForgotLoading(true);
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail,
          otp: forgotOtp,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }
      setSuccessBanner("Password reset successfully! You can now sign in with your new password.");
      setIdentifier(forgotEmail);
      setPassword(newPassword);
      setShowForgotPassword(false);
    } catch (err) {
      setForgotErr(err instanceof Error ? err.message : "Error resetting password");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    e.currentTarget.style.setProperty("--mouse-x", `${x}px`);
    e.currentTarget.style.setProperty("--mouse-y", `${y}px`);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen flex flex-col justify-between interactive-blue-grid p-4 sm:p-6 text-[#0F172A] transition-all"
    >
      {/* Top Header Navigation */}
      <div className="max-w-md w-full mx-auto flex items-center justify-between pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#1E40AF] transition-all duration-150"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to AICTE Portal Home
        </Link>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-[10px] text-[#1E40AF] font-semibold border border-blue-200">
          <span className="h-1.5 w-1.5 rounded-full bg-[#1E40AF] animate-pulse" />
          <span>APH 2026-27</span>
        </div>
      </div>

      <div className="w-full max-w-md mx-auto my-auto">
        {/* Main Floating Card with Tonal Depth */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <AicteLogo variant="mark" size={48} />
              <div>
                <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                  Approval Workflow Automation System
                </span>
                <span className="text-sm font-bold text-[#0F172A]">
                  AICTE Unified Regulatory Gateway
                </span>
              </div>
            </div>

            {/* Profile Selection Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 mb-6">
              <button
                type="button"
                onClick={() => handleTabChange("institution")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-[6px] text-xs transition-all duration-150 ${
                  activeTab === "institution"
                    ? "bg-white text-[#0F172A] font-semibold shadow-xs border border-slate-200"
                    : "text-slate-500 hover:text-[#0F172A] border border-transparent"
                }`}
              >
                <Building2 className={`h-3.5 w-3.5 ${activeTab === "institution" ? "text-[#1E40AF]" : "text-slate-400"}`} />
                <span>Institute User</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("aicte")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-[6px] text-xs transition-all duration-150 ${
                  activeTab === "aicte"
                    ? "bg-white text-[#0F172A] font-semibold shadow-xs border border-slate-200"
                    : "text-slate-500 hover:text-[#0F172A] border border-transparent"
                }`}
              >
                <Users className={`h-3.5 w-3.5 ${activeTab === "aicte" ? "text-[#1E40AF]" : "text-slate-400"}`} />
                <span>AICTE Member</span>
              </button>
            </div>

            {/* Display Headline */}
            <div className="mb-5">
              <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight leading-snug">
                {activeTab === "institution" ? "Sign in as Institution" : "Sign in as AICTE Official"}
              </h1>
              <p className="text-xs text-slate-600 mt-1 font-normal leading-relaxed">
                {activeTab === "institution"
                  ? "Access institutional applications, compliance submissions, and deficiency responses."
                  : "Access regulatory scrutiny, inspection schedules, hearing queues, and authority boards."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {successBanner && (
                <div className="rounded-[6px] bg-emerald-50 border border-emerald-200/80 p-2.5 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{successBanner}</span>
                </div>
              )}

              {error && (
                <div className="rounded-[6px] bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>{error}</div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="identifier" className="text-xs font-medium text-[#0F172A]">
                  {activeTab === "institution" ? "Registered Institutional Email" : "Staff Email or Employee Code"}
                </Label>
                <Input
                  id="identifier"
                  type="text"
                  placeholder={
                    activeTab === "institution"
                      ? "principal@institution.edu"
                      : "official@aicte-india.org or Employee ID"
                  }
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="h-10 text-xs rounded-[6px] border-slate-300 focus:border-[#1E40AF]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-[#0F172A]">
                    Account Password
                  </Label>
                  <button
                    type="button"
                    onClick={handleOpenForgotPassword}
                    className="text-[11px] text-[#1E40AF] hover:text-[#1E3A8A] font-medium transition-all duration-150"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-10 text-xs pr-8 rounded-[6px] border-slate-300 focus:border-[#1E40AF]"
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0F172A] transition"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-10 text-xs sm:text-sm font-semibold rounded-[6px] bg-[#1E40AF] hover:bg-[#1E3A8A] text-white shadow-xs transition-all duration-150 flex items-center justify-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Authenticating Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in to {activeTab === "institution" ? "Institution Dashboard" : "AICTE Gateway"}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-200 text-xs text-slate-500 text-center">
            {activeTab === "institution" ? (
              <span>
                New Technical Institute?{" "}
                <Link
                  href="/register"
                  className="text-[#1E40AF] hover:text-[#1E3A8A] transition font-semibold"
                >
                  Register Portal →
                </Link>
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">
                AICTE Official credentials are provisioned under Ministry e-Governance guidelines
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Forgot Password Modal (OTP Verification Flow) */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-[8px] border border-slate-200 max-w-md w-full p-6 shadow-lg animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-blue-50 text-[#1E40AF]">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#0F172A] tracking-tight">
                    {forgotStep === 1 ? "Credential Recovery" : "Enter Verification OTP"}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-normal">
                    {forgotStep === 1 ? "Dispatches OTP to registered mail" : "Verify OTP and set new password"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="text-slate-400 hover:text-[#0F172A] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {forgotErr && (
              <div className="mt-3 p-2 bg-rose-50 text-rose-700 text-xs rounded-[5px] border border-rose-200 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{forgotErr}</span>
              </div>
            )}

            {forgotMsg && (
              <div className="mt-3 p-2 bg-blue-50 text-[#1E40AF] text-xs rounded-[5px] border border-blue-200 flex items-center gap-1.5">
                <Mail className="h-4 w-4 shrink-0" />
                <span>{forgotMsg}</span>
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleSendOtp} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <Label htmlFor="forgotEmail" className="font-medium text-[#0F172A] block mb-1">
                    Registered Email Address
                  </Label>
                  <Input
                    id="forgotEmail"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="e.g. principal@institution.edu"
                    className="h-9 text-xs rounded-[6px]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    We will send an OTP verification code to this registered address.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowForgotPassword(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={forgotLoading}
                    className="text-xs bg-[#1E40AF] hover:bg-[#1E3A8A] text-white font-medium"
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        Sending OTP...
                      </>
                    ) : (
                      "Send Verification OTP →"
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="mt-4 space-y-3.5 text-xs">
                <div>
                  <div className="mb-1">
                    <Label htmlFor="forgotOtp" className="font-medium text-[#0F172A]">
                      6-Digit OTP Code
                    </Label>
                  </div>
                  <Input
                    id="forgotOtp"
                    type="text"
                    required
                    maxLength={6}
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    className="h-9 text-xs rounded-[6px] font-mono tracking-widest text-center"
                  />
                </div>

                <div>
                  <Label htmlFor="newPassword" className="font-medium text-[#0F172A] block mb-1">
                    New Password
                  </Label>
                  <Input
                    id="newPassword"
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="h-9 text-xs rounded-[6px]"
                  />
                </div>

                <div>
                  <Label htmlFor="confirmNewPassword" className="font-medium text-[#0F172A] block mb-1">
                    Confirm New Password
                  </Label>
                  <Input
                    id="confirmNewPassword"
                    type="password"
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-9 text-xs rounded-[6px]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="text-[11px] text-slate-500 hover:text-[#1E40AF] transition"
                  >
                    ← Change Email
                  </button>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowForgotPassword(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={forgotLoading}
                      className="text-xs bg-[#1E40AF] hover:bg-[#1E3A8A] text-white font-medium"
                    >
                      {forgotLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          Confirming...
                        </>
                      ) : (
                        "Confirm OTP & Set Password"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer Note */}
      <div className="py-2 text-center text-[11px] text-slate-400 font-normal">
        All India Council for Technical Education • Nelson Mandela Marg, Vasant Kunj, New Delhi-110070
      </div>
    </div>
  );
}
