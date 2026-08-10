"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatETB } from "@/lib/utils";

type TodayStats = {
  totalSales: number;
  count: number;
  byPayment: Record<string, number>;
  lowStockCount: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<TodayStats>({
    totalSales: 0,
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
        .select("total_amount, payment_type")
        .gte("sale_time", startOfDay.toISOString());

      const { data: low } = await supabase
        .from("inventory")
        .select("ingredient_id, stock_qty, reorder_level");

      const byPayment: Record<string, number> = {};
      let total = 0;
      (sales || []).forEach((s) => {
        total += Number(s.total_amount);
        byPayment[s.payment_type] = (byPayment[s.payment_type] || 0) + Number(s.total_amount);
      });

      const lowCount = (low || []).filter(
        (r) => Number(r.stock_qty) <= Number(r.reorder_level)
      ).length;

      setStats({
        totalSales: total,
        count: sales?.length || 0,
        byPayment,
        lowStockCount: lowCount,
      });
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="text-sm text-slate-500">Today’s Sales</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {formatETB(stats.totalSales)}
              </div>
              <div className="text-xs text-slate-400 mt-1">{stats.count} transactions</div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <div className="text-sm text-slate-500">Low Stock Items</div>
              <div
                className={`mt-1 text-2xl font-bold ${
                  stats.lowStockCount > 0 ? "text-red-600" : "text-green-600"
                }`}
              >
                {stats.lowStockCount}
              </div>
              <div className="text-xs text-slate-400 mt-1">need attention</div>
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
            <h2 className="font-semibold text-slate-700 mb-3">Payment Mix (Today)</h2>
            {Object.keys(stats.byPayment).length === 0 ? (
              <p className="text-sm text-slate-500">No sales yet today</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.byPayment).map(([type, amount]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="capitalize text-slate-600">{type.replace("_", " ")}</span>
                    <span className="font-medium">{formatETB(amount)}</span>
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
