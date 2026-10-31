"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema } from "@/lib/schemas";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";
import { AicteLogo } from "@/components/ui/AicteLogo";

export default function RegisterPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data) => {
    setError("");
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Registration failed");
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("aicte_active_demo_user_id", json.user.uid || json.user.id);
        localStorage.setItem("aicte_institute_email", json.user.email);
        localStorage.setItem("aicte_user_profile", JSON.stringify(json.user));
      }
      await refreshProfile();
      router.push("/institution/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setError(msg);
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
      {/* Top Header */}
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
        <Card className="rounded-xl border border-slate-200/90 bg-white shadow-sm p-6 sm:p-8">
          <CardHeader className="p-0 text-center pb-5">
            <div className="mx-auto mb-3 flex justify-center">
              <AicteLogo variant="mark" size={50} />
            </div>
            <CardTitle className="text-2xl font-bold text-[#0F172A] tracking-tight">
              Register Technical Institution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 font-normal mt-1 leading-relaxed">
              Create institutional credentials for statutory approval processing
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="p-0 space-y-3.5">
              {error && (
                <div className="rounded-[6px] bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="displayName" className="text-xs font-normal text-[#061B31]">
                  Principal / Dean Full Name
                </Label>
                <Input
                  id="displayName"
                  placeholder="e.g. Dr. S. K. Sharma"
                  autoComplete="name"
                  className="h-10 text-xs rounded-[6px]"
                  {...register("displayName")}
                />
                {errors.displayName && (
                  <p className="text-[11px] text-rose-600">{errors.displayName.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-normal text-[#061B31]">
                  Registered Institutional Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="principal@institution.edu"
                  autoComplete="email"
                  className="h-10 text-xs rounded-[6px]"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-[11px] text-rose-600">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs font-normal text-[#061B31]">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    className="h-10 text-xs pr-8 rounded-[6px]"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#061B31] transition"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-rose-600">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirmPassword" className="text-xs font-normal text-[#061B31]">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  className="h-10 text-xs rounded-[6px]"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-[11px] text-rose-600">{errors.confirmPassword.message}</p>
                )}
              </div>

              <div className="rounded-[6px] bg-[#F8FAFD] border border-[#E5EDF5] p-2.5 text-[11px] text-[#061B31]/70 leading-relaxed">
                Registration provisions an <strong>Institution User Profile</strong>. Official bureau credentials require AICTE Central Administration authorization.
              </div>
            </CardContent>

            <CardFooter className="p-0 flex flex-col gap-3 pt-5">
              <Button
                type="submit"
                className="w-full h-10 text-xs sm:text-sm font-semibold bg-[#1E40AF] hover:bg-[#1E3A8A] text-white rounded-[6px] shadow-xs transition-all duration-150 flex items-center justify-center gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Creating account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Institution Account</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>

              <p className="text-xs text-slate-500 text-center font-normal">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="text-[#1E40AF] hover:text-[#1E3A8A] transition font-semibold"
                >
                  Sign in →
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>

      <div className="py-2 text-center text-[11px] text-slate-400 font-normal">
        All India Council for Technical Education • Nelson Mandela Marg, Vasant Kunj, New Delhi-110070
      </div>
    </div>
  );
}
