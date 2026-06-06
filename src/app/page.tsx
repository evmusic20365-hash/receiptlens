"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ────────────────────────────────────────────────────────────────
const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SCAN_STEPS = [
  "Reading receipt...",
  "Analyzing spending...",
  "Calculating leaks...",
  "Done.",
] as const;

// ── Types ────────────────────────────────────────────────────────────────────
interface Leak {
  name: string;
  amount: number;
  description: string;
}

interface AnalysisResult {
  score: number;
  leaks: Leak[];
  totalFound: number;
  yearlyPotential: number;
}

const FALLBACK: AnalysisResult = {
  score: 68,
  leaks: [
    { name: "IMPULSE SPENDING",    amount: 214, description: "You spend most impulsively between 7–9 PM" },
    { name: "CONVENIENCE TAX",     amount: 93,  description: "You pay 42% more for convenience items"   },
    { name: "DUPLICATE PURCHASES", amount: 38,  description: "You rebuy items you already own"          },
  ],
  totalFound: 345,
  yearlyPotential: 4140,
};

type Phase = "splash" | "scanning" | "reveal";

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
        setValue(Math.round((1 - Math.pow(1 - t, 3)) * target));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return value;
}

// ── Spy Illustration ─────────────────────────────────────────────────────────
function SpyCharacter({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* ── HAT ── */}
      <path d="M66 74 C66 44 78 20 100 18 C122 20 134 44 134 74" fill="#111" />
      <ellipse cx="100" cy="76" rx="58" ry="13" fill="#111" />
      {/* Hat band */}
      <path d="M68 66 Q100 60 132 66" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
      {/* Crown indent */}
      <path d="M80 44 Q100 38 120 44" stroke="#222" strokeWidth="1.5" fill="none" />

      {/* ── HEAD ── */}
      <ellipse cx="100" cy="112" rx="36" ry="40" fill="#fde8c8" stroke="#111" strokeWidth="2.5" />

      {/* ── EYES ── */}
      {/* Left eye */}
      <ellipse cx="84" cy="104" rx="10" ry="11" fill="white" stroke="#111" strokeWidth="2" />
      <circle cx="87" cy="106" r="5.5" fill="#111" />
      <circle cx="89" cy="104" r="2" fill="white" />
      {/* Right eye */}
      <ellipse cx="116" cy="104" rx="10" ry="11" fill="white" stroke="#111" strokeWidth="2" />
      <circle cx="119" cy="106" r="5.5" fill="#111" />
      <circle cx="121" cy="104" r="2" fill="white" />
      {/* Eyebrows */}
      <path d="M75 91 Q84 86 93 91" stroke="#7c5c38" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M107 91 Q116 86 125 91" stroke="#7c5c38" strokeWidth="3" strokeLinecap="round" fill="none" />

      {/* ── NOSE + MOUTH ── */}
      <path d="M97 118 Q100 123 103 118" stroke="#c4956a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Smirk — one corner curls up */}
      <path d="M87 129 Q96 135 108 128" stroke="#111" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M106 128 Q111 124 109 130" stroke="#111" strokeWidth="2" strokeLinecap="round" fill="none" />

      {/* ── NECK + COLLAR ── */}
      <rect x="93" y="149" width="14" height="10" fill="#fde8c8" />
      {/* Shirt collar */}
      <path d="M85 155 L100 164 L115 155" fill="#f3f4f6" stroke="#111" strokeWidth="1.5" />
      {/* Tie */}
      <path d="M100 162 L96 180 L100 190 L104 180 Z" fill="#ef4444" stroke="#111" strokeWidth="1.5" />
      <ellipse cx="100" cy="164" rx="5" ry="4" fill="#dc2626" stroke="#111" strokeWidth="1.5" />

      {/* ── COAT BODY ── */}
      <path d="M60 158 L140 158 L152 238 H48 Z" fill="#1e2535" stroke="#111" strokeWidth="2.5" />
      {/* Lapels */}
      <path d="M100 162 L77 180 L64 210" stroke="#d1d5db" strokeWidth="2" fill="none" />
      <path d="M100 162 L123 180 L136 210" stroke="#d1d5db" strokeWidth="2" fill="none" />
      {/* Belt */}
      <rect x="50" y="200" width="100" height="10" rx="4" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
      <rect x="91" y="198" width="18" height="14" rx="3" fill="#6b7280" stroke="#4b5563" strokeWidth="1.5" />
      <rect x="95" y="202" width="10" height="6" rx="1.5" fill="#4b5563" />
      {/* Buttons */}
      <circle cx="100" cy="220" r="3" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />
      <circle cx="100" cy="234" r="3" fill="#374151" stroke="#4b5563" strokeWidth="1.5" />

      {/* ── LEFT ARM ── */}
      <path d="M64 168 L38 218" stroke="#1e2535" strokeWidth="18" strokeLinecap="round" />
      <ellipse cx="36" cy="221" rx="10" ry="9" fill="#fde8c8" stroke="#111" strokeWidth="2" />

      {/* ── RIGHT ARM + MAGNIFYING GLASS ── */}
      <path d="M136 168 L160 140" stroke="#1e2535" strokeWidth="18" strokeLinecap="round" />
      <ellipse cx="162" cy="138" rx="9" ry="10" fill="#fde8c8" stroke="#111" strokeWidth="2" />
      {/* Glass ring */}
      <circle cx="174" cy="116" r="27" fill="rgba(186,230,253,0.1)" stroke="#111" strokeWidth="3.5" />
      <circle cx="174" cy="116" r="22" fill="none" stroke="#374151" strokeWidth="1" />
      {/* Lens glint */}
      <path d="M161 105 Q170 99 181 103" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      {/* Handle */}
      <line x1="193" y1="135" x2="200" y2="152" stroke="#ef4444" strokeWidth="8" strokeLinecap="round" />

      {/* ── SHOES ── */}
      <ellipse cx="80" cy="239" rx="18" ry="7" fill="#0f172a" stroke="#111" strokeWidth="1.5" />
      <ellipse cx="120" cy="239" rx="18" ry="7" fill="#0f172a" stroke="#111" strokeWidth="1.5" />
    </svg>
  );
}

