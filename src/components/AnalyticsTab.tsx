"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import MascotLottie from "@/components/MascotLottie";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AnalysisItem { name: string; paid: number; cheaperStore?: string; cheaperPrice?: number; }
interface AnalysisCategory { emoji: string; name: string; rating: "green" | "yellow" | "red"; items: AnalysisItem[]; }
interface DbAnalysis { score: number; leaks: AnalysisCategory[]; total_found: number; }
interface DbReceipt { id: string; created_at: string; store_name: string | null; total: number | null; analyses: DbAnalysis[]; }
interface PriceHistoryRow { item_name: string; price: number; store: string | null; category: string | null; scanned_at: string; }

// ── Category normalization ────────────────────────────────────────────────────
function normalizeCat(name: string): string {
  const l = name.toLowerCase();
  if (/groceri|produce|food|beverage|drink|dairy|meat|bakery|snack|fresh|fruit|veget|pasta|rice|bread/.test(l)) return "Groceries";
  if (/groom|beauty|personal care|hygiene|cosmetic|skincare|hair|shampoo|soap|deodorant|toothpaste/.test(l)) return "Beauty";
  if (/household|clean|laundry|paper|home|furni|towel|trash|detergent/.test(l)) return "Household";
  if (/cloth|apparel|fashion|wear|shirt|pants|shoe|accessor|jacket|hat/.test(l)) return "Clothing";
  if (/electron|tech|gadget|computer|phone|device|cable|battery/.test(l)) return "Electronics";
  if (/restaurant|dining|takeout|fast food|coffee|café|cafe/.test(l)) return "Dining";
  if (/pet|animal|vet|dog|cat/.test(l)) return "Pet";
  if (/health|medicine|pharma|vitamin|supplement|pill|pharmacy/.test(l)) return "Health";
  return "Other";
}

const CAT_META: Record<string, { emoji: string; color: string }> = {
  Groceries:   { emoji: "🥦", color: "#22c55e" },
  Beauty:      { emoji: "🧴", color: "#ec4899" },
  Household:   { emoji: "🏠", color: "#60a5fa" },
  Clothing:    { emoji: "👗", color: "#f59e0b" },
  Electronics: { emoji: "💻", color: "#818cf8" },
  Dining:      { emoji: "🍔", color: "#fb923c" },
  Pet:         { emoji: "🐾", color: "#a78bfa" },
  Health:      { emoji: "💊", color: "#34d399" },
  Other:       { emoji: "📦", color: "#6b7280" },
};

// ── SVG Donut Chart ───────────────────────────────────────────────────────────
function DonutChart({ segments, total }: {
  segments: Array<{ label: string; value: number; color: string; emoji: string }>;
  total: number;
}) {
  const cx = 90, cy = 90, R = 72, r = 44;
  let angle = -Math.PI / 2;

  const arcs = segments.filter(s => s.value > 0).map(s => {
    const sweep = (s.value / total) * 2 * Math.PI;
    const end   = angle + sweep;
    const lg    = sweep > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(angle);  const y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(end);    const y2 = cy + R * Math.sin(end);
    const xi1= cx + r * Math.cos(angle);  const yi1= cy + r * Math.sin(angle);
    const xi2= cx + r * Math.cos(end);    const yi2= cy + r * Math.sin(end);
    const d = `M${x1},${y1} A${R},${R},0,${lg},1,${x2},${y2} L${xi2},${yi2} A${r},${r},0,${lg},0,${xi1},${yi1}Z`;
    angle = end;
    return { ...s, d };
  });

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {arcs.map((s, i) => (
        <path key={i} d={s.d} fill={s.color} opacity="0.88" />
      ))}
      <text x="90" y="83" textAnchor="middle" fill="white" fontSize="20" fontWeight="900">${total.toFixed(0)}</text>
      <text x="90" y="100" textAnchor="middle" fill="#6b7280" fontSize="8" fontWeight="700" letterSpacing="1.5">TOTAL SPENT</text>
    </svg>
  );
}

