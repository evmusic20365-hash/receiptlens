"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// ── Constants ────────────────────────────────────────────────────────────────
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

// ── Types ────────────────────────────────────────────────────────────────────
interface ScannedFile {
  name: string;
  base64: string;
}

interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

interface ExtractedReceipt {
  storeName: string;
  date: string;
  items: ReceiptItem[];
  total: number;
}

interface AnalysisItem {
  name: string;
  paid: number;
  suggestion: string;
  cheaperStore?: string;
  cheaperPrice?: number;
  searchUrl?: string;
}

interface Category {
  emoji: string;
  name: string;
  rating: "green" | "yellow" | "red";
  items: AnalysisItem[];
  savingsRange?: { min: number; max: number };
}

interface AnalysisResult {
  score: number;
  categories: Category[];
  totalSavings: number;
  yearlySavings: number;
}

interface DbAnalysis {
  id: string;
  score: number;
  leaks: Category[];
  total_found: number;
  yearly_potential: number;
}

interface HistoryScan {
  id: string;
  created_at: string;
  store_name: string | null;
  receipt_date: string | null;
  total: number | null;
  analyses: DbAnalysis[];
}

const RATING_CONFIG = {
  green:  { label: "Best Price",   pill: "text-green-400 bg-green-500/15 border-green-500/25"  },
  yellow: { label: "Check Stores", pill: "text-amber-400 bg-amber-500/15 border-amber-500/25"  },
  red:    { label: "Better Deal",  pill: "text-red-400   bg-red-500/15   border-red-500/25"     },
} as const;

const FALLBACK: AnalysisResult = {
  score: 72,
  categories: [
    {
      emoji: "🧴",
      name: "Grooming",
      rating: "red",
      savingsRange: { min: 7, max: 7 },
      items: [{
        name: "Duke Cannon Soap",
        paid: 14.99,
        suggestion: "Amazon has a 2-pack for $15.99 — that's $8 each vs $14.99. Save 47%.",
        cheaperStore: "Amazon",
        cheaperPrice: 7.99,
        searchUrl: "https://www.amazon.com/s?k=Duke+Cannon+Soap",
      }],
    },
    {
      emoji: "🥤",
      name: "Drinks",
      rating: "yellow",
      savingsRange: { min: 1, max: 3 },
      items: [{
        name: "LaCroix 12-pack",
        paid: 6.99,
        suggestion: "Walmart has this for $5.98 — saves you $1.01.",
        cheaperStore: "Walmart",
        cheaperPrice: 5.98,
        searchUrl: "https://www.walmart.com/search?q=LaCroix+Sparkling+Water+12+pack",
      }],
    },
    {
      emoji: "🥦",
      name: "Produce",
      rating: "green",
      savingsRange: { min: 0, max: 0 },
      items: [{
        name: "Organic Broccoli",
        paid: 2.49,
        suggestion: "Best price around. Case closed.",
      }],
    },
  ],
  totalSavings: 8.01,
  yearlySavings: 96,
};

type Phase  = "splash" | "scanning" | "reveal";
type NavTab = "scan"   | "progress" | "tips";

// ── Hooks ────────────────────────────────────────────────────────────────────
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

// ── Database ─────────────────────────────────────────────────────────────────
async function saveScanToDb(
  receipt: ExtractedReceipt | null,
  analysis: AnalysisResult,
  imageBase64?: string,
) {
  const { data, error } = await supabase
    .from("receipts")
    .insert({
      store_name:   receipt?.storeName   ?? null,
      receipt_date: receipt?.date        ?? null,
      items:        receipt?.items       ?? null,
      total:        receipt?.total       ?? null,
      image_base64: imageBase64          ?? null,
    })
    .select("id")
    .single();

  if (error) throw error;

  const { error: aErr } = await supabase.from("analyses").insert({
    receipt_id:       data.id,
    leaks:            analysis.categories,
    total_found:      analysis.totalSavings,
    yearly_potential: analysis.yearlySavings,
    score:            analysis.score,
  });

  if (aErr) throw aErr;
}

