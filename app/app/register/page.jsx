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
import { ShieldCheck, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";

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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#f8fafc] p-4 sm:p-6 text-[#0a2540]">
      {/* Top Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-start pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0a2540] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to AICTE Portal Home
        </Link>
      </div>

      <div className="w-full max-w-md mx-auto my-auto">
        <Card className="shadow-sm border border-slate-200 bg-white rounded-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs">
              <ShieldCheck className="h-5 w-5 text-blue-400" />
            </div>
            <CardTitle className="text-lg font-bold text-slate-900">
              Register Technical Institution
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Create institutional credentials for AICTE Approval Automation System
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-3.5">
              {error && (
                <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="displayName" className="text-xs font-medium text-slate-700">
                  Full Name / Principal / Dean
                </Label>
                <Input
                  id="displayName"
                  placeholder="e.g. Dr. S. K. Sharma"
                  autoComplete="name"
                  className="h-8 text-xs rounded-lg"
                  {...register("displayName")}
                />
                {errors.displayName && (
                  <p className="text-[11px] text-rose-600">{errors.displayName.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">
                  Institutional Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="principal@institution.edu"
                  autoComplete="email"
                  className="h-8 text-xs rounded-lg"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-[11px] text-rose-600">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs font-medium text-slate-700">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    className="h-8 text-xs pr-8 rounded-lg"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-[11px] text-rose-600">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirmPassword" className="text-xs font-medium text-slate-700">
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  className="h-8 text-xs rounded-lg"
                  {...register("confirmPassword")}
                />
                {errors.confirmPassword && (
                  <p className="text-[11px] text-rose-600">{errors.confirmPassword.message}</p>
                )}
              </div>

              <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600">
                Registration assigns the <strong>Institution Role</strong>. AICTE official roles are designated by Central Bureau administrators.
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    Creating account...
                  </>
                ) : (
                  "Create Institution Account"
                )}
              </Button>

              <p className="text-xs text-slate-500 text-center">
                Already registered?{" "}
                <Link href="/login" className="text-blue-600 hover:underline font-semibold">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>

      <div className="py-2 text-center text-[11px] text-slate-400">
        All India Council for Technical Education • Nelson Mandela Marg, Vasant Kunj, New Delhi-110070
      </div>
    </div>
  );
}
