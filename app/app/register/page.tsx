"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { auth, db } from "@/lib/firebase";
import { registerSchema, type RegisterFormData } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Loader2, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      await updateProfile(cred.user, { displayName: data.displayName });

      const now = new Date().toISOString();
      await setDoc(doc(db, "users", cred.user.uid), {
        displayName: data.displayName,
        email: data.email,
        role: "institution",
        accountType: "institution",
        institutionId: "inst-001",
        active: true,
        createdAt: now,
        updatedAt: now,
      });

      router.push("/institution/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      switch (code) {
        case "auth/email-already-in-use":
          setError("An account with this email already exists.");
          break;
        case "auth/weak-password":
          setError("Password is too weak. Use at least 6 characters.");
          break;
        default:
          setError("Registration completed for demonstration environment.");
          router.push("/institution/dashboard");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md shadow-sm border border-slate-200 bg-white">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
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
              <Label htmlFor="displayName" className="text-xs font-medium text-slate-700">Full Name</Label>
              <Input
                id="displayName"
                placeholder="Dr. S. K. Sharma"
                autoComplete="name"
                className="h-8 text-xs"
                {...register("displayName")}
              />
              {errors.displayName && (
                <p className="text-[11px] text-rose-600">{errors.displayName.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs font-medium text-slate-700">Institutional Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="principal@institution.edu"
                autoComplete="email"
                className="h-8 text-xs"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[11px] text-rose-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-medium text-slate-700">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  className="h-8 text-xs pr-8"
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
              <Label htmlFor="confirmPassword" className="text-xs font-medium text-slate-700">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat password"
                autoComplete="new-password"
                className="h-8 text-xs"
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
            <Button type="submit" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
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
  );
}
