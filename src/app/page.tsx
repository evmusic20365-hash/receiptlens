"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────
const RING_R = 72;
const RING_C = 2 * Math.PI * RING_R;

const SCAN_STEPS = [
  "Reading receipt...",
  "Cross-referencing prices...",
  "Finding better deals...",
  "Case report ready.",
] as const;

const NAVY: React.CSSProperties = {
  background: "linear-gradient(160deg, #0a0e1a 0%, #131832 100%)",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScannedFile   { name: string; base64: string; }
interface ReceiptItem   { name: string; price: number; quantity: number; }
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
interface DashboardData {
  avgScore: number;
  totalSavings: number;
  receiptsScanned: number;
  recentCases: HistoryScan[];
  storeRankings: StoreRanking[];
  streak: number;
  insight: string;
}

type NavTab = "home" | "history" | "settings";

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
  if (topCat && topCat[1] >= 2) {
    return `${topCat[0]} is your biggest savings opportunity — you're consistently overpaying.`;
  }

  const allAnalyses = scans.flatMap(s => s.analyses ?? []);
  const avg = allAnalyses.length
    ? Math.round(allAnalyses.reduce((s, a) => s + a.score, 0) / allAnalyses.length)
    : 0;
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
          ? Math.round(allAnalyses.reduce((s, a) => s + (a.score ?? 0), 0) / allAnalyses.length)
          : 0;

        const storeMap: Record<string, number[]> = {};
        for (const scan of scans) {
          const name  = scan.store_name?.trim();
          const score = scan.analyses?.[0]?.score;
          if (name && score != null) {
            if (!storeMap[name]) storeMap[name] = [];
            storeMap[name].push(score);
          }
        }
        const storeRankings: StoreRanking[] = Object.entries(storeMap)
          .map(([name, scores]) => ({
            name,
            avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
            count: scores.length,
          }))
          .sort((a, b) => b.avgScore - a.avgScore)
          .slice(0, 3);

        const streak  = computeStreak(scans);
        const insight = computeInsight(scans, storeRankings);

        setData({ avgScore, totalSavings, receiptsScanned: scans.length, recentCases: scans.slice(0, 3), storeRankings, streak, insight });
        setLoading(false);
      });
  }, [refreshKey]);

  return { data, loading };
}

