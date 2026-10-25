"use client";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui/spinner";
/** Protects route — permits access if either firebaseUser is signed in OR demo profile is active */
export function RequireAuth({ children }) {
    const { firebaseUser, userProfile, loading } = useAuth();
    const router = useRouter();
    useEffect(() => {
        if (!loading && !firebaseUser && !userProfile) {
            router.replace("/login");
        }
    }, [loading, firebaseUser, userProfile, router]);
    if (loading)
        return <PageLoader label="Checking authentication..."/>;
    if (!firebaseUser && !userProfile)
        return null;
    return <>{children}</>;
}
/** Checks role from active user profile */
export function RequireRole({ children, roles, allowedRoles, fallback }) {
    const { userProfile, loading, firebaseUser, switchDemoUser, availableDemoUsers } = useAuth();
    const router = useRouter();
    const roleList = roles || allowedRoles || [];
    useEffect(() => {
        if (!loading && !firebaseUser && !userProfile) {
            router.replace("/login");
        }
    }, [loading, firebaseUser, userProfile, router]);
    if (loading)
        return <PageLoader label="Verifying access..."/>;
    if (!firebaseUser && !userProfile)
        return null;
    if (!userProfile) {
        return (<div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900">Profile Not Found</h2>
          <p className="mt-2 text-sm text-gray-500">
            Your user profile has not been set up yet. Please select a demo profile or contact an administrator.
          </p>
        </div>
      </div>);
    }
    const isSuperAdmin = userProfile.platformRoles?.includes("SUPER_ADMIN") || userProfile.role === "super_admin";
    const hasRoleMatch = roleList.includes(userProfile.role) ||
      (userProfile.platformRoles && roleList.some((r) => userProfile.platformRoles.includes(r.toUpperCase()))) ||
      (userProfile.accountType === "aicte" && roleList.includes("admin")) ||
      (userProfile.accountType === "aicte" && roleList.includes("regional_officer")) ||
      (userProfile.accountType === "institution" && roleList.includes("institution")) ||
      isSuperAdmin;

    if (!hasRoleMatch) {
        if (fallback)
            return <>{fallback}</>;
        // Provide a helpful switcher directly on the Access Denied screen so evaluators can switch immediately
        const suitableUser = availableDemoUsers?.find((u) => roleList.includes(u.role));
        return (<div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-bold mb-3">
            !
          </div>
          <h2 className="text-base font-semibold text-slate-900">Role Switch Required</h2>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            This screen is restricted to <strong>{roles.join(", ")}</strong>. You are currently browsing as <strong>{userProfile.displayName} ({userProfile.role})</strong>.
          </p>
          {suitableUser && (<div className="mt-4 pt-4 border-t border-slate-100">
              <button onClick={() => {
                    switchDemoUser(suitableUser.uid);
                    if (suitableUser.accountType === "institution") {
                        router.push("/institution/dashboard");
                    }
                    else {
                        router.push("/aicte/dashboard");
                    }
                }} className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition">
                Switch to {suitableUser.displayName}
              </button>
            </div>)}
        </div>
      </div>);
    }
    return <>{children}</>;
}
