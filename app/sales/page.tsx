"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatETB, cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import { queueSale, getPendingSales, removePendingSale } from "@/lib/offline-queue";
import { Search, Plus, Minus, Check, WifiOff, Loader2 } from "lucide-react";

type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
  is_active: boolean;
};

type CartLine = {
  menu_item_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
};

const PAYMENT_TYPES = [
  { value: "cash", label: "Cash" },
  { value: "telebirr", label: "Telebirr" },
  { value: "cbe_birr", label: "CBE Birr" },
  { value: "other", label: "Other" },
] as const;

type PaymentType = (typeof PAYMENT_TYPES)[number]["value"];

export default function SalesPage() {
  const supabase = createClient();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("menu_items")
        .select("id, name, price_cents, is_active")
        .eq("is_active", true)
        .order("name");
      if (data) setMenu(data as MenuItem[]);
    }
    void load();
  }, [supabase]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => {
      setIsOnline(true);
      void syncPending();
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void getPendingSales().then((list) => setPendingCount(list.length));
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return menu;
    const q = search.toLowerCase();
    return menu.filter((item) => item.name.toLowerCase().includes(q));
  }, [menu, search]);

  const totalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.unit_price_cents * line.quantity, 0),
    [cart]
  );

  function addToCart(item: MenuItem) {
    setCart((previous) => {
      const existing = previous.find((line) => line.menu_item_id === item.id);
      if (existing) {
        return previous.map((line) =>
          line.menu_item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...previous, { menu_item_id: item.id, name: item.name, unit_price_cents: item.price_cents, quantity: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((previous) =>
      previous
        .map((line) => line.menu_item_id === id ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
        .filter((line) => line.quantity > 0)
    );
  }

  async function syncPending() {
    const pending = await getPendingSales();
    for (const sale of pending) {
      try {
        const { data, error } = await supabase.rpc("create_sale_with_stock_deduction", sale);
        if (!error && data?.success) await removePendingSale(sale.p_client_generated_id);
      } catch {
        // Keep failed records queued.
      }
    }
    setPendingCount((await getPendingSales()).length);
  }

  async function postSale() {
    if (cart.length === 0) return;
    setLoading(true);
    setMessage(null);
    const payload = {
      p_client_generated_id: uuidv4(),
      p_cashier_id: null,
      p_sale_time: new Date().toISOString(),
      p_total_cents: totalCents,
      p_payment_type: paymentType,
      p_ethiopian_date: null,
      p_items: cart.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
        unit_price_cents: line.unit_price_cents,
      })),
    };

    try {
      if (!navigator.onLine) {
        await queueSale(payload);
        setPendingCount((count) => count + 1);
        setMessage({ type: "success", text: "Sale queued (offline). Will sync when online." });
        setCart([]);
        return;
      }
      const { data, error } = await supabase.rpc("create_sale_with_stock_deduction", payload);
      if (error) setMessage({ type: "error", text: error.message });
      else if (data?.success) {
        setMessage({ type: "success", text: data.already_exists ? "Already recorded (idempotent)" : `Sale posted · ${formatETB(totalCents)}` });
        setCart([]);
      } else setMessage({ type: "error", text: "Unknown response from server" });
    } catch {
      await queueSale(payload);
      setPendingCount((count) => count + 1);
      setMessage({ type: "success", text: "Sale queued (connection lost). Will sync later." });
      setCart([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <h1 className="text-xl font-bold text-slate-800">Sales</h1>
        <div className="flex items-center gap-2">
          {!isOnline && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800"><WifiOff className="h-3.5 w-3.5" /> Offline</span>}
          {pendingCount > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{pendingCount} pending</span>}
        </div>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input type="search" placeholder="Search menu…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-base shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((item) => <button key={item.id} onClick={() => addToCart(item)} className="touch-target flex flex-col items-start rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm active:scale-[0.98] transition"><span className="font-medium text-slate-800">{item.name}</span><span className="mt-1 text-sm font-semibold text-brand-600">{formatETB(item.price_cents)}</span></button>)}
      </div>
      {cart.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"><h2 className="font-semibold text-slate-700">Current Order</h2>{cart.map((line) => <div key={line.menu_item_id} className="flex items-center justify-between gap-2"><div className="flex-1 min-w-0"><div className="font-medium truncate">{line.name}</div><div className="text-sm text-slate-500">{formatETB(line.unit_price_cents)}</div></div><div className="flex items-center gap-2"><button onClick={() => changeQty(line.menu_item_id, -1)} className="touch-target flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"><Minus className="h-4 w-4" /></button><span className="w-6 text-center font-semibold">{line.quantity}</span><button onClick={() => changeQty(line.menu_item_id, 1)} className="touch-target flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 active:bg-slate-200"><Plus className="h-4 w-4" /></button></div></div>)}<div className="grid grid-cols-4 gap-2 pt-2">{PAYMENT_TYPES.map((payment) => <button key={payment.value} onClick={() => setPaymentType(payment.value)} className={cn("rounded-lg py-2.5 text-sm font-medium transition", paymentType === payment.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700")}>{payment.label}</button>)}</div><div className="flex items-center justify-between pt-2 border-t"><div><div className="text-sm text-slate-500">Total</div><div className="text-2xl font-bold text-slate-900">{formatETB(totalCents)}</div></div><button onClick={postSale} disabled={loading} className="touch-target flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 font-semibold text-white shadow-md active:bg-brand-700 disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Post Sale</button></div></div>}
      {message && <div className={cn("rounded-xl px-4 py-3 text-sm font-medium", message.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200")}>{message.text}</div>}
    </div>
  );
}