// ── DB ────────────────────────────────────────────────────────────────────────
async function saveScanToDb(
  receipt: ExtractedReceipt | null,
  analysis: AnalysisResult,
  imageBase64?: string,
) {
  console.log("[saveScanToDb] starting — store:", receipt?.storeName, "| score:", analysis.score, "| savings:", analysis.totalSavings);
  console.log("[saveScanToDb] Supabase URL defined:", !!process.env.NEXT_PUBLIC_SUPABASE_URL, "| Key defined:", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const receiptRow = {
    store_name:   receipt?.storeName   ?? null,
    receipt_date: receipt?.date        ?? null,
    items:        receipt?.items       ?? null,
    total:        receipt?.total       ?? null,
    image_base64: imageBase64          ?? null,
  };
  console.log("[saveScanToDb] inserting receipt row:", { ...receiptRow, image_base64: receiptRow.image_base64 ? "(truncated)" : null });

  const { data, error } = await supabase
    .from("receipts")
    .insert(receiptRow)
    .select("id")
    .single();

  if (error) {
    console.error("[saveScanToDb] receipts INSERT failed:", error.message, "| code:", error.code, "| details:", error.details, "| hint:", error.hint);
    throw error;
  }
  console.log("[saveScanToDb] receipt saved, id:", data.id);

  const analysisRow = {
    receipt_id:       data.id,
    leaks:            analysis.categories,
    total_found:      analysis.totalSavings,
    yearly_potential: analysis.yearlySavings,
    score:            analysis.score,
  };
  console.log("[saveScanToDb] inserting analysis row:", { ...analysisRow, leaks: `[${analysisRow.leaks.length} categories]` });

  const { error: aErr } = await supabase.from("analyses").insert(analysisRow);
  if (aErr) {
    console.error("[saveScanToDb] analyses INSERT failed:", aErr.message, "| code:", aErr.code, "| details:", aErr.details, "| hint:", aErr.hint);
    throw aErr;
  }
  console.log("[saveScanToDb] analysis saved successfully ✓");
}

// ── Spy illustration ──────────────────────────────────────────────────────────
function SpyCharacter({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M66 74 C66 44 78 20 100 18 C122 20 134 44 134 74" fill="#111" />
      <ellipse cx="100" cy="76" rx="58" ry="13" fill="#111" />
      <path d="M68 66 Q100 60 132 66" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round" />
      <path d="M80 44 Q100 38 120 44" stroke="#222" strokeWidth="1.5" fill="none" />
      <ellipse cx="100" cy="112" rx="36" ry="40" fill="#fde8c8" stroke="#111" strokeWidth="2.5" />
      <ellipse cx="84" cy="104" rx="10" ry="11" fill="white" stroke="#111" strokeWidth="2" />
      <circle cx="87" cy="106" r="5.5" fill="#111" /><circle cx="89" cy="104" r="2" fill="white" />
      <ellipse cx="116" cy="104" rx="10" ry="11" fill="white" stroke="#111" strokeWidth="2" />
      <circle cx="119" cy="106" r="5.5" fill="#111" /><circle cx="121" cy="104" r="2" fill="white" />
      <path d="M75 91 Q84 86 93 91" stroke="#7c5c38" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M107 91 Q116 86 125 91" stroke="#7c5c38" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M97 118 Q100 123 103 118" stroke="#c4956a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M87 129 Q96 135 108 128" stroke="#111" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M106 128 Q111 124 109 130" stroke="#111" strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="93" y="149" width="14" height="10" fill="#fde8c8" />
      <path d="M85 155 L100 164 L115 155" fill="#f3f4f6" stroke="#111" strokeWidth="1.5" />
      <path d="M100 162 L96 180 L100 190 L104 180 Z" fill="#8b5cf6" stroke="#111" strokeWidth="1.5" />
      <ellipse cx="100" cy="164" rx="5" ry="4" fill="#7c3aed" stroke="#111" strokeWidth="1.5" />
      <path d="M60 158 L140 158 L152 238 H48 Z" fill="#1e2535" stroke="#111" strokeWidth="2.5" />
      <path d="M100 162 L77 180 L64 210" stroke="#d1d5db" strokeWidth="2" fill="none" />
      <path d="M100 162 L123 180 L136 210" stroke="#d1d5db" strokeWidth="2" fill="none" />
      <rect x="50" y="200" width="100" height="10" rx="4" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
      <rect x="91" y="198" width="18" height="14" rx="3" fill="#6b7280" stroke="#4b5563" strokeWidth="1.5" />
      <rect x="95" y="202" width="10" height="6" rx="1.5" fill="#4b5563" />
      <circle cx="100" cy="220" r="3" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
      <circle cx="100" cy="234" r="3" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
      <path d="M64 168 L38 218" stroke="#1e2535" strokeWidth="18" strokeLinecap="round" />
      <ellipse cx="36" cy="221" rx="10" ry="9" fill="#fde8c8" stroke="#111" strokeWidth="2" />
      <path d="M136 168 L160 140" stroke="#1e2535" strokeWidth="18" strokeLinecap="round" />
      <ellipse cx="162" cy="138" rx="9" ry="10" fill="#fde8c8" stroke="#111" strokeWidth="2" />
      <circle cx="174" cy="116" r="27" fill="rgba(139,92,246,0.08)" stroke="#111" strokeWidth="3.5" />
      <circle cx="174" cy="116" r="22" fill="none" stroke="#374151" strokeWidth="1" />
      <path d="M161 105 Q170 99 181 103" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <line x1="193" y1="135" x2="200" y2="152" stroke="#8b5cf6" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="80" cy="239" rx="18" ry="7" fill="#0f172a" stroke="#111" strokeWidth="1.5" />
      <ellipse cx="120" cy="239" rx="18" ry="7" fill="#0f172a" stroke="#111" strokeWidth="1.5" />
    </svg>
  );
}

// ── Bottom Nav (3 tabs) ───────────────────────────────────────────────────────
function BottomNav({ active, onTabChange }: { active: NavTab; onTabChange: (t: NavTab) => void }) {
  const tabs: { key: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "home", label: "Home",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9,22 9,12 15,12 15,22" />
        </svg>
      ),
    },
    {
      key: "history", label: "History",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      ),
    },
    {
      key: "settings", label: "Settings",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="border-t border-white/[0.06] grid grid-cols-3 flex-shrink-0"
      style={{ background: "rgba(10,14,26,0.88)", backdropFilter: "blur(20px)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`py-3 flex flex-col items-center gap-1 text-[10px] font-semibold tracking-wide transition-all
              ${isActive ? "text-violet-400 drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]" : "text-zinc-600 hover:text-zinc-400"}`}
          >
            {tab.icon}
            {tab.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ── Scan overlay ──────────────────────────────────────────────────────────────
function Scan({ onProgressDone, filename, error, onRetry }: { onProgressDone: () => void; filename?: string; error?: string | null; onRetry?: () => void }) {
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
    <div className="min-h-screen text-white font-sans flex flex-col" style={NAVY}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 bg-violet-600/[0.07] rounded-full blur-[80px]" />
      </div>
      <div className="relative px-6 pt-14 pb-4 flex items-end justify-between border-b border-white/[0.06]">
        <h1 className="text-lg font-black tracking-tight">RECEIPT DETECTIVE</h1>
        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">{error ? "Error" : "On The Case"}</span>
      </div>
      <div className="relative flex-1 flex flex-col items-center justify-center px-6 gap-8">
        <SpyCharacter className="w-28 h-auto opacity-90" />
        <div className="w-full max-w-sm space-y-5">
          {error ? (
            <>
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-[0.2em] mb-2">Investigation Failed</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{error}</p>
              </div>
              {onRetry && (
                <button onClick={onRetry} className="w-full bg-white/[0.05] border border-white/10 hover:bg-white/[0.08] text-zinc-300 py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-colors">
                  TRY AGAIN
                </button>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-3">Status</p>
                <div className="h-6 overflow-hidden">
                  <p key={step} className="text-base font-semibold text-white animate-[fade-up_0.22s_ease-out_forwards]">{SCAN_STEPS[step]}</p>
                </div>
                {filename && <p className="text-[11px] text-zinc-600 font-mono mt-2 truncate">📎 {filename}</p>}
              </div>
              <div className="space-y-2">
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]" style={{ width: `${progress}%`, background: "linear-gradient(90deg, #7c3aed, #8b5cf6)" }} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">Progress</span>
                  <span className="text-sm font-bold text-violet-400 tabular-nums">{progress}%</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────────────
function CategoryCard({ category, index }: { category: Category; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const sr = category.savingsRange;
  const hasSavings   = sr && (sr.min > 0 || sr.max > 0);
  const savingsLabel = hasSavings
    ? sr!.min === sr!.max ? `${fmtSavings(sr!.min)}/mo` : `${fmtSavings(sr!.min)}–${fmtSavings(sr!.max)}/mo`
    : null;

  return (
    <div
      className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
      style={{ animation: `cardIn 0.55s cubic-bezier(0.34,1.56,0.64,1) ${300 + index * 110}ms both` }}
    >
      <button className="w-full flex items-center gap-4 px-4 py-4 text-left active:bg-white/[0.03] transition-colors" onClick={() => setExpanded(e => !e)}>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`w-4 h-4 text-zinc-600 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      <div style={{ maxHeight: expanded ? "900px" : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden" }}>
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
      </div>
    </div>
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
            : <span className="text-[24px] font-black leading-none text-zinc-700">—</span>
          }
        </div>
      </div>
      <p className="text-[9px] font-bold tracking-[0.18em] text-zinc-600 uppercase">Avg Score</p>
    </>
  );
}

// ── Result modal (slide-up sheet) ─────────────────────────────────────────────
function ResultModal({ data, receipt, onClose }: { data: AnalysisResult; receipt: ExtractedReceipt | null; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const scoreVal   = useCountUp(data.score,        1200, 300);
  const savingsVal = useCountUp(data.totalSavings,  1300, 400);
  const yearlyVal  = useCountUp(data.yearlySavings, 1500, 400);

  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);

  const dashOffset   = mounted ? RING_C * (1 - scoreVal / 100) : RING_C;
  const scoreBadge   = scoreVal >= 75 ? "text-green-400 bg-green-500/10 border-green-500/25" : scoreVal >= 55 ? "text-amber-400 bg-amber-500/10 border-amber-500/25" : "text-red-400 bg-red-500/10 border-red-500/25";
  const scoreLabel   = scoreVal >= 75 ? "Good Shape" : scoreVal >= 55 ? "Needs Improvement" : "High Risk";
  const glowColor    = scoreVal >= 70 ? "radial-gradient(circle, rgba(34,197,94,0.18), transparent)" : scoreVal >= 45 ? "radial-gradient(circle, rgba(245,158,11,0.18), transparent)" : "radial-gradient(circle, rgba(239,68,68,0.18), transparent)";

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-300" style={{ opacity: mounted ? 1 : 0 }} onClick={onClose} />
      <div
        className="relative z-10 flex flex-col rounded-t-[28px] overflow-hidden border-t border-white/[0.08]"
        style={{ ...NAVY, maxHeight: "92vh", transform: mounted ? "translateY(0)" : "translateY(100%)", transition: "transform 0.45s cubic-bezier(0.32,0.72,0,1)" }}
      >
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
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        {/* Scrollable content */}
        <div className="relative z-10 flex-1 overflow-y-auto">
          <div className="px-5 py-5 space-y-4 max-w-sm mx-auto pb-8">
            {/* Score ring */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col items-center">
              <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-5">Price Efficiency Score</p>
              <div className="relative w-[212px] h-[212px]">
                <div className="absolute inset-10 rounded-full blur-3xl transition-all duration-1000" style={{ background: glowColor }} />
                <svg width="212" height="212" viewBox="0 0 212 212" className="-rotate-90">
                  <defs>
                    <linearGradient id="modalRingGrad" x1="106" y1="24" x2="106" y2="188" gradientUnits="userSpaceOnUse">
                      <stop offset="0%"   stopColor="#ef4444" /><stop offset="45%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#22c55e" />
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
              <div className={`mt-4 border rounded-full px-4 py-1.5 flex items-center gap-2 ${scoreBadge}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                <span className="text-xs font-bold">{scoreLabel}</span>
              </div>
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
            {/* Receipt */}
            {receipt && (
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-2">Receipt</p>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black text-white leading-none truncate">{receipt.storeName || "Unknown Store"}</p>
                    <p className="text-xs text-zinc-500 mt-1">{receipt.date} · {receipt.items.length} item{receipt.items.length !== 1 ? "s" : ""}</p>
                  </div>
                  <p className="text-lg font-black tabular-nums flex-shrink-0">${typeof receipt.total === "number" ? receipt.total.toFixed(2) : "—"}</p>
                </div>
              </div>
            )}
            {/* Categories */}
            <div>
              <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-3">Price Intelligence</p>
              <div className="space-y-3">
                {data.categories.map((cat, i) => <CategoryCard key={cat.name + i} category={cat} index={i} />)}
              </div>
            </div>
            {/* Summary */}
            <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-5">
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
            <button onClick={onClose} className="w-full py-[18px] rounded-2xl font-bold text-sm tracking-widest uppercase text-white hover:opacity-90 active:opacity-80 transition-opacity"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.35)" }}>
              CLOSE CASE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard (Home tab) ──────────────────────────────────────────────────────
function Dashboard({
  data, loading, onScan, onViewHistory, onViewResult,
}: {
  data: DashboardData | null; loading: boolean;
  onScan: (f: ScannedFile) => void; onViewHistory: () => void; onViewResult: (r: AnalysisResult) => void;
}) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const cbRef    = useRef(onScan);
  cbRef.current  = onScan;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cbRef.current({ name: file.name, base64: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const isEmpty = !loading && (data?.receiptsScanned ?? 0) === 0;
  const rank    = data?.avgScore != null ? detectiveRank(data.avgScore) : null;
  const streak  = data?.streak ?? 0;
  const MEDALS  = ["🥇", "🥈", "🥉"] as const;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-5 pt-3 pb-8 space-y-4 max-w-sm mx-auto">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

        {/* ① Greeting */}
        <div
          className="flex items-center gap-2 min-h-[36px]"
          style={{ animation: "cardIn 0.4s ease-out 0ms both" }}
        >
          <span className="text-[17px] font-black text-white leading-none">Hey Detective 🕵️</span>
          {rank && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${scorePillClass(data!.avgScore)}`}>
              {rank}
            </span>
          )}
          <div className="flex-1" />
          {streak > 0 && (
            <span className="text-sm font-black text-orange-400 flex-shrink-0">{streak}🔥</span>
          )}
        </div>

        {/* ② SCAN NOW hero */}
        <div className="relative" style={{ animation: "cardIn 0.55s cubic-bezier(0.34,1.56,0.64,1) 80ms both" }}>
          {/* Pulsing glow ring */}
          <div
            className="absolute -inset-[5px] rounded-[30px] animate-pulse pointer-events-none"
            style={{ background: "linear-gradient(135deg, rgba(109,40,217,0.5), rgba(167,139,250,0.4))", filter: "blur(12px)" }}
          />
          {/* Gradient border */}
          <div className="relative p-[1.5px] rounded-[26px] overflow-hidden">
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #6d28d9, #a78bfa, #6d28d9)" }} />
            <button
              onClick={() => fileRef.current?.click()}
              className="relative w-full rounded-[25px] flex flex-col items-center justify-center gap-5 active:scale-[0.985] transition-transform select-none"
              style={{ background: "linear-gradient(160deg, #0f1225 0%, #131832 100%)", minHeight: "38vh", padding: "2.5rem 1.5rem" }}
            >
              {/* Camera icon */}
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ background: "rgba(109,40,217,0.18)", border: "1.5px solid rgba(167,139,250,0.35)" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="w-12 h-12 text-violet-400">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
              <div className="text-center space-y-2">
                <p className="text-[28px] font-black text-white leading-none tracking-tight">Scan Receipt</p>
                <p className="text-zinc-500 text-sm leading-snug">
                  {isEmpty ? "Start your first investigation" : "Tap to investigate your prices"}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* ③ Widget grid — always visible */}
        <div
          className="grid grid-cols-2 gap-3"
          style={{ animation: "cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 160ms both" }}
        >
          {/* Total Saved */}
          <div
            className="aspect-square rounded-3xl p-4 flex flex-col justify-between overflow-hidden"
            style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.18)", backdropFilter: "blur(20px)" }}
          >
            <p className="text-[9px] font-bold tracking-[0.18em] text-green-500/60 uppercase">Total Saved</p>
            <div>
              <p className="text-[30px] font-black tabular-nums text-green-400 leading-none">
                <CountUpValue target={data?.totalSavings ?? 0} prefix="$" />
              </p>
              <p className="text-[10px] text-green-500/40 mt-1 font-medium">lifetime</p>
            </div>
          </div>

          {/* Cases Solved */}
          <div
            className="aspect-square rounded-3xl p-4 flex flex-col justify-between overflow-hidden"
            style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.18)", backdropFilter: "blur(20px)" }}
          >
            <p className="text-[9px] font-bold tracking-[0.18em] text-violet-500/60 uppercase">Cases Solved</p>
            <div>
              <p className="text-[46px] font-black tabular-nums text-violet-400 leading-none">
                <CountUpValue target={data?.receiptsScanned ?? 0} round />
              </p>
              <p className="text-[10px] text-violet-500/40 mt-1 font-medium">receipts</p>
            </div>
          </div>

          {/* Avg Score */}
          <div
            className="aspect-square rounded-3xl flex flex-col items-center justify-center gap-2 overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(20px)" }}
          >
            <AvgScoreWidget
              score={data?.avgScore ?? 0}
              hasData={!!data && data.receiptsScanned > 0}
            />
          </div>

          {/* Streak */}
          <div
            className="aspect-square rounded-3xl p-4 flex flex-col justify-between overflow-hidden"
            style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.18)", backdropFilter: "blur(20px)" }}
          >
            <p className="text-[9px] font-bold tracking-[0.18em] text-orange-500/60 uppercase">Streak</p>
            <div>
              <div className="flex items-end gap-1.5">
                <span className="text-[26px] leading-none">🔥</span>
                <span className="text-[40px] font-black tabular-nums text-orange-400 leading-none">
                  {data?.streak ?? 0}
                </span>
              </div>
              <p className="text-[10px] text-orange-500/40 mt-1 font-medium">day streak</p>
            </div>
          </div>
        </div>

        {/* ④ Store Rankings — always visible */}
        <div
          className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
          style={{ animation: "cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 240ms both" }}
        >
          <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase px-4 pt-4 pb-2">Store Rankings</p>
          {(!data || data.receiptsScanned === 0) ? (
            <div className="px-4 pb-4 pt-1 flex items-center gap-3 opacity-40">
              <span className="text-lg">🏆</span>
              <span className="text-xs text-zinc-500 italic">Scan receipts to unlock store rankings</span>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {MEDALS.map((medal, i) => {
                const store = data.storeRankings[i];
                if (!store) return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 opacity-40">
                    <span className="text-lg">{medal}</span>
                    <span className="text-xs text-zinc-600 italic">Scan more to unlock</span>
                  </div>
                );
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-lg flex-shrink-0">{medal}</span>
                    <span className="flex-1 text-sm font-bold text-white truncate">{store.name}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${scorePillClass(store.avgScore)}`}>
                      {store.avgScore}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ⑤ Recent Cases — always visible */}
        <div
          className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
          style={{ animation: "cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 320ms both" }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase">Recent Cases</p>
            {data && data.receiptsScanned > 0 && (
              <button onClick={onViewHistory} className="text-[11px] font-bold text-violet-400 hover:text-violet-300 transition-colors">
                View All →
              </button>
            )}
          </div>
          {(!data || data.recentCases.length === 0) ? (
            <div className="px-4 pb-4 pt-1 opacity-40">
              <p className="text-xs text-zinc-500 italic">No cases yet — scan your first receipt above</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {data.recentCases.map((scan) => {
                const analysis = scan.analyses?.[0];
                return (
                  <button
                    key={scan.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
                    onClick={() => analysis && onViewResult(analysisFromDb(analysis))}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{scan.store_name || "Unknown Store"}</p>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {new Date(scan.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    {analysis && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-green-400 tabular-nums">+${Number(analysis.total_found).toFixed(2)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scorePillClass(analysis.score)}`}>{analysis.score}</span>
                      </div>
                    )}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 text-zinc-700 flex-shrink-0">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ⑥ Smart Insight — always visible */}
        <div
          className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex gap-3 items-start"
          style={{ animation: "cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 400ms both" }}
        >
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center flex-shrink-0 text-base leading-none">
            💡
          </div>
          <div>
            <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Smart Insight</p>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {data?.insight ?? "Scan 3+ receipts to unlock personalized insights."}
            </p>
          </div>
        </div>
      </div>
    </div>
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
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <SpyCharacter className="w-20 h-auto opacity-30" />
      <p className="text-zinc-400 font-bold">No cases yet.</p>
      <p className="text-zinc-600 text-sm">Scan your first receipt on the Home tab.</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-5 pt-3 pb-6 space-y-3 max-w-sm mx-auto">
        <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase">All Cases · {scans.length}</p>
        {scans.map((scan) => {
          const analysis = scan.analyses?.[0];
          return (
            <button
              key={scan.id}
              className="w-full bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-left hover:bg-white/[0.07] active:bg-white/[0.09] transition-colors"
              onClick={() => analysis && onViewResult(analysisFromDb(analysis))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate">{scan.store_name || "Unknown Store"}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {new Date(scan.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
                {analysis && (
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-black tabular-nums leading-none ${scorePillClass(analysis.score).split(" ")[0]}`}>{analysis.score}</p>
                    <p className="text-[10px] text-zinc-600">/100</p>
                  </div>
                )}
              </div>
              {analysis && (
                <div className="flex justify-between mt-3 pt-3 border-t border-white/[0.06]">
                  <span className="text-xs text-zinc-500">Savings found</span>
                  <span className="text-xs font-bold text-violet-400 tabular-nums">${Number(analysis.total_found).toFixed(2)}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-sm font-medium text-zinc-300">{label}</span>
      <button onClick={() => onChange(!value)} className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0 ${value ? "bg-violet-500" : "bg-zinc-700"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${value ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function SettingsTab() {
  const [notif, setNotif] = useState(true);
  const [dark,  setDark]  = useState(true);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-5 pt-3 pb-6 space-y-4 max-w-sm mx-auto">
        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/[0.06]" style={{ animation: "cardIn 0.5s ease-out 0ms both" }}>
          <ToggleRow label="Notifications" value={notif} onChange={setNotif} />
          <ToggleRow label="Dark Mode"     value={dark}  onChange={setDark}  />
        </div>
        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/[0.06]" style={{ animation: "cardIn 0.5s ease-out 100ms both" }}>
          <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase px-4 pt-4 pb-2">About</p>
          {[["App", "Receipt Detective"], ["Version", "1.0.0"], ["Powered by", "Claude AI"]].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center px-4 py-3.5">
              <span className="text-sm text-zinc-500">{label}</span>
              <span className="text-sm font-bold text-zinc-300">{value}</span>
            </div>
          ))}
        </div>
        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4" style={{ animation: "cardIn 0.5s ease-out 200ms both" }}>
          <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-2">Legal</p>
          <p className="text-xs text-zinc-600 leading-relaxed">Price comparisons are estimates only. Receipt Detective is not affiliated with any retailers. Always verify prices before purchasing.</p>
        </div>
      </div>
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTab,   setActiveTab]   = useState<NavTab>("home");
  const [scanning,    setScanning]    = useState(false);
  const [result,      setResult]      = useState<AnalysisResult | null>(null);
  const [showResult,  setShowResult]  = useState(false);
  const [scannedFile, setScannedFile] = useState<ScannedFile | null>(null);
  const [receiptData, setReceiptData] = useState<ExtractedReceipt | null>(null);
  const [scanError,   setScanError]   = useState<string | null>(null);
  const [refreshKey,  setRefreshKey]  = useState(0);

  const { data: dashData, loading: dashLoading } = useDashboardData(refreshKey);

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
  const handleCloseResult = useCallback(() => { setShowResult(false); setRefreshKey(k => k + 1); }, []);
  const handleViewHistory = useCallback(() => setActiveTab("history"), []);
  const handleViewResult  = useCallback((r: AnalysisResult) => { setResult(r); setShowResult(true); }, []);

  const tabSubtitle: Record<NavTab, string> = {
    home:     "Your price intelligence agency",
    history:  "Case files",
    settings: "Configuration",
  };

  return (
    <div className="min-h-screen text-white font-sans flex flex-col" style={NAVY}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-indigo-600/[0.04] rounded-full blur-[90px]" />
      </div>

      <div className="relative z-10 px-5 pt-12 pb-3 flex-shrink-0 border-b border-white/[0.05]">
        <h1 className="text-[22px] font-black tracking-tight leading-none">RECEIPT DETECTIVE</h1>
        <p className="text-zinc-600 text-xs mt-1 font-medium">{tabSubtitle[activeTab]}</p>
      </div>

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {activeTab === "home"     && <Dashboard data={dashData} loading={dashLoading} onScan={handleScan} onViewHistory={handleViewHistory} onViewResult={handleViewResult} />}
        {activeTab === "history"  && <HistoryTab onViewResult={handleViewResult} />}
        {activeTab === "settings" && <SettingsTab />}
      </div>

      <div className="relative z-10 flex-shrink-0">
        <BottomNav active={activeTab} onTabChange={setActiveTab} />
      </div>

      {scanning && (
        <div className="fixed inset-0 z-40">
          <Scan onProgressDone={handleProgressDone} filename={scannedFile?.name} error={scanError} onRetry={handleRetry} />
        </div>
      )}

      {showResult && result && (
        <ResultModal data={result ?? FALLBACK} receipt={receiptData} onClose={handleCloseResult} />
      )}
    </div>
  );
}
