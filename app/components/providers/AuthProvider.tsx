"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, User, signOut as firebaseSignOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile, UserRole, AccountType } from "@/lib/types";
import { DEMO_USERS } from "@/lib/mockData";

interface AuthContextValue {
  firebaseUser: User | null | undefined;
  userProfile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  isAicte: boolean;
  isInstitution: boolean;
  isAdmin: boolean;
  isDemoMode: boolean;
  switchDemoUser: (uid: string) => void;
  availableDemoUsers: typeof DEMO_USERS;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: undefined,
  userProfile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  hasRole: () => false,
  isAicte: false,
  isInstitution: false,
  isAdmin: false,
  isDemoMode: false,
  switchDemoUser: () => {},
  availableDemoUsers: DEMO_USERS,
});

export function useAuth() {
  return useContext(AuthContext);
}

const DEMO_USER_KEY = "aicte_active_demo_user_id";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null | undefined>(undefined);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Load active demo user if saved
  const loadDemoUser = useCallback((uid?: string): UserProfile => {
    const targetUid = uid || (typeof window !== "undefined" ? localStorage.getItem(DEMO_USER_KEY) : null);
    const found = DEMO_USERS.find((u) => u.uid === targetUid) || DEMO_USERS[0];
    return found;
  }, []);

  const switchDemoUser = useCallback((uid: string) => {
    const user = DEMO_USERS.find((u) => u.uid === uid);
    if (user) {
      if (typeof window !== "undefined") {
        localStorage.setItem(DEMO_USER_KEY, uid);
      }
      setUserProfile(user);
      setIsDemoMode(true);
    }
  }, []);

  useEffect(() => {
    // If running in development or offline with demo configuration, provide demo user default
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) {
            setUserProfile({ uid: user.uid, ...snap.data() } as UserProfile);
            setIsDemoMode(false);
          } else {
            // Fallback to demo profile matching email or default
            const demo = DEMO_USERS.find((u) => u.email === user.email) || loadDemoUser();
            setUserProfile(demo);
            setIsDemoMode(true);
          }
        } catch {
          const demo = loadDemoUser();
          setUserProfile(demo);
          setIsDemoMode(true);
        }
      } else {
        // In local prototype mode, if no active firebase user, initialize with remembered or default demo user
        const demo = loadDemoUser();
        setUserProfile(demo);
        setIsDemoMode(true);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [loadDemoUser]);

  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore auth signOut failure if offline
    }
    // Switch to default demo or clear
    if (typeof window !== "undefined") {
      localStorage.removeItem(DEMO_USER_KEY);
    }
    setUserProfile(null);
    setFirebaseUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (firebaseUser) {
      try {
        const snap = await getDoc(doc(db, "users", firebaseUser.uid));
        if (snap.exists()) {
          setUserProfile({ uid: firebaseUser.uid, ...snap.data() } as UserProfile);
        }
      } catch (err) {
        console.error("Failed to refresh profile:", err);
      }
    }
  }, [firebaseUser]);

  const hasRole = useCallback(
    (role: UserRole) => userProfile?.role === role,
    [userProfile]
  );

  const accountType: AccountType | null = userProfile?.accountType ?? null;

  const value: AuthContextValue = {
    firebaseUser,
    userProfile,
    loading,
    signOut,
    refreshProfile,
    hasRole,
    isAicte: accountType === "aicte",
    isInstitution: accountType === "institution",
    isAdmin: userProfile?.role === "admin",
    isDemoMode,
    switchDemoUser,
    availableDemoUsers: DEMO_USERS,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
