"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatETB, cn } from "@/lib/utils";

type StockRow = {
  ingredient_id: string;
  stock_qty: number;
  unit: string;
  reorder_level: number;
  menu_items: { name: string } | null;
};

export default function InventoryPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("inventory")
        .select("ingredient_id, stock_qty, unit, reorder_level, menu_items(name)")
        .order("stock_qty");
      if (data) setRows(data as any);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Inventory</h1>

      {loading && <p className="text-slate-500">Loading…</p>}

      <div className="space-y-2">
        {rows.map((row) => {
          const isLow = Number(row.stock_qty) <= Number(row.reorder_level);
          return (
            <div
              key={row.ingredient_id}
              className={cn(
                "flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm",
                isLow ? "border-red-300 bg-red-50" : "border-slate-200"
              )}
            >
              <div>
                <div className="font-medium text-slate-800">
                  {row.menu_items?.name || "Unknown"}
                </div>
                <div className="text-sm text-slate-500">
                  Reorder at {row.reorder_level} {row.unit}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    "text-lg font-bold",
                    isLow ? "text-red-600" : "text-slate-800"
                  )}
                >
                  {Number(row.stock_qty).toFixed(row.unit === "pcs" ? 0 : 2)}
                </div>
                <div className="text-xs text-slate-500">{row.unit}</div>
              </div>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && !loading && (
        <p className="text-center text-slate-500 py-8">
          No inventory records. Run the seed SQL in Supabase.
        </p>
      )}
    </div>
  );
}
