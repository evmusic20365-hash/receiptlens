"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import MascotLottie from "@/components/MascotLottie";

// ── Types ─────────────────────────────────────────────────────────────────────
interface WatchlistItem { id: string; item_name: string; target_price: number | null; notifications_enabled: boolean; }
interface PriceRow { item_name: string; price: number; store: string | null; scanned_at: string; }
interface SearchResult { item_name: string; price: number; store: string | null; date: string; }

type SubTab = "watchlist" | "list" | "search" | "barcode";

const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.045)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 0 0 1px rgba(139,92,246,0.18), 0 8px 32px rgba(0,0,0,0.35)",
};

const cardV = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 22, stiffness: 220 } },
};

// ── Watchlist sub-tab ─────────────────────────────────────────────────────────
function WatchlistPane() {
  const [items,   setItems]   = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [newName, setNewName] = useState("");
  const [newTarget, setNewTarget] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("watchlist").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as WatchlistItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    if (!newName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("watchlist")
      .insert({ user_id: user.id, item_name: newName.trim(), target_price: newTarget ? parseFloat(newTarget) : null })
      .select()
      .single();
    if (data) setItems(prev => [data as WatchlistItem, ...prev]);
    setNewName(""); setNewTarget(""); setAdding(false);
  };

  const remove = async (id: string) => {
    await supabase.from("watchlist").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggle = async (id: string, current: boolean) => {
    await supabase.from("watchlist").update({ notifications_enabled: !current }).eq("id", id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, notifications_enabled: !current } : i));
  };

  if (loading) return <div className="flex-1 flex justify-center items-center pt-8"><div className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Watchlist · {items.length}</p>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setAdding(v => !v)}
          className="text-[10px] font-bold text-violet-400 uppercase tracking-wider px-2 py-1 rounded-lg"
          style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
          {adding ? "Cancel" : "+ Add"}
        </motion.button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div key="add-form"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl overflow-hidden" style={GLASS}>
            <div className="p-4 space-y-2.5">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Item name (e.g. Eggs, Milk)"
                className="w-full rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-zinc-600 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <input value={newTarget} onChange={e => setNewTarget(e.target.value)}
                type="number" step="0.01" placeholder="Target price (optional)"
                className="w-full rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-zinc-600 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <motion.button whileTap={{ scale: 0.97 }} onClick={addItem} disabled={!newName.trim()}
                className="w-full py-2.5 rounded-xl font-bold text-[12px] tracking-widest uppercase text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
                Add to Watchlist
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 && !adding && (
        <div className="text-center py-8">
          <MascotLottie state="thinking" style={{ width: 90, height: 90, margin: "0 auto 8px" }} />
          <p className="text-zinc-600 text-sm">No items being tracked yet.</p>
          <p className="text-zinc-700 text-xs mt-1">Add items to get notified of price drops.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map(item => (
          <motion.div key={item.id} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}>
            <Card className="rounded-xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{item.item_name}</p>
                  {item.target_price != null && (
                    <p className="text-[10px] text-zinc-600">Alert below ${item.target_price.toFixed(2)}</p>
                  )}
                </div>
                <button onClick={() => toggle(item.id, item.notifications_enabled)}
                  className={`w-8 h-4.5 rounded-full relative flex-shrink-0 transition-colors ${item.notifications_enabled ? "bg-violet-500" : "bg-zinc-700"}`}
                  style={{ width: 36, height: 20 }}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${item.notifications_enabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => remove(item.id)}
                  className="text-zinc-700 hover:text-red-400 transition-colors p-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </motion.button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Smart list sub-tab ────────────────────────────────────────────────────────
function SmartListPane() {
  const [items,   setItems]   = useState<Array<{ name: string; avgPrice: number; cheapestStore: string | null; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("price_history")
      .select("item_name, price, store")
      .order("scanned_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const rows = (data ?? []) as PriceRow[];
        const grouped: Record<string, Array<{ price: number; store: string | null }>> = {};
        for (const r of rows) {
          const key = r.item_name.toLowerCase().trim();
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push({ price: r.price, store: r.store });
        }
        const list = Object.entries(grouped)
          .filter(([, v]) => v.length >= 1)
          .map(([name, entries]) => {
            const avgPrice = entries.reduce((s, e) => s + e.price, 0) / entries.length;
            const byStore: Record<string, number[]> = {};
            for (const e of entries) {
              if (e.store) { if (!byStore[e.store]) byStore[e.store] = []; byStore[e.store].push(e.price); }
            }
            const cheapestStore = Object.entries(byStore)
              .map(([store, prices]) => ({ store, avg: prices.reduce((a, b) => a + b, 0) / prices.length }))
              .sort((a, b) => a.avg - b.avg)[0]?.store ?? null;
            return { name: entries.length > 0 ? name : name, avgPrice, cheapestStore, count: entries.length };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);
        setItems(list);
        setLoading(false);
      });
  }, []);

  const toggleCheck = (name: string) => {
    setChecked(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });
  };

  if (loading) return <div className="flex justify-center pt-8"><div className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" /></div>;

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <MascotLottie state="thinking" style={{ width: 90, height: 90, margin: "0 auto 8px" }} />
        <p className="text-zinc-600 text-sm">No shopping history yet.</p>
        <p className="text-zinc-700 text-xs mt-1">Scan receipts to build your smart list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Your Regulars</p>
        {checked.size > 0 && (
          <button onClick={() => setChecked(new Set())}
            className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">
            Clear {checked.size}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <motion.div key={item.name} whileTap={{ scale: 0.98 }}>
            <Card className="rounded-xl shadow-none text-white overflow-hidden" style={GLASS}>
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => toggleCheck(item.name)}>
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${checked.has(item.name) ? "bg-violet-500 border-violet-500" : "border-zinc-600"}`}>
                  {checked.has(item.name) && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" className="w-3 h-3">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold truncate capitalize transition-colors ${checked.has(item.name) ? "text-zinc-500 line-through" : "text-white"}`}>
                    {item.name}
                  </p>
                  {item.cheapestStore && (
                    <p className="text-[10px] text-zinc-600">Cheapest at {item.cheapestStore}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[12px] font-bold text-violet-400 tabular-nums">${item.avgPrice.toFixed(2)}</p>
                  <p className="text-[9px] text-zinc-700">avg</p>
                </div>
              </button>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Search sub-tab ────────────────────────────────────────────────────────────
function SearchPane() {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("price_history")
      .select("item_name, price, store, scanned_at")
      .ilike("item_name", `%${q}%`)
      .order("scanned_at", { ascending: false })
      .limit(30);
    setResults(
      (data ?? []).map((r: { item_name: string; price: number; store: string | null; scanned_at: string }) => ({
        item_name: r.item_name,
        price: r.price,
        store: r.store,
        date: r.scanned_at,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 text-zinc-600 absolute left-3 top-1/2 -translate-y-1/2">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search receipts… (milk, eggs, Target)"
          className="w-full rounded-xl pl-9 pr-4 py-2.5 text-[13px] text-white placeholder-zinc-600 outline-none"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        />
      </div>

      {loading && <div className="flex justify-center pt-4"><div className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" /></div>}

      {!loading && results.length === 0 && query && (
        <div className="text-center py-6">
          <p className="text-zinc-600 text-sm">No matches for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {!loading && results.length === 0 && !query && (
        <div className="text-center py-6">
          <p className="text-zinc-600 text-sm">Search your purchase history by item name, store, or date.</p>
        </div>
      )}

      <div className="space-y-2">
        {results.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Card className="rounded-xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="px-4 py-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{r.item_name}</p>
                  <p className="text-[10px] text-zinc-600">
                    {r.store && `${r.store} · `}
                    {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                <p className="text-[14px] font-black text-violet-400 tabular-nums">${r.price.toFixed(2)}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Barcode scanner sub-tab ───────────────────────────────────────────────────
function BarcodePane() {
  const [scanning,  setScanning]  = useState(false);
  const [barcode,   setBarcode]   = useState<string | null>(null);
  const [product,   setProduct]   = useState<string | null>(null);
  const [history,   setHistory]   = useState<SearchResult[]>([]);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const stopScan = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    setBarcode(null); setProduct(null); setHistory([]); setLookupErr(null);
    setScanning(true);
    await new Promise(r => setTimeout(r, 100)); // let video element mount
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) { setScanning(false); return; }

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        async (result, err) => {
          if (result) {
            const code = result.getText();
            setBarcode(code);
            controls.stop();
            controlsRef.current = null;
            setScanning(false);
            setLoading(true);
            try {
              // Open Food Facts lookup
              const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
              const json = await res.json();
              const name = json?.product?.product_name || json?.product?.generic_name || null;
              setProduct(name);

              // Price history lookup
              const searchTerm = name || code;
              const { data } = await supabase
                .from("price_history")
                .select("item_name, price, store, scanned_at")
                .ilike("item_name", `%${searchTerm.split(" ").slice(0, 3).join("%")}%`)
                .order("scanned_at", { ascending: false })
                .limit(10);
              setHistory(
                (data ?? []).map((r: { item_name: string; price: number; store: string | null; scanned_at: string }) => ({
                  item_name: r.item_name, price: r.price, store: r.store, date: r.scanned_at,
                }))
              );
            } catch {
              setLookupErr("Couldn't look up that barcode. Try searching manually.");
            }
            setLoading(false);
          }
          if (err && !(err.constructor.name === "NotFoundException")) {
            console.warn("Barcode reader:", err);
          }
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      console.error("Scanner init error:", err);
      setLookupErr("Camera unavailable. Make sure you've granted camera permission.");
      setScanning(false);
    }
  }, []);

  useEffect(() => () => controlsRef.current?.stop(), []);

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Barcode Scanner</p>

      {!scanning && !barcode && (
        <motion.button whileTap={{ scale: 0.97 }} onClick={startScan}
          className="w-full py-12 rounded-2xl font-black text-[13px] tracking-widest uppercase text-white flex flex-col items-center gap-3"
          style={{ background: "rgba(168,85,247,0.08)", border: "1px dashed rgba(168,85,247,0.35)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-10 h-10 text-violet-400">
            <rect x="2" y="2" width="7" height="7" rx="1"/><rect x="15" y="2" width="7" height="7" rx="1"/>
            <rect x="2" y="15" width="7" height="7" rx="1"/>
            <path d="M15 15h2v2h-2zM19 15h2v2h-2zM15 19h2v2h-2zM19 19h2v2h-2z"/>
          </svg>
          <span className="text-violet-400">Tap to Scan Barcode</span>
          <span className="text-zinc-700 text-[10px] font-normal normal-case tracking-normal">Compares price to your history</span>
        </motion.button>
      )}

      {scanning && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-h-[260px]">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 border-2 border-violet-500/40 rounded-2xl pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 border-2 border-violet-400 rounded-xl" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.97 }} onClick={stopScan}
            className="w-full py-3 rounded-xl font-bold text-[12px] tracking-widest uppercase text-red-400"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            Stop Scanning
          </motion.button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-3 py-6">
          <div className="w-5 h-5 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Looking up barcode…</p>
        </div>
      )}

      {lookupErr && (
        <div className="rounded-xl p-3 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-sm text-red-400">{lookupErr}</p>
        </div>
      )}

      {barcode && !loading && (
        <div className="space-y-2">
          <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
            <div className="p-4">
              <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-1">Scanned</p>
              <p className="text-lg font-black text-white">{product ?? "Unknown product"}</p>
              <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{barcode}</p>
            </div>
          </Card>

          {history.length > 0 && (
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4">
                <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-2">Your Price History</p>
                <div className="space-y-2">
                  {history.map((r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div>
                        <p className="text-[12px] text-zinc-300 truncate max-w-[180px]">{r.item_name}</p>
                        <p className="text-[10px] text-zinc-600">{r.store} · {new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                      <p className="text-[14px] font-black text-violet-400 tabular-nums">${r.price.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {history.length === 0 && !lookupErr && (
            <div className="text-center py-4">
              <p className="text-zinc-600 text-sm">No price history found for this item yet.</p>
              <p className="text-zinc-700 text-xs mt-1">Buy it and scan the receipt to track it.</p>
            </div>
          )}

          <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setBarcode(null); setProduct(null); setHistory([]); }}
            className="w-full py-3 rounded-xl font-bold text-[12px] tracking-widest uppercase text-violet-400"
            style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}>
            Scan Another
          </motion.button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ShoppingTab() {
  const [tab, setTab] = useState<SubTab>("watchlist");

  const SUB_TABS: Array<{ key: SubTab; label: string; emoji: string }> = [
    { key: "watchlist", label: "Watch",   emoji: "👁" },
    { key: "list",      label: "List",    emoji: "📋" },
    { key: "search",    label: "Search",  emoji: "🔍" },
    { key: "barcode",   label: "Scan",    emoji: "📷" },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-nav */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        <p className="text-[10px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-2">Shopping Tools</p>
        <div className="flex gap-1.5">
          {SUB_TABS.map(t => (
            <motion.button key={t.key} whileTap={{ scale: 0.92 }} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-xl text-[10px] font-bold tracking-wide transition-colors flex flex-col items-center gap-0.5`}
              style={tab === t.key
                ? { background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.35)", color: "#a855f7" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280" }
              }>
              <span className="text-base leading-none">{t.emoji}</span>
              <span className="uppercase">{t.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pb-24 pt-1">
          <AnimatePresence mode="wait">
            <motion.div key={tab}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}>
              {tab === "watchlist" && <WatchlistPane />}
              {tab === "list"      && <SmartListPane />}
              {tab === "search"    && <SearchPane />}
              {tab === "barcode"   && <BarcodePane />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