// ── Spy Illustration ─────────────────────────────────────────────────────────
function SpyCharacter({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M66 74 C66 44 78 20 100 18 C122 20 134 44 134 74" fill="#111" />
      <ellipse cx="100" cy="76" rx="58" ry="13" fill="#111" />
      <path d="M68 66 Q100 60 132 66" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round" />
      <path d="M80 44 Q100 38 120 44" stroke="#222" strokeWidth="1.5" fill="none" />
      <ellipse cx="100" cy="112" rx="36" ry="40" fill="#fde8c8" stroke="#111" strokeWidth="2.5" />
      <ellipse cx="84" cy="104" rx="10" ry="11" fill="white" stroke="#111" strokeWidth="2" />
      <circle cx="87" cy="106" r="5.5" fill="#111" />
      <circle cx="89" cy="104" r="2" fill="white" />
      <ellipse cx="116" cy="104" rx="10" ry="11" fill="white" stroke="#111" strokeWidth="2" />
      <circle cx="119" cy="106" r="5.5" fill="#111" />
      <circle cx="121" cy="104" r="2" fill="white" />
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

// ── Bottom Nav ───────────────────────────────────────────────────────────────
function BottomNav({
  active,
  onTabChange,
}: {
  active: NavTab;
  onTabChange?: (tab: NavTab) => void;
}) {
  const tabs: { key: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "scan",
      label: "Scan",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      key: "progress",
      label: "Progress",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      key: "tips",
      label: "Tips",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div className="border-t border-white/[0.06] grid grid-cols-3" style={{ background: "rgba(10,14,26,0.9)", backdropFilter: "blur(16px)" }}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange?.(tab.key)}
            className={`py-3 flex flex-col items-center gap-1 text-[11px] font-semibold tracking-wide transition-all
              ${isActive
                ? "text-violet-400 drop-shadow-[0_0_10px_rgba(167,139,250,0.6)]"
                : "text-zinc-600 hover:text-zinc-400"}`}
          >
            {tab.icon}
            {tab.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ── Splash ───────────────────────────────────────────────────────────────────
function Splash({
  onScan,
  onNavTab,
}: {
  onScan: (file: ScannedFile) => void;
  onNavTab?: (tab: NavTab) => void;
}) {
  const [visible, setVisible] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cbRef   = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cbRef.current({ name: file.name, base64: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="min-h-screen text-white font-sans flex flex-col" style={NAVY}>
      {/* Ambient orb */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-violet-600/[0.08] rounded-full blur-[100px]" />
      </div>

      <div className="relative px-6 pt-14">
        <h1 className="text-[26px] font-black tracking-tight leading-none">RECEIPT DETECTIVE</h1>
        <p className="text-zinc-400 text-sm mt-1.5 font-medium">Your price intelligence agency</p>
      </div>

      <div className={`relative flex-1 flex flex-col items-center justify-center py-2 transition-all duration-700 ease-out
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
        <SpyCharacter className="w-48 h-auto drop-shadow-[0_0_40px_rgba(139,92,246,0.15)]" />
      </div>

      <div className={`relative px-6 pb-4 space-y-3 transition-all duration-700 delay-150 ease-out
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full text-white py-[18px] rounded-2xl font-bold text-sm tracking-widest uppercase transition-all shadow-[0_4px_28px_rgba(139,92,246,0.4)] hover:shadow-[0_4px_36px_rgba(139,92,246,0.55)] active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
        >
          SCAN NOW
        </button>

        <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl divide-y divide-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🔍</span>
              <span className="text-sm text-zinc-300 font-medium">Price detective</span>
            </div>
            <span className="text-sm font-bold text-violet-400">On duty</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">💰</span>
              <span className="text-sm text-zinc-300 font-medium">Avg savings found</span>
            </div>
            <span className="text-sm font-black tabular-nums">$12–$40</span>
          </div>
        </div>
      </div>

      <BottomNav active="scan" onTabChange={onNavTab} />
      <div className="h-safe-bottom" />
    </div>
  );
}

// ── Scan ─────────────────────────────────────────────────────────────────────
function Scan({
  onProgressDone,
  filename,
  error,
  onRetry,
}: {
  onProgressDone: () => void;
  filename?: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [step, setStep]         = useState(0);
  const cbRef = useRef(onProgressDone);
  cbRef.current = onProgressDone;

  useEffect(() => {
    const DURATION = 2500;
    let raf: number;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(Math.max(0, now - start) / DURATION, 1);
      setProgress(Math.round(t * 100));
      if (t < 1) { raf = requestAnimationFrame(tick); }
      else { setTimeout(() => cbRef.current(), 350); }
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
        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
          {error ? "Error" : "On The Case"}
        </span>
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
                <button
                  onClick={onRetry}
                  className="w-full bg-white/[0.05] border border-white/10 hover:bg-white/[0.08] text-zinc-300 py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-colors"
                >
                  TRY AGAIN
                </button>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-3">Status</p>
                <div className="h-6 overflow-hidden">
                  <p key={step} className="text-base font-semibold text-white animate-[fade-up_0.22s_ease-out_forwards]">
                    {SCAN_STEPS[step]}
                  </p>
                </div>
                {filename && (
                  <p className="text-[11px] text-zinc-600 font-mono mt-2 truncate">📎 {filename}</p>
                )}
              </div>
              <div className="space-y-2">
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                    style={{
                      width: `${progress}%`,
                      background: "linear-gradient(90deg, #7c3aed, #8b5cf6)",
                    }}
                  />
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

      <BottomNav active="scan" />
      <div className="h-safe-bottom" />
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
function HistoryCard({ scan }: { scan: HistoryScan }) {
  const analysis = scan.analyses?.[0];
  const formattedDate = new Date(scan.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-white text-sm truncate">
            {scan.store_name || "Unknown Store"}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {scan.receipt_date || formattedDate}
          </p>
        </div>
        {analysis && (
          <div className="text-right flex-shrink-0">
            <span className="text-lg font-black tabular-nums">{analysis.score}</span>
            <span className="text-zinc-600 text-xs">/100</span>
          </div>
        )}
      </div>
      {analysis && (
        <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <span className="text-xs text-zinc-500">Savings found</span>
          <span className="text-xs font-bold text-violet-400 tabular-nums">
            ${Number(analysis.total_found).toFixed(2)}
          </span>
        </div>
      )}
      {scan.total != null && (
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-xs text-zinc-600">Receipt total</span>
          <span className="text-xs text-zinc-400 tabular-nums">${Number(scan.total).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function History({ onNavTab }: { onNavTab: (tab: NavTab) => void }) {
  const [scans, setScans]     = useState<HistoryScan[]>([]);
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

  const allAnalyses      = scans.flatMap(s => s.analyses ?? []);
  const receiptsScanned  = scans.length;
  const totalSavings     = Number(allAnalyses.reduce((sum, a) => sum + (a.total_found      ?? 0), 0).toFixed(2));
  const yearlyProjection = Math.round(allAnalyses.reduce((sum, a) => sum + (a.yearly_potential ?? 0), 0));
  const avgScore         = allAnalyses.length > 0
    ? Math.round(allAnalyses.reduce((sum, a) => sum + (a.score ?? 0), 0) / allAnalyses.length)
    : 0;

  const categoryMap: Record<string, { count: number }> = {};
  for (const a of allAnalyses) {
    for (const item of (a.leaks ?? [])) {
      const cat = item as Category;
      const key = (cat.name ?? "").trim();
      if (!key) continue;
      if (!categoryMap[key]) categoryMap[key] = { count: 0 };
      categoryMap[key].count++;
    }
  }
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 3)
    .map(([name, data]) => ({ name, ...data }));

  const trendScores = scans
    .slice(0, 7)
    .reverse()
    .map(s => s.analyses?.[0]?.score)
    .filter((s): s is number => s != null);

  const isEmpty = !loading && scans.length === 0;

  return (
    <div className="min-h-screen text-white font-sans flex flex-col" style={NAVY}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-violet-600/[0.06] rounded-full blur-[100px]" />
      </div>

      <div className="relative px-6 pt-14 pb-4 flex items-end justify-between border-b border-white/[0.06] flex-shrink-0">
        <h1 className="text-lg font-black tracking-tight">RECEIPT DETECTIVE</h1>
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest self-end">Progress</span>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="w-6 h-6 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          <div className="text-center mt-24 px-6">
            <SpyCharacter className="w-20 h-auto mx-auto mb-4 opacity-30" />
            <p className="text-zinc-400 font-bold text-sm">No cases yet.</p>
            <p className="text-zinc-600 text-xs mt-1">Scan your first receipt.</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4 max-w-sm mx-auto">

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Savings Found</p>
                <p className="text-2xl font-black tabular-nums leading-none text-violet-400">
                  ${totalSavings.toLocaleString()}
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">across all scans</p>
              </div>
              <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Yearly Potential</p>
                <p className="text-2xl font-black tabular-nums leading-none">
                  ${yearlyProjection.toLocaleString()}
                </p>
                <p className="text-[10px] text-zinc-600 mt-0.5">projection</p>
              </div>
              <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Avg Score</p>
                <div className="flex items-end gap-0.5 leading-none">
                  <p className="text-2xl font-black tabular-nums">{avgScore}</p>
                  <p className="text-zinc-600 text-xs mb-0.5">/100</p>
                </div>
                <p className="text-[10px] text-zinc-600 mt-0.5">price efficiency</p>
              </div>
              <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-1.5">Receipts</p>
                <p className="text-2xl font-black tabular-nums leading-none">{receiptsScanned}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">scanned</p>
              </div>
            </div>

            {/* Score trend */}
            {trendScores.length >= 2 && (
              <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase">Score Trend</p>
                  <span className="text-[10px] text-zinc-600">last {trendScores.length} scans</span>
                </div>
                <div className="flex items-end gap-1.5">
                  {trendScores.map((score, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-zinc-600 tabular-nums">{score}</span>
                      <div className="w-full rounded-sm bg-white/[0.06] relative" style={{ height: 48 }}>
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-sm"
                          style={{
                            height: `${score}%`,
                            background: "linear-gradient(180deg, #8b5cf6, #7c3aed)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[9px] text-zinc-700">oldest</span>
                  <span className="text-[9px] text-zinc-700">latest</span>
                </div>
              </div>
            )}

            {/* Top categories */}
            {topCategories.length > 0 && (
              <div className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl p-4">
                <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-3">
                  Top Item Categories
                </p>
                <div className="space-y-3">
                  {topCategories.map((cat, i) => (
                    <div key={cat.name} className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-zinc-700 tabular-nums w-4 flex-shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">{cat.name}</p>
                        <div className="h-1 mt-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(cat.count / topCategories[0].count) * 100}%`,
                              background: "linear-gradient(90deg, #7c3aed, #8b5cf6)",
                            }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 flex-shrink-0 tabular-nums">
                        {cat.count}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent scans */}
            <div>
              <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-3">Recent Scans</p>
              <div className="space-y-3">
                {scans.slice(0, 5).map(scan => <HistoryCard key={scan.id} scan={scan} />)}
              </div>
            </div>

          </div>
        )}
      </div>

      <BottomNav active="progress" onTabChange={onNavTab} />
      <div className="h-safe-bottom" />
    </div>
  );
}

// ── Reveal ───────────────────────────────────────────────────────────────────
function fmtSavings(n: number) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}

function CategoryCard({ category, index }: { category: Category; index: number }) {
  const [expanded, setExpanded] = useState(false);

  const sr = category.savingsRange;
  const hasSavings = sr && (sr.min > 0 || sr.max > 0);
  const savingsLabel = hasSavings
    ? sr!.min === sr!.max
      ? `${fmtSavings(sr!.min)}/mo`
      : `${fmtSavings(sr!.min)}–${fmtSavings(sr!.max)}/mo`
    : null;

  return (
    <div
      className="bg-white/[0.05] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden"
      style={{ animation: `cardIn 0.55s cubic-bezier(0.34,1.56,0.64,1) ${300 + index * 110}ms both` }}
    >
      {/* Collapsed header */}
      <button
        className="w-full flex items-center gap-4 px-4 py-4 text-left active:bg-white/[0.03] transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-14 h-14 rounded-2xl bg-white/[0.07] flex items-center justify-center flex-shrink-0"
             style={{ fontSize: "32px", lineHeight: 1 }}>
          {category.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-black text-white leading-tight" style={{ fontSize: "18px" }}>
            {category.name}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {category.items.length} item{category.items.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {savingsLabel ? (
            <span className="text-sm font-black text-green-400 tabular-nums leading-none">
              {savingsLabel}
            </span>
          ) : (
            <span className="text-xs font-bold text-green-400 leading-none">Best price</span>
          )}
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`w-4 h-4 text-zinc-600 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded items */}
      <div
        style={{
          maxHeight: expanded ? "900px" : "0",
          transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
        }}
      >
        <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
          {category.items.map((item, j) => {
            const itemSavings = item.cheaperPrice != null
              ? Math.max(0, item.paid - item.cheaperPrice)
              : 0;
            const isGreen  = !item.cheaperStore;
            const safeUrl  = item.searchUrl?.startsWith("https://") ? item.searchUrl : undefined;

            return (
              <div key={j} className="px-4 py-4 space-y-3">
                {/* Item name */}
                <p className="font-black text-white leading-snug" style={{ fontSize: "16px" }}>
                  {item.name}
                </p>

                {/* Price paid row */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    You paid
                  </span>
                  <span className="text-xl font-black tabular-nums text-white">
                    ${item.paid.toFixed(2)}
                  </span>
                </div>

                {isGreen ? (
                  <p className="text-sm font-semibold text-green-400 leading-snug">
                    ✓ Best price found. Case closed.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-zinc-300 leading-relaxed">{item.suggestion}</p>

                    {itemSavings > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                          Save
                        </span>
                        <span className="text-base font-black text-green-400 tabular-nums">
                          ${itemSavings.toFixed(2)}
                        </span>
                      </div>
                    )}

                    {item.cheaperStore && safeUrl && (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-violet-400 hover:text-violet-300 active:text-violet-500 transition-colors"
                      >
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

function Reveal({
  data,
  receipt,
  onRescan,
  onNavTab,
}: {
  data: AnalysisResult;
  receipt: ExtractedReceipt | null;
  onRescan: () => void;
  onNavTab: (tab: NavTab) => void;
}) {
  const [ready, setReady] = useState(false);
  const scoreVal   = useCountUp(data.score,        1200, 300);
  const savingsVal = useCountUp(data.totalSavings,  1300, 600);
  const yearlyVal  = useCountUp(data.yearlySavings, 1500, 600);

  useEffect(() => { setReady(true); }, []);

  const dashOffset = ready ? RING_C * (1 - scoreVal / 100) : RING_C;

  const scoreBadge =
    scoreVal >= 75 ? "text-green-400 bg-green-500/10 border-green-500/25" :
    scoreVal >= 55 ? "text-amber-400 bg-amber-500/10 border-amber-500/25" :
                     "text-red-400   bg-red-500/10   border-red-500/25";

  const scoreLabel =
    scoreVal >= 75 ? "Good Shape"        :
    scoreVal >= 55 ? "Needs Improvement" : "High Risk";

  const glowColor =
    scoreVal >= 70 ? "radial-gradient(circle, rgba(34,197,94,0.18), transparent)"  :
    scoreVal >= 45 ? "radial-gradient(circle, rgba(245,158,11,0.18), transparent)" :
                     "radial-gradient(circle, rgba(239,68,68,0.18), transparent)";

  return (
    <div className="min-h-screen text-white font-sans flex flex-col relative" style={NAVY}>
      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-violet-600/[0.06] rounded-full blur-[120px]" />
        <div className="absolute top-2/3 -left-20 w-72 h-72 bg-indigo-600/[0.04] rounded-full blur-[90px]" />
        <div className="absolute bottom-20 right-0 w-56 h-56 bg-violet-500/[0.04] rounded-full blur-[80px]" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        {/* Header */}
        <div className="px-6 pt-14 pb-4 flex items-center justify-between border-b border-white/[0.06] flex-shrink-0">
          <h1 className="text-lg font-black tracking-tight">RECEIPT DETECTIVE</h1>
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-violet-400">
              <path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Case File</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 space-y-4 max-w-sm mx-auto">

            {/* Score ring */}
            <div
              className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-3xl p-6 flex flex-col items-center"
              style={{ animation: "cardIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0ms both" }}
            >
              <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-5">
                Price Efficiency Score
              </p>

              <div className="relative w-[212px] h-[212px]">
                <div
                  className="absolute inset-10 rounded-full blur-3xl transition-all duration-1000"
                  style={{ background: glowColor }}
                />
                <svg width="212" height="212" viewBox="0 0 212 212" className="-rotate-90">
                  <defs>
                    <linearGradient id="ringGrad" x1="106" y1="24" x2="106" y2="188" gradientUnits="userSpaceOnUse">
                      <stop offset="0%"   stopColor="#ef4444" />
                      <stop offset="45%"  stopColor="#f59e0b" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                  </defs>
                  <circle cx="106" cy="106" r={RING_R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="11" />
                  <circle
                    cx="106" cy="106" r={RING_R}
                    fill="none"
                    stroke="url(#ringGrad)"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={dashOffset}
                    style={{ transition: ready ? "stroke-dashoffset 1.3s cubic-bezier(0.33,1,0.68,1)" : "none" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                  <span className="text-[54px] font-black tabular-nums leading-none">{scoreVal}</span>
                  <span className="text-zinc-600 text-xs font-semibold tracking-widest uppercase">out of 100</span>
                </div>
              </div>

              <div className={`mt-4 border rounded-full px-4 py-1.5 flex items-center gap-2 ${scoreBadge}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                <span className="text-xs font-bold tracking-wide">{scoreLabel}</span>
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

            {/* Receipt summary */}
            {receipt && (
              <div
                className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-4"
                style={{ animation: "cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 100ms both" }}
              >
                <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-2">Receipt Scanned</p>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-black text-white leading-none truncate">
                      {receipt.storeName || "Unknown Store"}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {receipt.date} · {receipt.items.length} item{receipt.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-lg font-black tabular-nums flex-shrink-0">
                    ${typeof receipt.total === "number" ? receipt.total.toFixed(2) : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Section header */}
            <div style={{ animation: "cardIn 0.45s ease-out 180ms both" }}>
              <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-1">
                Price Intelligence Report
              </p>
              <h2 className="text-xl font-black tracking-tight leading-tight">
                Here&apos;s what we<br />found on your receipt
              </h2>
            </div>

            {/* Category cards */}
            <div className="space-y-3">
              {data.categories.map((cat, i) => (
                <CategoryCard key={cat.name} category={cat} index={i} />
              ))}
            </div>

            {/* Total savings */}
            <div
              className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-2xl p-5"
              style={{ animation: `cardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) ${300 + data.categories.length * 110 + 150}ms both` }}
            >
              <p className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase mb-4">Case Summary</p>
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-400 font-medium">Savings this receipt</span>
                  <div className="flex items-end gap-1 leading-none">
                    <span
                      className="text-3xl font-black tabular-nums"
                      style={{ background: "linear-gradient(135deg, #4ade80, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                    >
                      ${savingsVal.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="h-px bg-white/[0.06]" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-400 font-medium">Yearly projection</span>
                  <span
                    className="text-xl font-black tabular-nums"
                    style={{ background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                  >
                    ${Math.round(yearlyVal).toLocaleString()}/yr
                  </span>
                </div>
              </div>
            </div>

            {/* Gradient border CTA */}
            <div
              className="relative p-[1px] rounded-2xl overflow-hidden"
              style={{ animation: `cardIn 0.5s ease-out ${300 + data.categories.length * 110 + 270}ms both` }}
            >
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ background: "linear-gradient(135deg, #7c3aed, #8b5cf6, #a78bfa)" }}
              />
              <button
                onClick={onRescan}
                className="relative w-full hover:opacity-90 active:opacity-80 text-white py-[18px] rounded-[15px] font-bold text-sm tracking-widest uppercase transition-opacity"
                style={{ background: "linear-gradient(160deg, #0a0e1a, #131832)" }}
              >
                SCAN ANOTHER
              </button>
            </div>

            <div className="pb-2" />
          </div>
        </div>

        <BottomNav active="scan" onTabChange={onNavTab} />
        <div className="h-safe-bottom" />
      </div>
    </div>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────
export default function Home() {
  const [phase, setPhase]             = useState<Phase>("splash");
  const [opacity, setOpacity]         = useState(1);
  const [result, setResult]           = useState<AnalysisResult | null>(null);
  const [scannedFile, setScannedFile] = useState<ScannedFile | null>(null);
  const [receiptData, setReceiptData] = useState<ExtractedReceipt | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [scanError, setScanError]     = useState<string | null>(null);

  const phaseRef     = useRef<Phase>("splash");
  const inTransition = useRef(false);
  const progressDone = useRef(false);
  const apiDone      = useRef(false);
  const scanErrorRef = useRef<string | null>(null);

  const transitionTo = useCallback((next: Phase) => {
    if (inTransition.current || phaseRef.current === next) return;
    inTransition.current = true;
    phaseRef.current = next;
    setOpacity(0);
    setTimeout(() => {
      setPhase(next);
      requestAnimationFrame(() => {
        setOpacity(1);
        setTimeout(() => { inTransition.current = false; }, 350);
      });
    }, 300);
  }, []);

  // Two-step API chain: vision extraction → price analysis → save to DB
  useEffect(() => {
    if (phase !== "scanning") return;
    progressDone.current = false;
    apiDone.current      = false;
    scanErrorRef.current = null;
    setScanError(null);

    const run = async () => {
      let succeeded = false;
      try {
        let extracted: ExtractedReceipt | null = null;
        if (scannedFile?.base64) {
          const res        = await fetch("/api/upload-receipt", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ imageBase64: scannedFile.base64 }),
          });
          const uploadData = await res.json();
          if (!res.ok || uploadData.error) {
            throw new Error(uploadData.error ?? `Upload failed (${res.status})`);
          }
          extracted = uploadData as ExtractedReceipt;
          setReceiptData(extracted);
        }

        const analyzeRes = await fetch("/api/analyze-receipt", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ items: extracted?.items ?? null }),
        });
        const raw = await analyzeRes.json();
        if (!analyzeRes.ok || raw.error) {
          throw new Error(raw.error ?? `Analysis failed (${analyzeRes.status})`);
        }
        if (!raw.categories) {
          throw new Error("Analysis returned an unexpected format.");
        }
        setResult(raw as AnalysisResult);
        succeeded = true;

        saveScanToDb(extracted, raw as AnalysisResult, scannedFile?.base64)
          .catch((err) => console.warn("Supabase save failed:", err));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Scan failed. Please try again.";
        console.error("[scan] pipeline error:", err);
        scanErrorRef.current = msg;
        setScanError(msg);
      } finally {
        apiDone.current = true;
        if (succeeded && progressDone.current) transitionTo("reveal");
      }
    };

    run();
  }, [phase, scannedFile, transitionTo]);

  const handleProgressDone = useCallback(() => {
    progressDone.current = true;
    if (apiDone.current && !scanErrorRef.current) transitionTo("reveal");
  }, [transitionTo]);

  const handleScan = useCallback((file: ScannedFile) => {
    setScannedFile(file);
    transitionTo("scanning");
  }, [transitionTo]);

  const handleRescan = useCallback(() => {
    setResult(null);
    setScannedFile(null);
    setReceiptData(null);
    setScanError(null);
    scanErrorRef.current = null;
    setShowHistory(false);
    transitionTo("splash");
  }, [transitionTo]);

  const handleNavTab = useCallback((tab: NavTab) => {
    if (tab === "progress") {
      setShowHistory(true);
    } else if (tab === "scan") {
      setShowHistory(false);
      if (phaseRef.current !== "splash") handleRescan();
    }
  }, [handleRescan]);

  return (
    <div style={{ opacity, transition: "opacity 0.3s ease" }}>
      {showHistory ? (
        <History onNavTab={handleNavTab} />
      ) : (
        <>
          {phase === "splash"   && <Splash   onScan={handleScan} onNavTab={handleNavTab} />}
          {phase === "scanning" && <Scan     onProgressDone={handleProgressDone} filename={scannedFile?.name} error={scanError} onRetry={handleRescan} />}
          {phase === "reveal"   && (
            <Reveal
              data={result ?? FALLBACK}
              receipt={receiptData}
              onRescan={handleRescan}
              onNavTab={handleNavTab}
            />
          )}
        </>
      )}
    </div>
  );
}