// ── SVG Line / Area Chart ─────────────────────────────────────────────────────
function AreaChart({ data }: { data: Array<{ label: string; amount: number }> }) {
  const W = 310, H = 90, PL = 38, PT = 8, PB = 18, PR = 8;
  const pW = W - PL - PR;
  const pH = H - PT - PB;
  const maxV = Math.max(...data.map(d => d.amount), 1);

  const pts = data.map((d, i) => ({
    x: PL + (i / Math.max(data.length - 1, 1)) * pW,
    y: PT + (1 - d.amount / maxV) * pH,
    ...d,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${PT + pH} L${pts[0].x},${PT + pH}Z`;

  // Show every ~5th label
  const step = Math.max(1, Math.floor(data.length / 6));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.33, 0.66, 1].map((f, i) => (
        <line key={i} x1={PL} y1={PT + f * pH} x2={W - PR} y2={PT + f * pH}
          stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      <text x={PL - 4} y={PT + pH} textAnchor="end" fill="#4b5563" fontSize="7">$0</text>
      <text x={PL - 4} y={PT + 4} textAnchor="end" fill="#4b5563" fontSize="7">${maxV.toFixed(0)}</text>
      {pts.length > 1 && <>
        <path d={areaPath} fill="url(#area-fill)" />
        <path d={linePath} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {pts.map((p, i) => (
        p.amount > 0 && <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#a855f7" />
      ))}
      {pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p, i) => (
        <text key={i} x={p.x} y={H - 3} textAnchor="middle" fill="#4b5563" fontSize="7">{p.label}</text>
      ))}
    </svg>
  );
}

// ── Glass card wrapper ─────────────────────────────────────────────────────────
const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.045)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 0 0 1px rgba(139,92,246,0.18), 0 8px 32px rgba(0,0,0,0.35)",
};

const cardV = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { type: "spring" as const, damping: 20, stiffness: 200 } },
};
const staggerV = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnalyticsTab() {
  const [receipts, setReceipts] = useState<DbReceipt[]>([]);
  const [history,  setHistory]  = useState<PriceHistoryRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      supabase
        .from("receipts")
        .select("id, created_at, store_name, total, analyses(score, leaks, total_found)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("price_history")
        .select("item_name, price, store, category, scanned_at")
        .order("scanned_at", { ascending: false })
        .limit(500),
    ]).then(([{ data: r }, { data: h }]) => {
      setReceipts((r ?? []) as DbReceipt[]);
      setHistory((h ?? []) as PriceHistoryRow[]);
      setLoading(false);
    });
  }, []);

  // Spending by category (from analyses)
  const { categorySpending, totalSpent } = useMemo(() => {
    const spending: Record<string, number> = {};
    let total = 0;
    for (const receipt of receipts) {
      for (const analysis of receipt.analyses ?? []) {
        for (const cat of (analysis.leaks ?? []) as AnalysisCategory[]) {
          const norm = normalizeCat(cat.name);
          const sum  = cat.items.reduce((s, it) => s + (it.paid ?? 0), 0);
          spending[norm] = (spending[norm] ?? 0) + sum;
          total += sum;
        }
      }
    }
    return { categorySpending: spending, totalSpent: total };
  }, [receipts]);

  // 30-day spending trend
  const spendingTrend = useMemo(() => {
    const now = Date.now();
    const MS_DAY = 86_400_000;
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * MS_DAY);
      days[`${d.getMonth() + 1}/${d.getDate()}`] = 0;
    }
    for (const r of receipts) {
      const d = new Date(r.created_at);
      if (now - d.getTime() <= 30 * MS_DAY) {
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        days[key] = (days[key] ?? 0) + (r.total ?? 0);
      }
    }
    return Object.entries(days).map(([label, amount]) => ({ label, amount }));
  }, [receipts]);

  // Monthly spend per category
  const monthlyByCategory = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const spending: Record<string, number> = {};
    for (const receipt of receipts) {
      if (new Date(receipt.created_at) < start) continue;
      for (const analysis of receipt.analyses ?? []) {
        for (const cat of (analysis.leaks ?? []) as AnalysisCategory[]) {
          const norm = normalizeCat(cat.name);
          const sum  = cat.items.reduce((s, it) => s + (it.paid ?? 0), 0);
          spending[norm] = (spending[norm] ?? 0) + sum;
        }
      }
    }
    return spending;
  }, [receipts]);

  // Store rankings with avg savings
  const storeRankings = useMemo(() => {
    const map: Record<string, { scores: number[]; savings: number[] }> = {};
    for (const r of receipts) {
      if (!r.store_name) continue;
      const name = r.store_name.trim();
      if (!map[name]) map[name] = { scores: [], savings: [] };
      for (const a of r.analyses ?? []) {
        map[name].scores.push(a.score ?? 0);
        map[name].savings.push(a.total_found ?? 0);
      }
    }
    return Object.entries(map)
      .filter(([, v]) => v.scores.length > 0)
      .map(([name, v]) => ({
        name,
        avgScore: Math.round(v.scores.reduce((a, b) => a + b, 0) / v.scores.length),
        avgSavings: +(v.savings.reduce((a, b) => a + b, 0) / v.savings.length).toFixed(2),
        count: v.scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 5);
  }, [receipts]);

  // Price inflation: items with 2+ prices
  const inflationItems = useMemo(() => {
    const byItem: Record<string, Array<{ price: number; date: string }>> = {};
    for (const row of history) {
      const key = row.item_name.toLowerCase().trim();
      if (!byItem[key]) byItem[key] = [];
      byItem[key].push({ price: row.price, date: row.scanned_at });
    }
    const results: Array<{ item: string; old: number; now: number; pct: number }> = [];
    for (const [, entries] of Object.entries(byItem)) {
      if (entries.length < 2) continue;
      entries.sort((a, b) => a.date.localeCompare(b.date));
      const oldest = entries[0].price;
      const newest = entries[entries.length - 1].price;
      const pct = Math.round(((newest - oldest) / oldest) * 100);
      if (Math.abs(pct) >= 5) {
        results.push({ item: entries[0].date, old: oldest, now: newest, pct });
      }
    }
    // Re-attach item names
    const named: Array<{ item: string; old: number; now: number; pct: number }> = [];
    for (const [name, entries] of Object.entries(byItem)) {
      if (entries.length < 2) continue;
      entries.sort((a, b) => a.date.localeCompare(b.date));
      const old  = entries[0].price;
      const now  = entries[entries.length - 1].price;
      const pct  = Math.round(((now - old) / old) * 100);
      if (Math.abs(pct) >= 5) named.push({ item: name, old, now, pct });
    }
    return named.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4);
  }, [history]);

  const pieSegments = Object.entries(categorySpending)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, ...( CAT_META[label] ?? CAT_META.Other) }));

  const hasData = receipts.length > 0;
  const hasHistory = history.length > 0;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <motion.div style={{ width: 110, height: 110 }} initial={{ opacity: 0 }} animate={{ opacity: 0.85 }}>
          <MascotLottie state="thinking" style={{ width: "100%", height: "100%" }} />
        </motion.div>
        <p className="text-zinc-400 font-bold">No data yet.</p>
        <p className="text-zinc-600 text-sm">Scan receipts on the Home tab to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div className="px-4 pt-3 pb-24 space-y-4 max-w-sm mx-auto"
        variants={staggerV} initial="hidden" animate="show">

        {/* Header */}
        <motion.div variants={cardV}>
          <p className="text-[10px] font-bold tracking-[0.28em] text-zinc-500 uppercase">Intelligence Report</p>
          <p className="text-xl font-black text-white">Spending Analytics</p>
        </motion.div>

        {/* Spending pie chart */}
        {pieSegments.length > 0 && (
          <motion.div variants={cardV}>
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4">
                <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-3">Spending by Category</p>
                <div className="flex items-center gap-3">
                  <DonutChart segments={pieSegments} total={totalSpent} />
                  <div className="flex-1 space-y-2 min-w-0">
                    {pieSegments.slice(0, 5).map(s => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                        <span className="text-[11px] text-zinc-400 truncate">{s.label}</span>
                        <span className="text-[11px] font-bold text-white ml-auto">${s.value.toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* 30-day trend */}
        <motion.div variants={cardV}>
          <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
            <div className="p-4">
              <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-1">30-Day Spending Trend</p>
              <p className="text-xs text-zinc-600 mb-3">Total receipt spend per day</p>
              <div className="overflow-hidden">
                <AreaChart data={spendingTrend} />
              </div>
            </div>
          </Card>
        </motion.div>

        {/* This month breakdown */}
        {Object.keys(monthlyByCategory).length > 0 && (
          <motion.div variants={cardV}>
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4">
                <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-3">This Month</p>
                <div className="space-y-2.5">
                  {Object.entries(monthlyByCategory)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([cat, amt]) => {
                      const meta = CAT_META[cat] ?? CAT_META.Other;
                      const pct = totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-zinc-300 flex items-center gap-1.5">
                              <span>{meta.emoji}</span>{cat}
                            </span>
                            <span className="text-[12px] font-bold text-white">${amt.toFixed(2)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: meta.color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Best stores */}
        {storeRankings.length > 0 && (
          <motion.div variants={cardV}>
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4">
                <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-3">Best Stores for You</p>
                <div className="space-y-2.5">
                  {storeRankings.map((store, i) => {
                    const pct = Math.round(store.avgScore);
                    const color = pct >= 75 ? "#22c55e" : pct >= 55 ? "#f59e0b" : "#ef4444";
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
                    return (
                      <div key={store.name} className="flex items-center gap-2">
                        <span className="text-sm">{medal}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-white truncate">{store.name}</p>
                          <p className="text-[10px] text-zinc-600">{store.count} scan{store.count !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-black tabular-nums" style={{ color }}>{pct}/100</p>
                          <p className="text-[9px] text-zinc-600">score</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Price inflation */}
        {hasHistory && inflationItems.length > 0 && (
          <motion.div variants={cardV}>
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4">
                <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase mb-3">Price Tracker</p>
                <div className="space-y-2.5">
                  {inflationItems.map((item, i) => {
                    const up = item.pct > 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-white truncate capitalize">{item.item}</p>
                          <p className="text-[10px] text-zinc-600">${item.old.toFixed(2)} → ${item.now.toFixed(2)}</p>
                        </div>
                        <span className={`text-[13px] font-black ${up ? "text-red-400" : "text-green-400"}`}>
                          {up ? "+" : ""}{item.pct}%
                        </span>
                        <span className="text-sm">{up ? "📈" : "📉"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {!hasHistory && (
          <motion.div variants={cardV}>
            <div className="rounded-xl px-3 py-3 text-center"
              style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <p className="text-[11px] text-zinc-500">📊 Scan 2+ receipts with the same item to unlock price inflation tracking.</p>
            </div>
          </motion.div>
        )}

      </motion.div>
    </div>
  );
}
