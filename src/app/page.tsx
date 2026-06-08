"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import MascotLottie from "@/components/MascotLottie";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AnalyticsTab from "@/components/AnalyticsTab";
import ShoppingTab from "@/components/ShoppingTab";
import RewardsTab from "@/components/RewardsTab";
import PlaidBankSection from "@/components/PlaidLinkButton";

// ── Animation variants ────────────────────────────────────────────────────────
const cardV = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, damping: 18, stiffness: 180 } },
};
const staggerV = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.08 } } };

// ── Constants ─────────────────────────────────────────────────────────────────
const RING_R = 72;
const RING_C = 2 * Math.PI * RING_R;

const SCAN_STEPS = [
  "Reading receipt...",
  "Cross-referencing prices...",
  "Finding better deals...",
  "Case report ready.",
] as const;

const NAVY: React.CSSProperties = { background: "linear-gradient(160deg, #0a0e1a 0%, #131832 100%)" };

// Glassmorphism card style — frosted glass floating on navy
const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.045)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 0 0 1px rgba(139,92,246,0.22), 0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScannedFile      { name: string; base64: string; }
interface ReceiptItem      { name: string; price: number; quantity: number; }
interface ExtractedReceipt { storeName: string; date: string; items: ReceiptItem[]; total: number; }

interface AnalysisItem {
  name: string; paid: number; suggestion: string;
  cheaperStore?: string; cheaperPrice?: number; searchUrl?: string;
}
interface Category {
  emoji: string; name: string; rating: "green" | "yellow" | "red";
  items: AnalysisItem[]; savingsRange?: { min: number; max: number };
}
interface AnalysisResult { score: number; categories: Category[]; totalSavings: number; yearlySavings: number; }

interface DbAnalysis {
  id: string; score: number; leaks: Category[];
  total_found: number; yearly_potential: number;
}
interface HistoryScan {
  id: string; created_at: string; store_name: string | null;
  receipt_date: string | null; total: number | null; analyses: DbAnalysis[];
}
interface StoreRanking { name: string; avgScore: number; count: number; }
interface OverpricedAlert { item: string; paid: number; cheaperPrice: number; cheaperStore: string; savings: number; }
interface DashboardData {
  avgScore: number; totalSavings: number; receiptsScanned: number;
  thisWeekSavings: number; thisMonthSavings: number;
  recentCases: HistoryScan[]; storeRankings: StoreRanking[]; streak: number; insight: string;
  overpricedAlert: OverpricedAlert | null;
}
type NavTab = "home" | "analytics" | "shopping" | "rewards" | "history" | "settings";

// ── Fallback ──────────────────────────────────────────────────────────────────
const FALLBACK: AnalysisResult = {
  score: 72,
  categories: [
    {
      emoji: "🧴", name: "Grooming", rating: "red", savingsRange: { min: 7, max: 7 },
      items: [{ name: "Duke Cannon Soap", paid: 14.99, suggestion: "Amazon has a 2-pack for $15.99 — that's $8 each vs $14.99. Save 47%.", cheaperStore: "Amazon", cheaperPrice: 7.99, searchUrl: "https://www.amazon.com/s?k=Duke+Cannon+Soap" }],
    },
    {
      emoji: "🥤", name: "Drinks", rating: "yellow", savingsRange: { min: 1, max: 3 },
      items: [{ name: "LaCroix 12-pack", paid: 6.99, suggestion: "Walmart has this for $5.98 — saves you $1.01.", cheaperStore: "Walmart", cheaperPrice: 5.98, searchUrl: "https://www.walmart.com/search?q=LaCroix+Sparkling+Water+12+pack" }],
    },
    {
      emoji: "🥦", name: "Produce", rating: "green", savingsRange: { min: 0, max: 0 },
      items: [{ name: "Organic Broccoli", paid: 2.49, suggestion: "Best price around. Case closed." }],
    },
  ],
  totalSavings: 8.01,
  yearlySavings: 96,
};

// ── Pure helpers ──────────────────────────────────────────────────────────────
function detectiveRank(score: number) {
  if (score >= 81) return "Chief Detective";
  if (score >= 61) return "Inspector";
  if (score >= 41) return "Private Eye";
  return "Rookie";
}

function analysisFromDb(a: DbAnalysis): AnalysisResult {
  return { score: a.score, categories: (a.leaks ?? []) as Category[], totalSavings: a.total_found, yearlySavings: a.yearly_potential };
}

function fmtSavings(n: number) { return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`; }

function scorePillClass(score: number) {
  return score >= 75
    ? "text-green-400 bg-green-500/15 border-green-500/25"
    : score >= 55
    ? "text-amber-400 bg-amber-500/15 border-amber-500/25"
    : "text-red-400 bg-red-500/15 border-red-500/25";
}

function computeStreak(scans: HistoryScan[]): number {
  if (!scans.length) return 0;
  const MS_DAY = 86_400_000;
  const daySet = new Set(
    scans.map(s => {
      const d = new Date(s.created_at);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    })
  );
  const now = new Date();
  let ts = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (!daySet.has(ts)) ts -= MS_DAY;
  let streak = 0;
  while (daySet.has(ts)) { streak++; ts -= MS_DAY; }
  return streak;
}

function computeInsight(scans: HistoryScan[], storeRankings: StoreRanking[]): string {
  if (scans.length < 3) return "Scan 3+ receipts to unlock personalized insights.";
  if (storeRankings.length >= 2) {
    const best  = storeRankings[0];
    const worst = storeRankings[storeRankings.length - 1];
    if (best.avgScore - worst.avgScore >= 15) {
      return `Your prices are better at ${best.name} (${best.avgScore}/100) than at ${worst.name} (${worst.avgScore}/100).`;
    }
  }
  const catOverpaid: Record<string, number> = {};
  for (const scan of scans) {
    for (const analysis of scan.analyses ?? []) {
      for (const cat of (analysis.leaks ?? []) as Category[]) {
        if (!catOverpaid[cat.name]) catOverpaid[cat.name] = 0;
        if (cat.rating === "red")    catOverpaid[cat.name] += 2;
        if (cat.rating === "yellow") catOverpaid[cat.name] += 1;
      }
    }
  }
  const topCat = Object.entries(catOverpaid).sort((a, b) => b[1] - a[1])[0];
  if (topCat && topCat[1] >= 2) return `${topCat[0]} is your biggest savings opportunity — you're consistently overpaying.`;
  const allAnalyses = scans.flatMap(s => s.analyses ?? []);
  const avg = allAnalyses.length ? Math.round(allAnalyses.reduce((s, a) => s + a.score, 0) / allAnalyses.length) : 0;
  if (avg >= 80) return "You're shopping smart — most items are near best price. Keep it up, Detective.";
  const total = allAnalyses.reduce((s, a) => s + (a.total_found ?? 0), 0);
  return `$${total.toFixed(2)} in savings found so far. Scanning regularly saves 3× more.`;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1300, delay = 400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf: number;
    let start: number | null = null;
    const timeout = setTimeout(() => {
      const tick = (now: number) => {
        if (start === null) start = now;
        const t = Math.min(Math.max(0, now - start) / duration, 1);
        setValue(Number(((1 - Math.pow(1 - t, 3)) * target).toFixed(2)));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return value;
}

function useDashboardData(refreshKey: number) {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    supabase
      .from("receipts")
      .select("id, created_at, store_name, receipt_date, total, analyses(id, score, leaks, total_found, yearly_potential)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data: rows, error }) => {
        if (error || !rows) { setLoading(false); return; }
        const scans       = rows as HistoryScan[];
        const allAnalyses = scans.flatMap(s => s.analyses ?? []);
        const totalSavings   = Number(allAnalyses.reduce((s, a) => s + (a.total_found ?? 0), 0).toFixed(2));
        const avgScore       = allAnalyses.length
          ? Math.round(allAnalyses.reduce((s, a) => s + (a.score ?? 0), 0) / allAnalyses.length) : 0;

        // Weekly / monthly savings
        const now = Date.now();
        const MS_DAY = 86_400_000;
        const weekStart  = now - 7  * MS_DAY;
        const monthStart = now - 30 * MS_DAY;
        let thisWeekSavings = 0, thisMonthSavings = 0;
        for (const scan of scans) {
          const t = new Date(scan.created_at).getTime();
          const s = (scan.analyses?.[0]?.total_found ?? 0);
          if (t >= weekStart)  thisWeekSavings  += s;
          if (t >= monthStart) thisMonthSavings += s;
        }

        const storeMap: Record<string, number[]> = {};
        for (const scan of scans) {
          const name  = scan.store_name?.trim();
          const score = scan.analyses?.[0]?.score;
          if (name && score != null) { if (!storeMap[name]) storeMap[name] = []; storeMap[name].push(score); }
        }
        const storeRankings: StoreRanking[] = Object.entries(storeMap)
          .map(([name, scores]) => ({ name, avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length }))
          .sort((a, b) => b.avgScore - a.avgScore).slice(0, 3);
        const streak  = computeStreak(scans);
        const insight = computeInsight(scans, storeRankings);

        // Overpriced alert: worst item from most recent scan
        let overpricedAlert: OverpricedAlert | null = null;
        const latestAnalysis = scans[0]?.analyses?.[0];
        if (latestAnalysis) {
          let worst: OverpricedAlert | null = null;
          for (const cat of (latestAnalysis.leaks ?? []) as Category[]) {
            for (const item of cat.items) {
              if (item.cheaperStore && item.cheaperPrice != null) {
                const savings = Math.max(0, item.paid - item.cheaperPrice);
                if (!worst || savings > worst.savings) {
                  worst = { item: item.name, paid: item.paid, cheaperPrice: item.cheaperPrice, cheaperStore: item.cheaperStore, savings };
                }
              }
            }
          }
          overpricedAlert = worst;
        }

        setData({ avgScore, totalSavings, thisWeekSavings: +thisWeekSavings.toFixed(2), thisMonthSavings: +thisMonthSavings.toFixed(2), receiptsScanned: scans.length, recentCases: scans.slice(0, 3), storeRankings, streak, insight, overpricedAlert });
        setLoading(false);
      });
  }, [refreshKey]);
  return { data, loading };
}

