import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { AuthProvider } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: "Restaurant POS — Ethiopia",
  description: "Fast sales & inventory for small restaurants",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen bg-slate-50"><AuthProvider><Nav /><main className="mx-auto max-w-lg px-3 pb-24 pt-4">{children}</main></AuthProvider></body></html>;
}
