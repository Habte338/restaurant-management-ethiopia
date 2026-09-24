"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type StaffRole = "owner" | "manager" | "waiter" | "cook" | "cashier";
export type CurrentUser = { id: string; full_name: string; email: string; role: StaffRole };

type AuthContextValue = {
  currentUser: CurrentUser | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadStaff(userId: string) {
      const { data } = await supabase.from("staff").select("id, full_name, email, role").eq("id", userId).eq("is_active", true).maybeSingle();
      if (mounted) setCurrentUser(data as CurrentUser | null);
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) return loadStaff(data.user.id);
      if (mounted) setIsLoading(false);
    }).finally(() => { if (mounted) setIsLoading(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) void loadStaff(session.user.id);
      else setCurrentUser(null);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    setCurrentUser(null);
  }

  return <AuthContext.Provider value={{ currentUser, isLoading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