// ── DB ────────────────────────────────────────────────────────────────────────
async function saveScanToDb(receipt: ExtractedReceipt | null, analysis: AnalysisResult, imageBase64?: string) {
  console.log("[saveScanToDb] starting — store:", receipt?.storeName, "| score:", analysis.score, "| savings:", analysis.totalSavings);
  const receiptRow = { store_name: receipt?.storeName ?? null, receipt_date: receipt?.date ?? null, items: receipt?.items ?? null, total: receipt?.total ?? null, image_base64: imageBase64 ?? null };
  const { data, error } = await supabase.from("receipts").insert(receiptRow).select("id").single();
  if (error) { console.error("[saveScanToDb] receipts INSERT failed:", error.message); throw error; }

  const analysisRow = { receipt_id: data.id, leaks: analysis.categories, total_found: analysis.totalSavings, yearly_potential: analysis.yearlySavings, score: analysis.score };
  const { error: aErr } = await supabase.from("analyses").insert(analysisRow);
  if (aErr) { console.error("[saveScanToDb] analyses INSERT failed:", aErr.message); throw aErr; }

  // Save price_history (best-effort — don't block on failure)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const rows = analysis.categories.flatMap(cat =>
        cat.items.map(item => ({
          user_id:    user.id,
          receipt_id: data.id,
          item_name:  item.name,
          price:      item.paid,
          store:      receipt?.storeName ?? null,
          category:   cat.name,
        }))
      );
      if (rows.length) await supabase.from("price_history").insert(rows);
    }
  } catch (e) { console.warn("[saveScanToDb] price_history save skipped:", e); }

  console.log("[saveScanToDb] saved successfully ✓");
}


// ── Bottom sheet (radix dialog + framer-motion) ───────────────────────────────
function BottomSheet({ open, onOpenChange, children }: {
  open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <motion.div
                className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[28px] overflow-hidden border-t border-white/[0.08] outline-none"
                style={{ ...NAVY, maxHeight: "92vh" }}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
              >
                {children}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
function BottomNav({ active, onTabChange }: { active: NavTab; onTabChange: (t: NavTab) => void }) {
  const tabs: { key: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "home", label: "Home",
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      ),
    },
    {
      key: "analytics", label: "Intel",
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
          <line x1="2" y1="20" x2="22" y2="20"/>
        </svg>
      ),
    },
    {
      key: "shopping", label: "Shop",
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
          <path d="M16 10a4 4 0 01-8 0"/>
        </svg>
      ),
    },
    {
      key: "rewards", label: "Awards",
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
        </svg>
      ),
    },
    {
      key: "settings", label: "More",
      icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      ),
    },
  ];
  return (
    <div className="border-t border-white/[0.06] grid grid-cols-5 flex-shrink-0"
         style={{ background: "rgba(10,14,26,0.92)", backdropFilter: "blur(20px)" }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <motion.button key={tab.key} onClick={() => onTabChange(tab.key)} whileTap={{ scale: 0.82 }}
            className={`py-2.5 flex flex-col items-center gap-0.5 text-[8.5px] font-bold tracking-wide transition-colors
              ${isActive ? "text-violet-400 drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]" : "text-zinc-600"}`}>
            {tab.icon}
            {tab.label.toUpperCase()}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Newspaper SVG ─────────────────────────────────────────────────────────────
function NewspaperSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 52" fill="none" className={className}>
      <rect width="40" height="52" rx="2" fill="#e8d9b5"/>
      <rect x="3" y="3" width="34" height="8" rx="1" fill="#7a5c1e" opacity="0.9"/>
      <rect x="5" y="4.5" width="30" height="1.5" fill="#e8d9b5" opacity="0.5"/>
      <rect x="3" y="14" width="34" height="3" rx="0.5" fill="#4a3510" opacity="0.7"/>
      {[20,25,30,35].map(y => (
        <g key={y}>
          <rect x="3" y={y} width="16" height="1.5" rx="0.5" fill="#6b4a18" opacity="0.45"/>
          <rect x="22" y={y} width="15" height="1.5" rx="0.5" fill="#6b4a18" opacity="0.45"/>
        </g>
      ))}
      <rect x="3" y="41" width="20" height="8" rx="1" fill="#c4a870" opacity="0.3"/>
    </svg>
  );
}

// ── Fedora hat SVG ────────────────────────────────────────────────────────────
function FedoraSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 32" fill="none" className={className}>
      <ellipse cx="28" cy="27" rx="27" ry="5.5" fill="#1a0d3a"/>
      <path d="M8,25 C8,25 10,4 28,4 C46,4 48,25 48,25 Z" fill="#120926"/>
      <path d="M10,21 C10,21 13,17 28,17 C43,17 46,21 46,21" stroke="#a855f7" strokeWidth="2.5" fill="none" opacity="0.75"/>
      <path d="M14,12 Q18,6 28,5 C24,9 16,11 14,12 Z" fill="white" opacity="0.07"/>
    </svg>
  );
}

