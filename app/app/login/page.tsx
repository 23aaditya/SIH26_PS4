"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { auth, db } from "@/lib/firebase";
import { loginSchema, type LoginFormData } from "@/lib/schemas";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, Eye, EyeOff, UserCheck, ArrowRight, ArrowLeft } from "lucide-react";
import { DEMO_USERS } from "@/lib/mockData";
import { ROLE_LABELS, type UserProfile } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const { switchDemoUser } = useAuth();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "principal@pict.edu",
      password: "password123",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, data.email, data.password);
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      if (userDoc.exists()) {
        const profile = userDoc.data() as UserProfile;
        if (profile.accountType === "institution") {
          router.push("/institution/dashboard");
        } else {
          router.push("/aicte/dashboard");
        }
      } else {
        router.push("/institution/dashboard");
      }
    } catch {
      const demoUser = DEMO_USERS.find((u) => u.email === data.email);
      if (demoUser) {
        switchDemoUser(demoUser.uid);
        if (demoUser.accountType === "institution") {
          router.push("/institution/dashboard");
        } else {
          router.push("/aicte/dashboard");
        }
      } else {
        setError("Invalid credentials. Please click one of the quick demo personas on the right.");
      }
    }
  };

  const handleQuickLogin = (demo: (typeof DEMO_USERS)[0]) => {
    switchDemoUser(demo.uid);
    if (demo.accountType === "institution") {
      router.push("/institution/dashboard");
    } else {
      router.push("/aicte/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#fcfcfd] p-4 sm:p-6 text-[#0a2540]">
      {/* Top Bar with Home Link */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0a2540] transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Main Landing Page
        </Link>
        <span className="text-[11px] font-mono text-slate-400">SIH26262 Secure Auth</span>
      </div>

      <div className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch my-auto">
        {/* Left: Login Form */}
        <div className="stripe-card-glow rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0a2540] text-white shadow-xs">
                <ShieldCheck className="h-5 w-5 text-[#00d4ff]" />
              </div>
              <div>
                <h1 className="text-xs font-bold text-[#0a2540] tracking-tight uppercase">
                  AICTE Central Gateway
                </h1>
                <p className="text-[10px] text-slate-500 font-medium">Approval Process Portal</p>
              </div>
            </div>

            <h2 className="text-xl font-bold text-[#0a2540] tracking-tight">
              Sign In to Your Portal
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your credentials or click a pre-seeded persona
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              {error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">
                  Registered Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="principal@pict.edu"
                  autoComplete="email"
                  className="h-9 text-xs rounded-lg border-slate-200 focus:border-[#635bff] focus:ring-1 focus:ring-[#635bff]"
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
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="h-9 text-xs pr-8 rounded-lg border-slate-200 focus:border-[#635bff] focus:ring-1 focus:ring-[#635bff]"
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
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-9 text-xs bg-[#0a2540] hover:bg-[#1a3b5c] text-white rounded-lg font-semibold shadow-xs hover:-translate-y-0.5 transition duration-150"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Authenticating...
                    </>
                  ) : (
                    "Sign In to Account →"
                  )}
                </Button>
              </div>
            </form>
          </div>

          <p className="mt-6 text-xs text-slate-500 text-center">
            New technical institute?{" "}
            <Link href="/register" className="text-[#635bff] hover:underline font-semibold">
              Register Institution
            </Link>
          </p>
        </div>

        {/* Right: Quick Demo Persona Switcher (Stripe Style) */}
        <div className="stripe-card-glow rounded-2xl border border-slate-200/90 bg-[#fafafa] p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
              <span className="text-xs font-bold text-[#0a2540] uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-[#635bff]" />
                1-Click Quick Demo Personas
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Evaluation Active
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed font-normal">
              Click any regulatory persona to immediately log in and explore their dashboard:
            </p>

            <div className="mt-4 space-y-2.5">
              {DEMO_USERS.slice(0, 5).map((demo) => (
                <button
                  key={demo.uid}
                  type="button"
                  onClick={() => handleQuickLogin(demo)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200/90 bg-white hover:border-[#635bff] hover:shadow-xs transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0a2540] group-hover:text-[#635bff]">
                      {demo.displayName}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#635bff] transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">
                      {ROLE_LABELS[demo.role]}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[10px] text-slate-400">{demo.email}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-200/80 text-[11px] text-slate-400 text-center font-mono">
            AICTE Regulatory Automation • SIH26262 Prototype
          </div>
        </div>
      </div>

      <div className="py-2 text-center text-[11px] text-slate-400">
        All India Council for Technical Education, New Delhi
      </div>
    </div>
  );
}
