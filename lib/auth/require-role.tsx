"use client";

import { useAuth, type StaffRole } from "@/lib/auth/context";

export function RequireRole({ roles, children }: { roles: StaffRole[]; children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <p className="p-4 text-slate-500">Loading…</p>;
  if (!currentUser || !roles.includes(currentUser.role)) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">Access denied</p>;
  return <>{children}</>;
}
