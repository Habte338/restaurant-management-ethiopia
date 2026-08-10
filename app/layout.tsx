import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Restaurant POS — Ethiopia",
  description: "Fast sales & inventory for small restaurants",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <Nav />
        <main className="max-w-lg mx-auto px-3 pb-24 pt-4">{children}</main>
      </body>
    </html>
  );
}