// ── Retro neon city dusk skyline ──────────────────────────────────────────────
function CityBackground({ opacity = 1 }: { opacity?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity }} aria-hidden>
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 w-full h-full">
        <defs>
          <linearGradient id="cb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#07021a"/>
            <stop offset="18%"  stopColor="#0f053a"/>
            <stop offset="38%"  stopColor="#2a0e4a"/>
            <stop offset="54%"  stopColor="#4d1420"/>
            <stop offset="68%"  stopColor="#7e2a10"/>
            <stop offset="80%"  stopColor="#b04a1a"/>
            <stop offset="90%"  stopColor="#c86020"/>
            <stop offset="100%" stopColor="#0a0818"/>
          </linearGradient>
          <radialGradient id="cb-moon-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#f5e6c8" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#f5e6c8" stopOpacity="0"/>
          </radialGradient>
          <linearGradient id="cb-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0c0920"/>
            <stop offset="100%" stopColor="#060412"/>
          </linearGradient>
          <linearGradient id="cb-road-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#a855f7" stopOpacity="0"/>
            <stop offset="50%"  stopColor="#a855f7" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0"/>
          </linearGradient>
          <filter id="cb-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        {/* Sky */}
        <rect width="800" height="500" fill="url(#cb-sky)"/>
        {/* Horizon glow */}
        <ellipse cx="400" cy="385" rx="480" ry="95" fill="#c86020" opacity="0.12"/>
        <ellipse cx="400" cy="392" rx="350" ry="52" fill="#e07030" opacity="0.08"/>

        {/* Moon */}
        <circle cx="650" cy="72" r="30" fill="#f5e0b8" opacity="0.88"/>
        <circle cx="641" cy="65" r="30" fill="#9a7840" opacity="0.22"/>
        <circle cx="650" cy="72" r="64" fill="url(#cb-moon-glow)"/>

        {/* Stars */}
        {[[45,35,1.5],[115,18,1.1],[185,47,1.4],[255,28,1.0],[340,12,1.6],[420,38,1.1],
           [510,22,1.4],[580,50,1.0],[695,30,1.7],[755,16,1.2],[28,72,1.0],[785,55,1.3]].map(([x,y,r],i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={0.42 + (i % 4) * 0.1}/>
        ))}

        {/* Far background buildings */}
        <rect x="0"   y="205" width="72"  height="180" fill="#0d0a22"/>
        <rect x="68"  y="172" width="52"  height="213" fill="#0d0a22"/>
        <rect x="118" y="228" width="48"  height="157" fill="#0d0a22"/>
        <rect x="560" y="195" width="70"  height="190" fill="#0d0a22"/>
        <rect x="628" y="162" width="88"  height="223" fill="#0d0a22"/>
        <rect x="714" y="215" width="92"  height="170" fill="#0d0a22"/>

        {/* Left Art Deco tower with antenna */}
        <rect x="-18" y="270" width="128" height="115" fill="#09061a"/>
        <rect x="2"   y="234" width="88"  height="38"  fill="#09061a"/>
        <rect x="18"  y="198" width="56"  height="38"  fill="#09061a"/>
        <rect x="32"  y="163" width="28"  height="37"  fill="#09061a"/>
        <rect x="39"  y="145" width="14"  height="20"  fill="#09061a"/>
        <rect x="45"  y="98"  width="2"   height="48"  fill="#09061a"/>
        <rect x="42"  y="97"  width="8"   height="3"   fill="#09061a"/>
        <circle cx="46" cy="94" r="3.5" fill="#a855f7" opacity="0.95" filter="url(#cb-glow)"/>

        {/* Center-left building with amber windows */}
        <rect x="128" y="150" width="92"  height="235" fill="#09061a"/>
        <rect x="128" y="124" width="92"  height="28"  fill="#09061a"/>
        <rect x="142" y="102" width="64"  height="24"  fill="#09061a"/>
        {[150,176,202,228,254,280,306].map(y => (
          <g key={y}>
            <rect x="142" y={y} width="9" height="11" rx="1" fill="#f59e0b" opacity="0.3"/>
            <rect x="158" y={y} width="9" height="11" rx="1" fill="#f59e0b" opacity="0.18"/>
            <rect x="196" y={y} width="9" height="11" rx="1" fill="#f59e0b" opacity="0.24"/>
          </g>
        ))}

        {/* DETECTIVE neon sign building */}
        <rect x="242" y="183" width="118" height="202" fill="#07041a"/>
        <rect x="242" y="152" width="118" height="33"  fill="#07041a"/>
        <rect x="256" y="128" width="90"  height="26"  fill="#07041a"/>
        <rect x="249" y="193" width="104" height="22" rx="2" fill="#a855f7" opacity="0.07"/>
        <rect x="249" y="193" width="104" height="22" rx="2" fill="none" stroke="#a855f7" strokeWidth="1.5" opacity="0.8"/>
        {[0,12,24,36,48,60,72,84,94].map((xo,i) => (
          <rect key={i} x={253+xo} y="198" width={i<8?8:6} height="11" rx="1" fill="#a855f7" opacity="0.65"/>
        ))}
        {[226,252,278,304,330].map(y => (
          <g key={y}>
            <rect x="256" y={y} width="8" height="10" rx="1" fill="#a855f7" opacity="0.22"/>
            <rect x="272" y={y} width="8" height="10" rx="1" fill="#f59e0b" opacity="0.18"/>
            <rect x="332" y={y} width="8" height="10" rx="1" fill="#a855f7" opacity="0.2"/>
          </g>
        ))}

        {/* Center building with retro billboard */}
        <rect x="382" y="218" width="90"  height="167" fill="#09061a"/>
        <rect x="382" y="196" width="90"  height="24"  fill="#09061a"/>
        <rect x="388" y="160" width="78"  height="38"  rx="2" fill="#0e0928" stroke="#6d28d9" strokeWidth="1" opacity="0.85"/>
        {[165,173,181,189].map((y,i) => (
          <rect key={i} x="393" y={y} width={44-i*4} height="2" rx="1" fill="#7c3aed" opacity="0.5"/>
        ))}

        {/* Tall right building with red blinker */}
        <rect x="498" y="128" width="88"  height="257" fill="#09061a"/>
        <rect x="512" y="102" width="60"  height="28"  fill="#09061a"/>
        <rect x="525" y="80"  width="34"  height="24"  fill="#09061a"/>
        <rect x="541" y="36"  width="2"   height="45"  fill="#09061a"/>
        <circle cx="542" cy="34" r="2.5" fill="#ef4444" opacity="0.85"/>
        {[146,171,196,221,246,271,296,321].map(y => (
          <g key={y}>
            <rect x="512" y={y} width="8" height="10" rx="1" fill="#f59e0b" opacity="0.22"/>
            <rect x="528" y={y} width="8" height="10" rx="1" fill="#f59e0b" opacity="0.14"/>
            <rect x="562" y={y} width="8" height="10" rx="1" fill="#a855f7" opacity="0.28"/>
            <rect x="576" y={y} width="8" height="10" rx="1" fill="#f59e0b" opacity="0.18"/>
          </g>
        ))}

        {/* Far right squat building */}
        <rect x="620" y="250" width="200" height="135" fill="#07041a"/>

        {/* Ground & road */}
        <rect x="0" y="385" width="800" height="115" fill="url(#cb-ground)"/>
        <rect x="0" y="402" width="800" height="58" fill="#0b0920"/>
        <rect x="0" y="402" width="800" height="1.5" fill="rgba(255,175,30,0.4)"/>
        <rect x="0" y="459" width="800" height="1.5" fill="rgba(255,175,30,0.4)"/>
        {Array.from({length:20}).map((_,i) => (
          <rect key={i} x={i*42} y="430" width="26" height="1.5" rx="0.75" fill="rgba(255,255,255,0.18)"/>
        ))}
        <rect x="0" y="400" width="800" height="62" fill="url(#cb-road-glow)" opacity="0.4"/>

        {/* Cars with headlights */}
        <g opacity="0.65">
          <rect x="75"  y="408" width="68" height="22" rx="6" fill="#130a28"/>
          <rect x="88"  y="400" width="44" height="10" rx="3" fill="#0d071e"/>
          <ellipse cx="142" cy="418" rx="7"  ry="4.5" fill="#fff5cc" opacity="0.85"/>
          <ellipse cx="142" cy="418" rx="22" ry="10"  fill="#fff5cc" opacity="0.05"/>
          <ellipse cx="77"  cy="418" rx="4.5" ry="3"  fill="#dc2626" opacity="0.7"/>
        </g>
        <g opacity="0.5">
          <rect x="340" y="410" width="62" height="20" rx="5" fill="#0c0820"/>
          <rect x="352" y="402" width="42" height="9"  rx="3" fill="#080516"/>
          <ellipse cx="401" cy="419" rx="6"  ry="4"   fill="#fff5cc" opacity="0.75"/>
          <ellipse cx="401" cy="419" rx="20" ry="9"   fill="#fff5cc" opacity="0.04"/>
          <ellipse cx="342" cy="419" rx="4"  ry="2.5" fill="#dc2626" opacity="0.6"/>
        </g>
        <g opacity="0.55">
          <rect x="595" y="432" width="62" height="20" rx="5" fill="#0c0820"/>
          <rect x="605" y="424" width="42" height="9"  rx="3" fill="#080516"/>
          <ellipse cx="597" cy="441" rx="6"  ry="4"   fill="#fff5cc" opacity="0.78"/>
          <ellipse cx="597" cy="441" rx="20" ry="9"   fill="#fff5cc" opacity="0.04"/>
          <ellipse cx="655" cy="441" rx="4"  ry="2.5" fill="#dc2626" opacity="0.62"/>
        </g>
      </svg>
    </div>
  );
}

// ── Confetti burst ────────────────────────────────────────────────────────────
const CONFETTI_COLORS = ["#a855f7","#f59e0b","#22c55e","#60a5fa","#f472b6","#ffffff","#fb923c"];

