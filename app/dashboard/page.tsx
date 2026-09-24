"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatETB } from "@/lib/utils";

type TodayStats = {
  totalCents: number;
  count: number;
  byPayment: Record<string, number>;
  lowStockCount: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<TodayStats>({
    totalCents: 0,
    count: 0,
    byPayment: {},
    lowStockCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: sales } = await supabase
        .from("sales")
        .select("total_cents, payment_type")
        .gte("sale_time", startOfDay.toISOString());
      const { data: low } = await supabase
        .from("inventory")
        .select("ingredient_id, stock_qty, reorder_level");

      const byPayment: Record<string, number> = {};
      let totalCents = 0;
      (sales || []).forEach((sale) => {
        const saleCents = Number(sale.total_cents);
        totalCents += saleCents;
        byPayment[sale.payment_type] = (byPayment[sale.payment_type] || 0) + saleCents;
      });

      setStats({
        totalCents,
        count: sales?.length || 0,
        byPayment,
        lowStockCount: (low || []).filter(
          (row) => Number(row.stock_qty) <= Number(row.reorder_level)
        ).length,
      });
      setLoading(false);
    }

    void load();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">Today’s Sales</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {formatETB(stats.totalCents)}
              </div>
              <div className="mt-1 text-xs text-slate-400">{stats.count} transactions</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">Low Stock Items</div>
              <div className={`mt-1 text-2xl font-bold ${stats.lowStockCount > 0 ? "text-red-600" : "text-green-600"}`}>
                {stats.lowStockCount}
              </div>
              <div className="mt-1 text-xs text-slate-400">need attention</div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-slate-700">Payment Mix (Today)</h2>
            {Object.keys(stats.byPayment).length === 0 ? (
              <p className="text-sm text-slate-500">No sales yet today</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.byPayment).map(([type, amountCents]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="capitalize text-slate-600">{type.replace("_", " ")}</span>
                    <span className="font-medium">{formatETB(amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