// ── Bottom Nav ───────────────────────────────────────────────────────────────
type NavTab = "scan" | "progress" | "tips";

function BottomNav({ active }: { active: NavTab }) {
  const tabs: { key: NavTab; label: string; icon: React.ReactNode }[] = [
    {
      key: "scan",
      label: "Scan",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      key: "progress",
      label: "Progress",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      key: "tips",
      label: "Tips",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <circle cx="12" cy="8" r="0.5" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div className="border-t border-white/[0.07] grid grid-cols-3">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            className={`py-3 flex flex-col items-center gap-1 text-[11px] font-semibold tracking-wide transition-colors
              ${isActive ? "text-red-500" : "text-zinc-600"}`}
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
function Splash({ onScan }: { onScan: () => void }) {
  const [visible, setVisible] = useState(false);
  const cbRef = useRef(onScan);
  cbRef.current = onScan;

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => cbRef.current(), 2000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans flex flex-col">
      {/* Header */}
      <div className="px-6 pt-14">
        <h1 className="text-[26px] font-black tracking-tight leading-none">RECEIPT DETECTIVE</h1>
        <p className="text-zinc-400 text-sm mt-1.5 font-medium">We find what others miss</p>
      </div>

      {/* Illustration */}
      <div
        className={`flex-1 flex items-center justify-center py-2 transition-all duration-700 ease-out
          ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      >
        <SpyCharacter className="w-48 h-auto drop-shadow-[0_0_30px_rgba(239,68,68,0.12)]" />
      </div>

      {/* CTA + Status */}
      <div
        className={`px-6 pb-4 space-y-3 transition-all duration-700 delay-150 ease-out
          ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      >
        <button
          onClick={() => cbRef.current()}
          className="w-full bg-red-500 hover:bg-red-400 active:bg-red-600 text-white py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-colors shadow-[0_4px_24px_rgba(239,68,68,0.35)]"
        >
          SCAN NOW
        </button>

        {/* Status box */}
        <div className="bg-[#161616] rounded-2xl border border-white/[0.07] divide-y divide-white/[0.07] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">💰</span>
              <span className="text-sm text-zinc-300 font-medium">Budget this month</span>
            </div>
            <span className="text-sm font-bold tabular-nums">$2,847</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🔍</span>
              <span className="text-sm text-zinc-300 font-medium">Leaks detected</span>
            </div>
            <span className="text-sm font-black text-red-500 tabular-nums">3</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <BottomNav active="scan" />
      <div className="h-safe-bottom" />
    </div>
  );
}

// ── Scan ─────────────────────────────────────────────────────────────────────
function Scan({ onProgressDone }: { onProgressDone: () => void }) {
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
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setTimeout(() => cbRef.current(), 350);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const ids = [600, 1300, 2100].map((d, i) => setTimeout(() => setStep(i + 1), d));
    return () => ids.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans flex flex-col">
      {/* Header */}
      <div className="px-6 pt-14 pb-4 flex items-end justify-between border-b border-white/[0.07]">
        <h1 className="text-lg font-black tracking-tight">RECEIPT DETECTIVE</h1>
        <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Investigating</span>
      </div>

      {/* Scan content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
        {/* Mini spy */}
        <SpyCharacter className="w-28 h-auto opacity-90" />

        {/* Status */}
        <div className="w-full max-w-sm space-y-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-3">
              Status
            </p>
            <div className="h-7 overflow-hidden">
              <p
                key={step}
                className="text-base font-semibold text-white animate-[fade-up_0.22s_ease-out_forwards]"
              >
                {SCAN_STEPS[step]}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="w-full h-2 bg-[#1e1e1e] rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-none shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider">Progress</span>
              <span className="text-sm font-bold text-red-500 tabular-nums">{progress}%</span>
            </div>
          </div>
        </div>
      </div>

      <BottomNav active="scan" />
      <div className="h-safe-bottom" />
    </div>
  );
}

// ── Reveal ───────────────────────────────────────────────────────────────────
function LeakCard({ leak, index }: { leak: Leak; index: number }) {
  const amount = useCountUp(leak.amount, 1000, 700 + index * 120);

  const colors = ["text-red-400", "text-orange-400", "text-yellow-400"];
  const rings  = ["ring-red-500/20", "ring-orange-500/20", "ring-yellow-500/20"];

  return (
    <div className={`bg-[#161616] rounded-2xl border border-white/[0.07] p-4 ring-1 ${rings[index]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="text-[11px] font-bold text-zinc-700 tabular-nums mt-0.5 flex-shrink-0">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-black tracking-wide text-white truncate">
              {leak.name.toUpperCase()}
            </p>
            <p className="text-zinc-500 text-xs mt-1 leading-relaxed pr-2">{leak.description}</p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`text-lg font-black tabular-nums leading-none ${colors[index]}`}>
            ${amount}
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5">/mo</p>
        </div>
      </div>
    </div>
  );
}

function Reveal({ data, onRescan }: { data: AnalysisResult; onRescan: () => void }) {
  const [ready, setReady] = useState(false);
  const scoreVal   = useCountUp(data.score,           1200, 350);
  const monthlyVal = useCountUp(data.totalFound,      1300, 700);
  const yearlyVal  = useCountUp(data.yearlyPotential, 1500, 700);

  useEffect(() => { setReady(true); }, []);

  const dashOffset = ready
    ? CIRCUMFERENCE * (1 - scoreVal / 100)
    : CIRCUMFERENCE;

  const scoreLabel =
    scoreVal >= 80 ? "Good Shape" :
    scoreVal >= 60 ? "Needs Improvement" :
    "High Risk";

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans flex flex-col">
      {/* Header */}
      <div className="px-6 pt-14 pb-4 flex items-end justify-between border-b border-white/[0.07] flex-shrink-0">
        <h1 className="text-lg font-black tracking-tight">RECEIPT DETECTIVE</h1>
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest self-end">Case File</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-5 max-w-sm mx-auto">

          {/* Score ring */}
          <div className="bg-[#161616] rounded-3xl border border-white/[0.07] p-6 flex flex-col items-center">
            <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-5">
              Shopping Health Score
            </p>

            <div className="relative w-[172px] h-[172px]">
              <svg width="172" height="172" viewBox="0 0 172 172" className="-rotate-90">
                <circle cx="86" cy="86" r={RADIUS} fill="none" stroke="#1e1e1e" strokeWidth="8" />
                <circle
                  cx="86" cy="86" r={RADIUS}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  style={{ transition: ready ? "stroke-dashoffset 1.3s cubic-bezier(0.33,1,0.68,1)" : "none" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="flex items-end leading-none gap-0.5">
                  <span className="text-[48px] font-black tabular-nums leading-none">{scoreVal}</span>
                  <span className="text-zinc-600 text-lg font-bold mb-2">/ 100</span>
                </div>
              </div>
            </div>

            <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-xs font-bold text-red-400 tracking-wide">{scoreLabel}</span>
            </div>
          </div>

          {/* Findings header */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-1">Findings</p>
            <h2 className="text-xl font-black tracking-tight leading-tight">
              Here&apos;s where your<br />money is leaking
            </h2>
          </div>

          {/* Leak cards */}
          <div className="space-y-3">
            {data.leaks.map((leak, i) => (
              <LeakCard key={leak.name} leak={leak} index={i} />
            ))}
          </div>

          {/* Total card */}
          <div className="bg-[#161616] rounded-2xl border border-white/[0.07] p-5">
            <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-600 uppercase mb-4">
              Total Exposure
            </p>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-400 font-medium">Monthly leaks</span>
                <div className="flex items-end gap-1 leading-none">
                  <span className="text-3xl font-black tabular-nums">${monthlyVal.toLocaleString()}</span>
                  <span className="text-zinc-500 text-sm font-medium mb-0.5">/mo</span>
                </div>
              </div>
              <div className="h-px bg-white/[0.07]" />
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-zinc-400 font-medium">Yearly savings potential</span>
                <span className="text-xl font-black text-green-400 tabular-nums">
                  ${yearlyVal.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={onRescan}
            className="w-full bg-red-500 hover:bg-red-400 active:bg-red-600 text-white py-4 rounded-2xl font-bold text-sm tracking-widest uppercase transition-colors shadow-[0_4px_24px_rgba(239,68,68,0.3)]"
          >
            SCAN AGAIN
          </button>

          <div className="pb-2" />
        </div>
      </div>

      <BottomNav active="scan" />
      <div className="h-safe-bottom" />
    </div>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────
export default function Home() {
  const [phase, setPhase]     = useState<Phase>("splash");
  const [opacity, setOpacity] = useState(1);
  const [result, setResult]   = useState<AnalysisResult | null>(null);

  const phaseRef     = useRef<Phase>("splash");
  const inTransition = useRef(false);
  const progressDone = useRef(false);
  const apiDone      = useRef(false);

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

  // Fire fetch the moment scanning starts; gate reveal on both finishing
  useEffect(() => {
    if (phase !== "scanning") return;
    progressDone.current = false;
    apiDone.current = false;

    fetch("/api/analyze-receipt", { method: "POST" })
      .then((r) => r.json())
      .then((data: AnalysisResult) => {
        setResult(data.leaks ? data : FALLBACK);
        apiDone.current = true;
        if (progressDone.current) transitionTo("reveal");
      })
      .catch(() => {
        setResult(FALLBACK);
        apiDone.current = true;
        if (progressDone.current) transitionTo("reveal");
      });
  }, [phase, transitionTo]);

  const handleProgressDone = useCallback(() => {
    progressDone.current = true;
    if (apiDone.current) transitionTo("reveal");
  }, [transitionTo]);

  const handleRescan = useCallback(() => {
    setResult(null);
    transitionTo("splash");
  }, [transitionTo]);

  return (
    <div style={{ opacity, transition: "opacity 0.3s ease" }}>
      {phase === "splash"   && <Splash onScan={() => transitionTo("scanning")} />}
      {phase === "scanning" && <Scan   onProgressDone={handleProgressDone} />}
      {phase === "reveal"   && <Reveal data={result ?? FALLBACK} onRescan={handleRescan} />}
    </div>
  );
}