function ConfettiBurst({ active }: { active: boolean }) {
  const particles = useMemo(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id:    i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size:  4 + (i % 5) * 1.8,
      round: i % 3 === 0,
      vx:    (((i % 7) - 3) * 55) + (i % 2 === 0 ? 25 : -25),
      vy:    -(55 + (i % 6) * 30),
      spin:  ((i % 5) - 2) * 200,
      delay: (i % 5) * 0.04,
    }))
  , []);

  return (
    <AnimatePresence>
      {active && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 20 }}>
          {particles.map(p => (
            <motion.div
              key={p.id}
              style={{ position: "absolute", width: p.size, height: p.size, backgroundColor: p.color, borderRadius: p.round ? "50%" : "2px", left: "50%", bottom: 70 }}
              initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              animate={{ opacity: [1, 1, 0], x: p.vx, y: [0, p.vy, p.vy + 220], rotate: p.spin }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut", delay: p.delay }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Newspaper animation specs ─────────────────────────────────────────────────
const NP_SPECS = [
  { xo: -55, yo: -50, dur: 1.4, rot: [0,28,-18,35,0],     dx: [0,12,-8,18,0],   dy: [0,-12,6,-16,0]  },
  { xo:  28, yo: -38, dur: 1.1, rot: [-22,12,-30,18,-22],  dx: [0,-10,14,-6,0],  dy: [0,18,-10,12,0]  },
  { xo: -32, yo: -16, dur: 1.7, rot: [18,-28,22,-12,18],   dx: [0,14,-18,8,0],   dy: [0,-22,10,-14,0] },
  { xo:  55, yo: -58, dur: 0.9, rot: [0,-24,38,-12,0],     dx: [0,22,-12,16,0],  dy: [0,10,-22,6,0]   },
  { xo:  12, yo: -70, dur: 1.3, rot: [-32,18,-24,32,-32],  dx: [0,-18,24,-10,0], dy: [0,12,-18,6,0]   },
  { xo: -75, yo: -30, dur: 1.6, rot: [12,-38,18,-24,12],   dx: [0,16,-24,12,0],  dy: [0,-10,20,-12,0] },
];

// ── Road progress scene ───────────────────────────────────────────────────────
function RoadProgressScene({ progress }: { progress: number }) {
  const done       = progress >= 100;
  const mascotLeft = Math.min(progress, 86);
  const fedoraGone = progress > 64;

  return (
    <div style={{ position: "relative", width: "100%", height: 188 }}>
      {/* Road surface */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 68, background: "#0b0920" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "rgba(255,170,25,0.45)" }}/>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1.5, background: "rgba(255,170,25,0.45)" }}/>
        <div style={{ position: "absolute", top: "50%", left: 4, right: 4, marginTop: -1, display: "flex", gap: 10 }}>
          {Array.from({ length: 22 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.18)", borderRadius: 1 }}/>
          ))}
        </div>
        <motion.div
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, background: "linear-gradient(90deg,rgba(109,40,217,0.0),rgba(168,85,247,0.38))", boxShadow: "0 0 18px rgba(168,85,247,0.5),0 -5px 18px rgba(168,85,247,0.22)" }}
          animate={{ width: `${mascotLeft}%` }}
          transition={{ ease: "linear", duration: 0.12 }}
        />
      </div>

      {/* Mascot + newspapers container */}
      <motion.div
        style={{ position: "absolute", bottom: 62, width: 80 }}
        animate={{ left: `calc(${mascotLeft}% - 40px)` }}
        transition={{ ease: "linear", duration: 0.12 }}
      >
        {/* Flying newspapers */}
        {NP_SPECS.map((np, i) => (
          <motion.div
            key={i}
            style={{ position: "absolute", left: np.xo, top: np.yo, width: 34, zIndex: i % 2 === 0 ? 2 : 12 }}
            animate={done
              ? { x: (i - 2.5) * 72, y: -150, rotate: 400, opacity: 0 }
              : { rotate: np.rot, x: np.dx, y: np.dy }
            }
            transition={done
              ? { duration: 0.8, ease: "easeOut", delay: i * 0.06 }
              : { duration: np.dur, repeat: Infinity, ease: "easeInOut" }
            }
          >
            <NewspaperSVG className="w-full h-auto"/>
          </motion.div>
        ))}

        {/* Fedora (blows off at 64%) */}
        <motion.div
          style={{ position: "absolute", left: 18, top: -24, width: 46, zIndex: 15 }}
          animate={fedoraGone
            ? { x: 72, y: -58, rotate: 200, opacity: 0 }
            : { x: [0,-2,2,-1,0], y: [0,-2,1,-2,0], rotate: [-8,5,-8] }
          }
          transition={fedoraGone
            ? { duration: 0.7, ease: "easeOut" }
            : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <FedoraSVG className="w-full h-auto"/>
        </motion.div>

        {/* Detective mascot — Lottie handles running/celebrating internally */}
        <div style={{ position: "relative", zIndex: 10, width: 80, height: 80 }}>
          <MascotLottie key={done ? "done" : "run"} state={done ? "celebrating" : "running"} style={{ width: "100%", height: "100%" }} />
        </div>
      </motion.div>

      <ConfettiBurst active={done}/>
    </div>
  );
}

