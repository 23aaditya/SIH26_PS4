"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { DEMO_USERS } from "@/lib/mockData";
import { dataService } from "@/lib/dataService";

const AuthContext = createContext({
  firebaseUser: null,
  userProfile: null,
  loading: true,
  isDemoMode: true,
  isAicte: false,
  isInstitution: false,
  isSuperAdmin: false,
  activeWorkspace: null,
  dashboardModules: [],
  switchDemoUser: async () => {},
  switchWorkspace: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  hasRole: () => false,
  hasPermission: () => false,
  availableDemoUsers: DEMO_USERS,
});

export function useAuth() {
  return useContext(AuthContext);
}

const DEMO_USER_KEY = "aicte_active_demo_user_id";
const WORKSPACE_KEY = "aicte_active_workspace";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";

export function AuthProvider({ children }) {
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Synchronize active session from SQL server
  const fetchSession = useCallback(async (forcedWorkspace = null) => {
    const savedUid = typeof window !== "undefined" ? localStorage.getItem(DEMO_USER_KEY) : null;
    const savedWorkspace = forcedWorkspace || (typeof window !== "undefined" ? localStorage.getItem(WORKSPACE_KEY) : null);

    try {
      const headers = {};
      if (savedUid) {
        headers["x-user-id"] = savedUid;
      }
      if (savedWorkspace) {
        headers["x-committee-workspace"] = savedWorkspace;
      }

      const query = savedWorkspace ? `?committeeWorkspace=${encodeURIComponent(savedWorkspace)}` : "";
      const res = await fetch(`${API_BASE}/auth/me${query}`, {
        credentials: "include",
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUserProfile(data.user);
          setIsDemoMode(false);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Offline or network error
    }

    // Fallback: check remembered demo persona
    const defaultUser = DEMO_USERS.find((u) => u.uid === savedUid) || DEMO_USERS[0];
    setUserProfile(defaultUser);
    setIsDemoMode(true);
    setLoading(false);
  }, []);

  const switchWorkspace = useCallback(async (workspaceCode) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(WORKSPACE_KEY, workspaceCode);
    }
    await fetchSession(workspaceCode);
  }, [fetchSession]);

  const switchDemoUser = useCallback(async (uid) => {
    dataService.clearCache();
    try {
      const res = await fetch(`${API_BASE}/auth/switch-demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.user);
        if (typeof window !== "undefined") {
          localStorage.setItem(DEMO_USER_KEY, uid);
        }
        setIsDemoMode(true);
        dataService.sync();
        return;
      }
    } catch (e) {
      console.warn("Failed to switch demo user via API, using local fallback", e);
    }

    const localUser = DEMO_USERS.find((u) => u.uid === uid);
    if (localUser) {
      if (typeof window !== "undefined") {
        localStorage.setItem(DEMO_USER_KEY, uid);
      }
      setUserProfile(localUser);
      setIsDemoMode(true);
    }
  }, []);

  const signOut = useCallback(async () => {
    dataService.clearCache();
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Ignore
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem(DEMO_USER_KEY);
      localStorage.removeItem(WORKSPACE_KEY);
    }
    setUserProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const hasRole = useCallback((roles) => {
    if (!userProfile) return false;
    if (userProfile.platformRoles && Array.isArray(userProfile.platformRoles)) {
      if (userProfile.platformRoles.includes("SUPER_ADMIN")) return true;
      return roles.some((r) => userProfile.platformRoles.includes(r) || userProfile.platformRoles.includes(r.toUpperCase()));
    }
    return roles.includes(userProfile.role);
  }, [userProfile]);

  const hasPermission = useCallback((permCode) => {
    if (!userProfile) return false;
    if (userProfile.platformRoles?.includes("SUPER_ADMIN")) return true;
    return userProfile.permissions?.includes(permCode) || false;
  }, [userProfile]);

  const firebaseUser = userProfile
    ? { uid: userProfile.uid || userProfile.employeeCode, email: userProfile.email || null }
    : null;

  const isAicte = userProfile?.accountType === "aicte" || Boolean(userProfile?.employeeCode);
  const isInstitution = userProfile?.accountType === "institution";
  const isSuperAdmin = userProfile?.platformRoles?.includes("SUPER_ADMIN") || userProfile?.role === "super_admin";

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        loading,
        isDemoMode,
        isAicte,
        isInstitution,
        isSuperAdmin,
        activeWorkspace: userProfile?.activeWorkspace || null,
        dashboardModules: userProfile?.dashboardModules || [],
        switchDemoUser,
        switchWorkspace,
        signOut,
        refreshProfile,
        hasRole,
        hasPermission,
        availableDemoUsers: DEMO_USERS,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
