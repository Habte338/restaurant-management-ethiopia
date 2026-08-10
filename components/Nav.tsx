"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingCart, Package, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/sales", label: "Sales", icon: ShoppingCart },
  { href: "/inventory", label: "Stock", icon: Package },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white shadow-lg safe-area-pb">
      <div className="mx-auto flex max-w-lg justify-around">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition",
                active ? "text-brand-600" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