// ── Scan overlay ──────────────────────────────────────────────────────────────
function Scan({ onProgressDone, filename, error, onRetry }: {
  onProgressDone: () => void; filename?: string; error?: string | null; onRetry?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [step, setStep]         = useState(0);
  const cbRef = useRef(onProgressDone);
  cbRef.current = onProgressDone;

  useEffect(() => {
    let raf: number; let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(Math.max(0, now - start) / 2500, 1);
      setProgress(Math.round(t * 100));
      if (t < 1) { raf = requestAnimationFrame(tick); } else { setTimeout(() => cbRef.current(), 350); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const ids = [600, 1300, 2100].map((d, i) => setTimeout(() => setStep(i + 1), d));
    return () => ids.forEach(clearTimeout);
  }, []);

  return (
    <div className="h-[100dvh] text-white font-sans flex flex-col relative overflow-hidden" style={NAVY}>
      <CityBackground/>
      <div className="relative z-10 flex-1 flex flex-col">
        {/* Top bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between px-5"
          style={{ paddingTop: "max(env(safe-area-inset-top,0px),3rem)", paddingBottom: "0.75rem" }}
        >
          <span className="text-[10px] font-bold tracking-[0.28em] text-zinc-500 uppercase">Receipt Detective</span>
          <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">
            {error ? "Case Stalled" : "On The Case"}
          </span>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-5">
          {error ? (
            <div className="w-full max-w-sm space-y-4">
              <div className="flex justify-center">
                <MascotLottie state="confused" style={{ width: 130, height: 130 }} />
              </div>
              <div className="rounded-2xl p-4" style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)" }}>
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-[0.2em] mb-1.5">Investigation Failed</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{error}</p>
              </div>
              {onRetry && (
                <motion.button
                  onClick={onRetry} whileTap={{ scale: 0.97 }}
                  className="w-full py-4 rounded-2xl font-black text-[13px] tracking-widest uppercase text-zinc-300"
                  style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)" }}>
                  Try Again
                </motion.button>
              )}
            </div>
          ) : (
            <>
              <div className="text-center w-full">
                <p className="text-[10px] font-bold tracking-[0.28em] text-zinc-600 uppercase mb-3">Status</p>
                <div className="h-7 overflow-hidden">
                  <motion.p
                    key={step}
                    className="text-lg font-semibold text-white"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                  >
                    {SCAN_STEPS[step]}
                  </motion.p>
                </div>
                {filename && (
                  <p className="text-[11px] text-zinc-600 font-mono mt-2 truncate max-w-[240px] mx-auto">{filename}</p>
                )}
              </div>

              <RoadProgressScene progress={progress}/>

              <div className="flex justify-between items-center w-full max-w-xs">
                <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">Progress</span>
                <span className="text-sm font-black text-violet-400 tabular-nums">{progress}%</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────
function CategoryCard({ category }: { category: Category }) {
  const [expanded, setExpanded] = useState(false);
  const sr = category.savingsRange;
  const hasSavings   = sr && (sr.min > 0 || sr.max > 0);
  const savingsLabel = hasSavings
    ? sr!.min === sr!.max ? `${fmtSavings(sr!.min)}/mo` : `${fmtSavings(sr!.min)}–${fmtSavings(sr!.max)}/mo`
    : null;

  return (
    <motion.div variants={cardV} whileHover={{ scale: 1.015, transition: { duration: 0.15 } }}>
      <Card className="bg-white/[0.05] backdrop-blur-xl border-white/10 rounded-2xl shadow-none overflow-hidden text-white">
        <button className="w-full flex items-center gap-4 px-4 py-4 text-left active:bg-white/[0.03] transition-colors"
          onClick={() => setExpanded(e => !e)}>
          <div className="w-14 h-14 rounded-2xl bg-white/[0.07] flex items-center justify-center flex-shrink-0" style={{ fontSize: "32px", lineHeight: 1 }}>
            {category.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-white leading-tight" style={{ fontSize: "18px" }}>{category.name}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{category.items.length} item{category.items.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {savingsLabel
              ? <span className="text-sm font-black text-green-400 tabular-nums leading-none">{savingsLabel}</span>
              : <span className="text-xs font-bold text-green-400 leading-none">Best price</span>}
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 text-zinc-600">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </motion.div>
          </div>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div key="body"
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: "hidden" }}>
              <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                {category.items.map((item, j) => {
                  const itemSavings = item.cheaperPrice != null ? Math.max(0, item.paid - item.cheaperPrice) : 0;
                  const isGreen     = !item.cheaperStore;
                  const safeUrl     = item.searchUrl?.startsWith("https://") ? item.searchUrl : undefined;
                  return (
                    <div key={j} className="px-4 py-4 space-y-3">
                      <p className="font-black text-white leading-snug" style={{ fontSize: "16px" }}>{item.name}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">You paid</span>
                        <span className="text-xl font-black tabular-nums text-white">${item.paid.toFixed(2)}</span>
                      </div>
                      {isGreen ? (
                        <p className="text-sm font-semibold text-green-400 leading-snug">✓ Best price found. Case closed.</p>
                      ) : (
                        <>
                          <p className="text-sm text-zinc-300 leading-relaxed">{item.suggestion}</p>
                          {itemSavings > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Save</span>
                              <span className="text-base font-black text-green-400 tabular-nums">${itemSavings.toFixed(2)}</span>
                            </div>
                          )}
                          {item.cheaperStore && safeUrl && (
                            <a href={safeUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-bold text-violet-400 hover:text-violet-300 active:text-violet-500 transition-colors">
                              <span>View on {item.cheaperStore}</span>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5 flex-shrink-0">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ── Count-up value span ───────────────────────────────────────────────────────
function CountUpValue({ target, prefix = "", round = false, className = "" }: {
  target: number; prefix?: string; round?: boolean; className?: string;
}) {
  const v = useCountUp(target, 900, 300);
  return <span className={className}>{prefix}{round ? Math.round(v) : v.toFixed(2)}</span>;
}

// ── Avg score mini ring widget ────────────────────────────────────────────────
function AvgScoreWidget({ score, hasData }: { score: number; hasData: boolean }) {
  const [ready, setReady] = useState(false);
  const val = useCountUp(score, 900, 300);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const r = 38;
  const c = 2 * Math.PI * r;
  const dashOffset = ready && hasData ? c * (1 - val / 100) : c;
  const stroke  = val >= 75 ? "#22c55e" : val >= 55 ? "#f59e0b" : "#ef4444";
  const textCls = val >= 75 ? "text-green-400" : val >= 55 ? "text-amber-400" : "text-red-400";
  return (
    <>
      <div className="relative w-[88px] h-[88px]">
        <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="44" cy="44" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={dashOffset}
            style={{ transition: ready && hasData ? "stroke-dashoffset 1s cubic-bezier(0.33,1,0.68,1)" : "none" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {hasData
            ? <span className={`text-[24px] font-black tabular-nums leading-none ${textCls}`}>{Math.round(val)}</span>
            : <span className="text-[24px] font-black leading-none text-zinc-700">—</span>}
        </div>
      </div>
      <p className="text-[9px] font-bold tracking-[0.18em] text-zinc-600 uppercase">Avg Score</p>
    </>
  );
}

// ── Result modal (BottomSheet) ────────────────────────────────────────────────
function ResultModal({ open, data, receipt, onClose }: {
  open: boolean; data: AnalysisResult; receipt: ExtractedReceipt | null; onClose: () => void;
}) {
  const scoreVal   = useCountUp(data.score,        1200, 300);
  const savingsVal = useCountUp(data.totalSavings,  1300, 400);
  const yearlyVal  = useCountUp(data.yearlySavings, 1500, 400);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { if (open) { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); } else { setMounted(false); } }, [open]);

  const dashOffset = mounted ? RING_C * (1 - scoreVal / 100) : RING_C;
  const scoreBadgeClass = scoreVal >= 75 ? "text-green-400 bg-green-500/10 border-green-500/25" : scoreVal >= 55 ? "text-amber-400 bg-amber-500/10 border-amber-500/25" : "text-red-400 bg-red-500/10 border-red-500/25";
  const scoreLabel      = scoreVal >= 75 ? "Good Shape" : scoreVal >= 55 ? "Needs Improvement" : "High Risk";
  const glowColor       = scoreVal >= 70 ? "radial-gradient(circle, rgba(34,197,94,0.18), transparent)" : scoreVal >= 45 ? "radial-gradient(circle, rgba(245,158,11,0.18), transparent)" : "radial-gradient(circle, rgba(239,68,68,0.18), transparent)";

  return (
    <BottomSheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-violet-600/[0.07] rounded-full blur-[80px]" />
      </div>
      {/* Handle + header */}
      <div className="relative z-10 flex-shrink-0 pt-3 px-5 pb-4 border-b border-white/[0.06]">
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-violet-400">
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase">Case Report</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.1]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </Button>
        </div>
      </div>
      {/* Scrollable content */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <motion.div className="px-5 py-5 space-y-4 max-w-sm mx-auto pb-8"
          variants={staggerV} initial="hidden" animate={open ? "show" : "hidden"}>
          {/* Score ring */}
          <motion.div variants={cardV}>
            <Card className="bg-white/[0.04] backdrop-blur-xl border-white/10 rounded-3xl shadow-none text-white">
              <div className="p-6 flex flex-col items-center">
                <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-5">Price Efficiency Score</p>
                <div className="relative w-[212px] h-[212px]">
                  <div className="absolute inset-10 rounded-full blur-3xl transition-all duration-1000" style={{ background: glowColor }} />
                  <svg width="212" height="212" viewBox="0 0 212 212" className="-rotate-90">
                    <defs>
                      <linearGradient id="modalRingGrad" x1="106" y1="24" x2="106" y2="188" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#ef4444" /><stop offset="45%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#22c55e" />
                      </linearGradient>
                    </defs>
                    <circle cx="106" cy="106" r={RING_R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="11" />
                    <circle cx="106" cy="106" r={RING_R} fill="none" stroke="url(#modalRingGrad)" strokeWidth="11" strokeLinecap="round"
                      strokeDasharray={RING_C} strokeDashoffset={dashOffset}
                      style={{ transition: mounted ? "stroke-dashoffset 1.3s cubic-bezier(0.33,1,0.68,1)" : "none" }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <span className="text-[54px] font-black tabular-nums leading-none">{Math.round(scoreVal)}</span>
                    <span className="text-zinc-600 text-xs font-semibold tracking-widest uppercase">out of 100</span>
                  </div>
                </div>
                <Badge variant="outline" className={`mt-4 rounded-full px-4 py-1.5 text-xs font-bold border ${scoreBadgeClass}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 mr-2" />
                  {scoreLabel}
                </Badge>
                {data.score >= 75 && (
                  <motion.div className="mt-3" style={{ width: 120, height: 120 }}
                    initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.7, type: "spring", damping: 16 }}>
                    <MascotLottie state="thumbsup" style={{ width: "100%", height: "100%" }} />
                  </motion.div>
                )}
                {data.score < 50 && (
                  <motion.div className="mt-3" style={{ width: 120, height: 120 }}
                    initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.7, type: "spring", damping: 16 }}>
                    <MascotLottie state="confused" style={{ width: "100%", height: "100%" }} />
                  </motion.div>
                )}
                <div className="flex items-center gap-8 mt-5 pt-4 border-t border-white/[0.06] w-full justify-center">
                  <div className="text-center">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-bold mb-1">Savings Found</p>
                    <p className="text-xl font-black tabular-nums text-green-400">${savingsVal.toFixed(2)}</p>
                  </div>
                  <div className="w-px h-8 bg-white/[0.07]" />
                  <div className="text-center">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-[0.2em] font-bold mb-1">Categories</p>
                    <p className="text-xl font-black tabular-nums">{data.categories.length}</p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
          {/* Receipt info */}
          {receipt && (
            <motion.div variants={cardV}>
              <Card className="bg-white/[0.04] backdrop-blur-xl border-white/10 rounded-2xl shadow-none text-white">
                <div className="p-4">
                  <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-2">Receipt</p>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-black text-white leading-none truncate">{receipt.storeName || "Unknown Store"}</p>
                      <p className="text-xs text-zinc-500 mt-1">{receipt.date} · {receipt.items.length} item{receipt.items.length !== 1 ? "s" : ""}</p>
                    </div>
                    <p className="text-lg font-black tabular-nums flex-shrink-0">${typeof receipt.total === "number" ? receipt.total.toFixed(2) : "—"}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
          {/* Categories */}
          <motion.div variants={staggerV}>
            <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-3">Price Intelligence</p>
            <div className="space-y-3">
              {data.categories.map((cat, i) => <CategoryCard key={cat.name + i} category={cat} />)}
            </div>
          </motion.div>
          {/* Summary */}
          <motion.div variants={cardV}>
            <Card className="bg-white/[0.04] backdrop-blur-xl border-white/10 rounded-2xl shadow-none text-white">
              <div className="p-5">
                <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-4">Case Summary</p>
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-zinc-400">Savings this receipt</span>
                    <span className="text-3xl font-black tabular-nums" style={{ background: "linear-gradient(135deg, #4ade80, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                      ${savingsVal.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-zinc-400">Yearly projection</span>
                    <span className="text-xl font-black tabular-nums" style={{ background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                      ${Math.round(yearlyVal).toLocaleString()}/yr
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
          {/* Close button */}
          <motion.div variants={cardV}>
            <Button onClick={onClose}
              className="w-full py-[18px] h-auto rounded-2xl font-bold text-sm tracking-widest uppercase text-white hover:opacity-90 active:opacity-80 border-0"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.35)" }}>
              CLOSE CASE
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </BottomSheet>
  );
}

// ── Quick tips ────────────────────────────────────────────────────────────────
const QUICK_TIPS = [
  "Store brands use identical ingredients — 30% cheaper, case closed.",
  "Check unit price labels, not sticker price. Bigger isn't always the deal.",
  "Mid-week produce hits peak markdown. Wednesday is your day.",
  "Screenshot price-match policies before checkout. They expire fast.",
  "Loyalty apps hide unadvertised deals — always check before you scan.",
  "Frozen vegetables: same nutrition, half the price. Not a compromise.",
  "Buy in bulk only what you'll finish. Waste is the enemy of savings.",
] as const;

// ── Dashboard bottom carousel ─────────────────────────────────────────────────
function DashboardCarousel({ data, tip }: { data: DashboardData | null; tip: string }) {
  const [page, setPage] = useState(0);
  const PAGES = 3;

  const slides = [
    // Slide 0: Store Rankings
    <div key="rankings" className="px-0.5">
      <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Store Rankings</p>
      {data?.storeRankings.length ? (
        <div className="space-y-1.5">
          {data.storeRankings.slice(0, 2).map((s, i) => {
            const color = s.avgScore >= 75 ? "#22c55e" : s.avgScore >= 55 ? "#f59e0b" : "#ef4444";
            return (
              <div key={s.name} className="flex items-center gap-2">
                <span className="text-xs">{i === 0 ? "🥇" : "🥈"}</span>
                <span className="text-[11px] text-zinc-300 flex-1 truncate font-medium">{s.name}</span>
                <span className="text-[11px] font-black tabular-nums" style={{ color }}>{s.avgScore}/100</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-700">Scan from 2+ stores to compare.</p>
      )}
    </div>,

    // Slide 1: Recent Cases
    <div key="recent" className="px-0.5">
      <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Recent Cases</p>
      {data?.recentCases.length ? (
        <div className="space-y-1.5">
          {data.recentCases.slice(0, 2).map(scan => {
            const a = scan.analyses?.[0];
            return (
              <div key={scan.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-zinc-300 truncate">{scan.store_name || "Unknown"}</p>
                  <p className="text-[9px] text-zinc-700">{new Date(scan.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                </div>
                {a && <span className={`text-[12px] font-black tabular-nums ${a.score >= 75 ? "text-green-400" : a.score >= 55 ? "text-amber-400" : "text-red-400"}`}>{a.score}</span>}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-zinc-700">No cases solved yet.</p>
      )}
    </div>,

    // Slide 2: Smart Insight
    <div key="insight" className="px-0.5">
      <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Smart Insight</p>
      <p className="text-[11px] text-zinc-300 leading-snug line-clamp-3">
        💡 {data?.insight ?? "Scan 3+ receipts to unlock personalized insights."}
      </p>
    </div>,
  ];

  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
      className="flex-shrink-0 rounded-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(139,92,246,0.15)", backdropFilter: "blur(20px)" }}>
      <div className="px-3 pt-2.5 pb-2 overflow-hidden">
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.15}
          onDragEnd={(_, info) => {
            if (info.offset.x < -40) setPage(p => Math.min(p + 1, PAGES - 1));
            if (info.offset.x >  40) setPage(p => Math.max(p - 1, 0));
          }}
          className="cursor-grab active:cursor-grabbing"
        >
          <AnimatePresence mode="wait">
            <motion.div key={page}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.18 }}>
              {slides[page]}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 pb-2.5">
        {Array.from({ length: PAGES }).map((_, i) => (
          <motion.div key={i}
            animate={{ width: i === page ? 14 : 5, background: i === page ? "#a855f7" : "rgba(255,255,255,0.18)" }}
            className="h-[5px] rounded-full cursor-pointer"
            onClick={() => setPage(i)}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ── Dashboard (Home tab) ──────────────────────────────────────────────────────
function Dashboard({ data, loading, onScan }: {
  data: DashboardData | null; loading: boolean;
  onScan: (f: ScannedFile) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cbRef   = useRef(onScan);
  cbRef.current = onScan;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cbRef.current({ name: file.name, base64: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const [tip, setTip] = useState<string>(QUICK_TIPS[0]);
  useEffect(() => { setTip(QUICK_TIPS[Math.floor(Math.random() * QUICK_TIPS.length)]); }, []);

  const rank    = data?.avgScore != null ? detectiveRank(data.avgScore) : null;
  const hasData = !!data && data.receiptsScanned > 0;
  const scoreColor = hasData
    ? (data!.avgScore >= 75 ? "text-green-400" : data!.avgScore >= 55 ? "text-amber-400" : "text-red-400")
    : "text-zinc-700";

  return (
    <motion.div
      className="flex-1 flex flex-col overflow-hidden px-4 pb-2 gap-2"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 2.5rem)" }}
      variants={staggerV} initial="hidden" animate="show">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

      {/* ① Greeting — one compact line */}
      <motion.div variants={cardV} className="flex items-center gap-2 flex-shrink-0 h-8">
        <span className="text-[17px] font-black text-white leading-none">Hey Detective 🕵️</span>
        {rank && (
          <Badge variant="outline" className={`rounded-full text-[10px] font-bold flex-shrink-0 ${scorePillClass(data!.avgScore)}`}>
            {rank}
          </Badge>
        )}
        <div className="flex-1" />
        {(data?.streak ?? 0) > 0 && (
          <span className="text-[13px] font-black text-orange-400 flex-shrink-0">{data!.streak}🔥</span>
        )}
      </motion.div>

      {/* ② SCAN NOW — hero, takes remaining flex space, capped so it doesn't tower on large phones */}
      <motion.div variants={cardV} className="relative flex-1 min-h-[140px] max-h-[50dvh]">
        <div className="absolute inset-0 rounded-[22px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 70%, rgba(109,40,217,0.55) 0%, transparent 68%)", filter: "blur(18px)" }} />
        <motion.div
          className="absolute -inset-[7px] rounded-[27px] pointer-events-none"
          style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.6), rgba(167,139,250,0.3))", filter: "blur(14px)" }}
          animate={{ opacity: [0.35, 0.78, 0.35], scale: [1, 1.03, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative h-full p-[1.5px] rounded-[22px] overflow-hidden">
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #7c3aed, #c4b5fd, #6d28d9)" }} />
          <motion.button
            onClick={() => fileRef.current?.click()}
            whileTap={{ scale: 0.975 }}
            whileHover={{ scale: 1.012 }}
            animate={{
              boxShadow: [
                "0 0 24px rgba(124,58,237,0.3), 0 0 60px rgba(124,58,237,0.1)",
                "0 0 50px rgba(124,58,237,0.65), 0 0 110px rgba(124,58,237,0.22)",
                "0 0 24px rgba(124,58,237,0.3), 0 0 60px rgba(124,58,237,0.1)",
              ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="relative w-full h-full rounded-[21px] flex flex-col items-center justify-center gap-4 select-none overflow-hidden"
            style={{ background: "linear-gradient(160deg, #0f1225 0%, #131832 100%)" }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(124,58,237,0.14) 0%, transparent 65%)" }} />
            <motion.div
              className="w-[62px] h-[62px] rounded-full flex items-center justify-center"
              animate={{ boxShadow: ["0 0 0 0 rgba(139,92,246,0)", "0 0 0 14px rgba(139,92,246,0.13)", "0 0 0 0 rgba(139,92,246,0)"] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: "rgba(109,40,217,0.22)", border: "1.5px solid rgba(167,139,250,0.45)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-7 h-7 text-violet-300">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </motion.div>
            <div className="relative text-center">
              <p className="text-[26px] font-black text-white leading-none tracking-tight">Scan Receipt</p>
              <p className="text-zinc-400 text-[13px] mt-1.5 font-medium">
                {hasData ? "Investigate your prices" : "Start your first case"}
              </p>
            </div>
          </motion.button>
        </div>
      </motion.div>

      {/* ③ Stats 2×2 — compact */}
      <motion.div variants={staggerV} className="grid grid-cols-2 gap-2 flex-shrink-0">

        <motion.div variants={cardV}
          className="rounded-2xl p-2.5 flex flex-col justify-between overflow-hidden"
          style={{ height: "min(9vh, 76px)", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.22)", backdropFilter: "blur(20px)" }}>
          <p className="text-[8px] font-bold tracking-[0.18em] text-green-400/70 uppercase">
            Saved {data?.thisMonthSavings ? `· $${data.thisMonthSavings.toFixed(0)} this mo` : "Lifetime"}
          </p>
          <p className="text-[22px] font-black tabular-nums text-green-400 leading-none drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]">
            <CountUpValue target={data?.totalSavings ?? 0} prefix="$" />
          </p>
        </motion.div>

        <motion.div variants={cardV}
          className="rounded-2xl p-2.5 flex flex-col justify-between overflow-hidden"
          style={{ height: "min(9vh, 76px)", background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.22)", backdropFilter: "blur(20px)" }}>
          <p className="text-[8px] font-bold tracking-[0.18em] text-violet-400/70 uppercase">Cases Solved</p>
          <p className="text-[26px] font-black tabular-nums leading-none"
            style={{ background: "linear-gradient(135deg, #a78bfa, #7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            <CountUpValue target={data?.receiptsScanned ?? 0} round />
          </p>
        </motion.div>

        <motion.div variants={cardV}
          className="rounded-2xl p-2.5 flex flex-col justify-between overflow-hidden"
          style={{ height: "min(9vh, 76px)", background: "rgba(255,255,255,0.045)", border: "1px solid rgba(139,92,246,0.18)", backdropFilter: "blur(20px)" }}>
          <p className="text-[8px] font-bold tracking-[0.18em] text-zinc-400/70 uppercase">Avg Score</p>
          {hasData
            ? <p className={`text-[26px] font-black tabular-nums leading-none ${scoreColor}`}>
                <CountUpValue target={data!.avgScore} round />
              </p>
            : <p className="text-[26px] font-black leading-none text-zinc-700">—</p>}
        </motion.div>

        <motion.div variants={cardV}
          className="rounded-2xl p-2.5 flex flex-col justify-between overflow-hidden"
          style={{ height: "min(9vh, 76px)", background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.22)", backdropFilter: "blur(20px)" }}>
          <p className="text-[8px] font-bold tracking-[0.18em] text-orange-400/70 uppercase">Streak</p>
          <div className="flex items-end gap-1">
            <span className="text-[15px] leading-none">🔥</span>
            <span className="text-[26px] font-black tabular-nums text-orange-400 leading-none drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">
              {data?.streak ?? 0}
            </span>
          </div>
        </motion.div>

      </motion.div>

      {/* ④ Overpriced Alert */}
      {data?.overpricedAlert && (
        <motion.div variants={cardV} className="flex-shrink-0 rounded-xl px-3 py-2.5 flex gap-2.5 items-center"
          style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", backdropFilter: "blur(20px)" }}>
          <span className="text-base leading-none flex-shrink-0">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Overpaid Alert</p>
            <p className="text-[11px] text-zinc-300 leading-snug truncate">
              <span className="font-bold">{data.overpricedAlert.item}</span> — ${data.overpricedAlert.savings.toFixed(2)} cheaper at {data.overpricedAlert.cheaperStore}
            </p>
          </div>
          <p className="text-[13px] font-black text-red-400 flex-shrink-0">-${data.overpricedAlert.savings.toFixed(2)}</p>
        </motion.div>
      )}

      {/* ⑤ Swipeable carousel: Store Rankings · Recent Cases · Insight */}
      <DashboardCarousel data={data} tip={tip} />

    </motion.div>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryTab({ onViewResult }: { onViewResult: (r: AnalysisResult) => void }) {
  const [scans,   setScans]   = useState<HistoryScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("receipts")
      .select("id, created_at, store_name, receipt_date, total, analyses(id, score, leaks, total_found, yearly_potential)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!error && data) setScans(data as HistoryScan[]);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="flex-1 flex justify-center items-center">
      <div className="w-6 h-6 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
    </div>
  );

  if (!scans.length) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <motion.div style={{ width: 120, height: 120 }}
        initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} transition={{ duration: 0.5 }}>
        <MascotLottie state="thinking" style={{ width: "100%", height: "100%" }} />
      </motion.div>
      <p className="text-zinc-400 font-bold">No cases yet.</p>
      <p className="text-zinc-600 text-sm">Scan your first receipt on the Home tab.</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div className="px-5 pt-3 pb-6 space-y-3 max-w-sm mx-auto"
        variants={staggerV} initial="hidden" animate="show">
        <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase">All Cases · {scans.length}</p>
        {scans.map((scan) => {
          const analysis = scan.analyses?.[0];
          return (
            <motion.div key={scan.id} variants={cardV} whileHover={{ scale: 1.015, transition: { duration: 0.15 } }}>
              <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
                <button className="w-full p-5 text-left hover:bg-white/[0.03] transition-colors"
                  onClick={() => analysis && onViewResult(analysisFromDb(analysis))}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-[15px] truncate">{scan.store_name || "Unknown Store"}</p>
                      <p className="text-[13px] text-zinc-500 mt-0.5">
                        {new Date(scan.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    {analysis && (
                      <div className="text-right flex-shrink-0">
                        <p className={`text-2xl font-black tabular-nums leading-none ${scorePillClass(analysis.score).split(" ")[0]}`}>{analysis.score}</p>
                        <p className="text-[11px] text-zinc-600">/100</p>
                      </div>
                    )}
                  </div>
                  {analysis && (
                    <div className="flex justify-between mt-3 pt-3 border-t border-white/[0.06]">
                      <span className="text-[13px] text-zinc-500">Savings found</span>
                      <span className="text-[13px] font-bold text-violet-400 tabular-nums">${Number(analysis.total_found).toFixed(2)}</span>
                    </div>
                  )}
                </button>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <motion.button whileTap={{ scale: 0.9 }} onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${value ? "bg-violet-500" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${value ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </motion.button>
    </div>
  );
}

function SettingsTab({ onLogout }: { onLogout: () => void }) {
  const [notif, setNotif] = useState(true);
  const [dark,  setDark]  = useState(true);
  const [loyaltyCards, setLoyaltyCards] = useState<Array<{ id: string; store_name: string; card_number: string }>>([]);
  const [addingCard,   setAddingCard]   = useState(false);
  const [cardStore,    setCardStore]    = useState("");
  const [cardNum,      setCardNum]      = useState("");

  useEffect(() => {
    supabase.from("loyalty_cards").select("id, store_name, card_number").then(({ data }) => {
      if (data) setLoyaltyCards(data as typeof loyaltyCards);
    });
  }, []);

  const addLoyaltyCard = async () => {
    if (!cardStore.trim() || !cardNum.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("loyalty_cards")
      .insert({ user_id: user.id, store_name: cardStore.trim(), card_number: cardNum.trim() })
      .select().single();
    if (data) setLoyaltyCards(prev => [...prev, data as typeof loyaltyCards[0]]);
    setCardStore(""); setCardNum(""); setAddingCard(false);
  };

  const removeLoyaltyCard = async (id: string) => {
    await supabase.from("loyalty_cards").delete().eq("id", id);
    setLoyaltyCards(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div className="px-5 pt-3 pb-6 space-y-4 max-w-sm mx-auto"
        variants={staggerV} initial="hidden" animate="show">

        <motion.div variants={cardV}>
          <Card className="rounded-2xl shadow-none text-white overflow-hidden divide-y divide-white/[0.06]" style={GLASS}>
            <ToggleRow label="Notifications" value={notif} onChange={setNotif} />
            <ToggleRow label="Dark Mode"     value={dark}  onChange={setDark}  />
          </Card>
        </motion.div>

        {/* Bank Linking (Plaid) */}
        <motion.div variants={cardV}>
          <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
            <div className="p-4">
              <PlaidBankSection />
            </div>
          </Card>
        </motion.div>

        {/* Loyalty Cards */}
        <motion.div variants={cardV}>
          <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Loyalty Cards</p>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setAddingCard(v => !v)}
                  className="text-[10px] font-bold text-violet-400 uppercase tracking-wider px-2 py-1 rounded-lg"
                  style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
                  {addingCard ? "Cancel" : "+ Add"}
                </motion.button>
              </div>
              <AnimatePresence>
                {addingCard && (
                  <motion.div key="lc-form"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <div className="space-y-2">
                      <input value={cardStore} onChange={e => setCardStore(e.target.value)} placeholder="Store (CVS, Safeway…)"
                        className="w-full rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-zinc-600 outline-none"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
                      <input value={cardNum} onChange={e => setCardNum(e.target.value)} placeholder="Card number"
                        className="w-full rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-zinc-600 outline-none"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} />
                      <motion.button whileTap={{ scale: 0.97 }} onClick={addLoyaltyCard}
                        className="w-full py-2.5 rounded-xl font-bold text-[11px] tracking-widest uppercase text-white"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}>
                        Save Card
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {loyaltyCards.length === 0 && !addingCard && (
                <p className="text-[12px] text-zinc-700">No loyalty cards saved yet.</p>
              )}
              {loyaltyCards.map(card => (
                <div key={card.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-zinc-300">{card.store_name}</p>
                    <p className="text-[10px] text-zinc-700 font-mono">••••{card.card_number.slice(-4)}</p>
                  </div>
                  <button onClick={() => removeLoyaltyCard(card.id)} className="text-zinc-700 hover:text-red-400 transition-colors p-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={cardV}>
          <Card className="rounded-2xl shadow-none text-white overflow-hidden divide-y divide-white/[0.06]" style={GLASS}>
            <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase px-5 pt-5 pb-3">About</p>
            {[["App", "Receipt Detective"], ["Version", "2.0.0"], ["Powered by", "Claude AI"]].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center px-5 py-4">
                <span className="text-[14px] text-zinc-500">{label}</span>
                <span className="text-[14px] font-bold text-zinc-300">{value}</span>
              </div>
            ))}
          </Card>
        </motion.div>

        <motion.div variants={cardV}>
          <Card className="rounded-2xl shadow-none text-white p-5" style={GLASS}>
            <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase mb-3">Legal</p>
            <p className="text-[13px] text-zinc-600 leading-relaxed">Price comparisons are estimates only. Receipt Detective is not affiliated with any retailers. Always verify prices before purchasing.</p>
          </Card>
        </motion.div>

        <motion.div variants={cardV}>
          <motion.button onClick={onLogout} whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl font-black text-[13px] tracking-widest uppercase text-red-400"
            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.22)", backdropFilter: "blur(20px)" }}>
            Sign Out
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Profile completion modal (shown after first scan if profile is incomplete) ─
function ProfileModal({ open, onSave, onSkip }: {
  open: boolean;
  onSave: (name: string, birthday: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [name,     setName]     = useState("");
  const [birthday, setBirthday] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !birthday) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), birthday);
    } catch {
      setError("Couldn't save — please try again.");
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onOpenChange={v => { if (!v) onSkip(); }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-violet-600/[0.07] rounded-full blur-[80px]" />
      </div>

      {/* Handle + label */}
      <div className="relative z-10 flex-shrink-0 pt-3 px-5 pb-4 border-b border-white/[0.06]">
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3" />
        <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase text-center">Detective Profile</p>
      </div>

      {/* Scrollable body */}
      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="px-5 py-6 flex flex-col gap-5 max-w-sm mx-auto pb-8">

          {/* Celebrating mascot */}
          <div className="flex justify-center">
            <motion.div
              style={{ width: 110, height: 110 }}
              initial={{ scale: 0.75, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.45, type: "spring", damping: 14 }}
            >
              <MascotLottie state="celebrating" style={{ width: "100%", height: "100%" }} />
            </motion.div>
          </div>

          {/* Copy */}
          <div className="text-center flex flex-col gap-1.5">
            <p className="text-[10px] font-bold tracking-[0.28em] text-violet-400 uppercase">Great case! 🎉</p>
            <h2 className="text-[22px] font-black text-white leading-snug">Want to save your<br />profile?</h2>
            <p className="text-[13px] text-zinc-500 leading-snug">10 seconds. Powers better insights and a personalized experience.</p>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              className="w-full rounded-xl px-4 py-3.5 text-[14px] text-white placeholder-zinc-600 outline-none focus:shadow-[0_0_0_1.5px_rgba(167,139,250,0.5)] transition-shadow"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <input
              type="date"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded-xl px-4 py-3.5 text-[14px] text-white outline-none focus:shadow-[0_0_0_1.5px_rgba(167,139,250,0.5)] transition-shadow"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", colorScheme: "dark" }}
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-400 bg-red-500/[0.08] rounded-xl px-3 py-2.5 border border-red-500/20 leading-snug">
              {error}
            </p>
          )}

          {/* Save */}
          <motion.button
            onClick={handleSave}
            disabled={!name.trim() || !birthday || saving}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 rounded-2xl font-black text-[13px] tracking-widest uppercase text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.4)" }}
          >
            {saving
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  Saving…
                </span>
              : "Save Profile"}
          </motion.button>

          {/* Skip */}
          <button
            onClick={onSkip}
            className="text-center text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors py-1"
          >
            Skip for now — I&apos;ll do this later
          </button>

        </div>
      </div>
    </BottomSheet>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();

  // ── Auth guard ───────────────────────────────────────────────────────────────
  const [session,     setSession]     = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      setSession(session);
      userIdRef.current = session.user.id;

      // Silently check profile completeness — used to trigger post-scan profile modal.
      // Errors (e.g. table not yet created) are treated as complete to avoid blocking the app.
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, birthday")
        .eq("id", session.user.id)
        .maybeSingle();

      profileCompleteRef.current = !!(profile?.name && profile?.birthday);
      setAuthChecked(true);
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      if (!s) router.push("/login");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    // onAuthStateChange handles the redirect
  }, []);

  const [activeTab,   setActiveTab]   = useState<NavTab>("home");
  const [scanning,    setScanning]    = useState(false);
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [showResult,  setShowResult]  = useState(false);
  const [scannedFile, setScannedFile] = useState<ScannedFile | null>(null);
  const [receiptData, setReceiptData] = useState<ExtractedReceipt | null>(null);
  const [scanError,   setScanError]   = useState<string | null>(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const { data: dashData, loading: dashLoading } = useDashboardData(refreshKey);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const profileCompleteRef = useRef(true);
  const userIdRef          = useRef<string | null>(null);

  const progressDone = useRef(false);
  const apiDone      = useRef(false);
  const scanErrorRef = useRef<string | null>(null);
  const resultRef    = useRef<AnalysisResult | null>(null);
  const finishRef    = useRef<() => void>(() => {});

  const finishScan = useCallback(() => {
    setScanning(false);
    if (resultRef.current) { setResult(resultRef.current); setShowResult(true); }
  }, []);
  finishRef.current = finishScan;

  const handleProgressDone = useCallback(() => {
    progressDone.current = true;
    if (apiDone.current && !scanErrorRef.current) finishRef.current();
  }, []);

  useEffect(() => {
    if (!scanning) return;
    progressDone.current = false;
    apiDone.current      = false;
    scanErrorRef.current = null;
    resultRef.current    = null;
    setScanError(null);

    const run = async () => {
      let ok = false;
      try {
        let extracted: ExtractedReceipt | null = null;
        if (scannedFile?.base64) {
          const res = await fetch("/api/upload-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageBase64: scannedFile.base64 }) });
          const upd = await res.json();
          if (!res.ok || upd.error) throw new Error(upd.error ?? `Upload failed (${res.status})`);
          extracted = upd as ExtractedReceipt;
          setReceiptData(extracted);
        }
        const ar  = await fetch("/api/analyze-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: extracted?.items ?? null }) });
        const raw = await ar.json();
        if (!ar.ok || raw.error)  throw new Error(raw.error ?? `Analysis failed (${ar.status})`);
        if (!raw.categories)      throw new Error("Analysis returned unexpected format.");
        resultRef.current = raw as AnalysisResult;
        setResult(raw as AnalysisResult);
        ok = true;
        saveScanToDb(extracted, raw as AnalysisResult, scannedFile?.base64).catch(err => console.error("[scan] Supabase save FAILED:", err));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Scan failed. Please try again.";
        console.error("[scan] pipeline error:", err);
        scanErrorRef.current = msg;
        setScanError(msg);
      } finally {
        apiDone.current = true;
        if (ok && progressDone.current) finishRef.current();
      }
    };
    run();
  }, [scanning, scannedFile]);

  const handleScan        = useCallback((file: ScannedFile) => { if (scanning) return; setScannedFile(file); setReceiptData(null); setScanError(null); setScanning(true); }, [scanning]);
  const handleRetry       = useCallback(() => { setScanning(false); setScanError(null); setScannedFile(null); }, []);
  const handleCloseResult = useCallback(() => {
    setShowResult(false);
    setRefreshKey(k => k + 1);
    if (!profileCompleteRef.current) setShowProfileModal(true);
  }, []);
  const handleViewHistory = useCallback(() => setActiveTab("history"), []);
  const handleViewResult  = useCallback((r: AnalysisResult) => { setResult(r); setShowResult(true); }, []);

  const handleSaveProfile = useCallback(async (name: string, birthday: string) => {
    if (!userIdRef.current) return;
    await supabase.from("profiles").upsert({ id: userIdRef.current, name, birthday });
    profileCompleteRef.current = true;
    setShowProfileModal(false);
  }, []);

  const handleSkipProfile = useCallback(() => setShowProfileModal(false), []);

  // Show spinner while checking session (prevents flash of dashboard before redirect)
  if (!authChecked) {
    return (
      <div className="h-[100dvh] flex items-center justify-center" style={NAVY}>
        <div className="w-8 h-8 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Session confirmed — render dashboard
  void session; // used for logout trigger via onAuthStateChange

  return (
    <div className="h-[100dvh] text-white font-sans flex flex-col overflow-hidden" style={NAVY}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <CityBackground opacity={0.22}/>
      </div>

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex-1 flex flex-col overflow-hidden">
            {activeTab === "home"      && <Dashboard data={dashData} loading={dashLoading} onScan={handleScan} />}
            {activeTab === "analytics" && <AnalyticsTab />}
            {activeTab === "shopping"  && <ShoppingTab />}
            {activeTab === "rewards"   && <RewardsTab />}
            {activeTab === "history"   && <HistoryTab onViewResult={handleViewResult} />}
            {activeTab === "settings"  && <SettingsTab onLogout={handleLogout} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <BottomNav active={activeTab} onTabChange={setActiveTab} />
      </div>

      <AnimatePresence>
        {scanning && (
          <motion.div className="fixed inset-0 z-40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}>
            <Scan onProgressDone={handleProgressDone} filename={scannedFile?.name} error={scanError} onRetry={handleRetry} />
          </motion.div>
        )}
      </AnimatePresence>

      <ResultModal
        open={showResult && !!result}
        data={result ?? FALLBACK}
        receipt={receiptData}
        onClose={handleCloseResult}
      />

      <ProfileModal
        open={showProfileModal}
        onSave={handleSaveProfile}
        onSkip={handleSkipProfile}
      />
    </div>
  );
}
