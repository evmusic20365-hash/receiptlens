"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import MascotLottie from "@/components/MascotLottie";

// ── Badge definitions ─────────────────────────────────────────────────────────
interface BadgeDef {
  name: string; emoji: string; title: string; desc: string;
  check: (s: UserStats) => boolean;
}
interface UserStats {
  receiptsScanned: number; totalSavings: number; streak: number;
  topScore: number; maxSingleSaving: number;
}

const BADGES: BadgeDef[] = [
  { name: "First Case",    emoji: "🔍", title: "First Case",     desc: "Scan your first receipt",          check: s => s.receiptsScanned >= 1   },
  { name: "Ten Cases",     emoji: "📁", title: "Ten Cases",      desc: "Scan 10 receipts",                 check: s => s.receiptsScanned >= 10  },
  { name: "Century",       emoji: "💯", title: "Century",        desc: "100 receipts scanned",             check: s => s.receiptsScanned >= 100 },
  { name: "Saved $10",     emoji: "💰", title: "First Haul",     desc: "Save $10 total",                   check: s => s.totalSavings >= 10     },
  { name: "Saved $100",    emoji: "💵", title: "Big Score",      desc: "Save $100 total",                  check: s => s.totalSavings >= 100    },
  { name: "Saved $500",    emoji: "💎", title: "Diamond Haul",   desc: "Save $500 total",                  check: s => s.totalSavings >= 500    },
  { name: "3-Day Streak",  emoji: "🔥", title: "On Fire",        desc: "3-day scanning streak",            check: s => s.streak >= 3            },
  { name: "7-Day Streak",  emoji: "⚡", title: "Week Warrior",   desc: "7-day scanning streak",            check: s => s.streak >= 7            },
  { name: "30-Day Streak", emoji: "🌟", title: "Legendary",      desc: "30-day scanning streak",           check: s => s.streak >= 30           },
  { name: "Sharp Eye",     emoji: "👁",  title: "Sharp Eye",      desc: "Score 90+ on a receipt",          check: s => s.topScore >= 90         },
  { name: "Price Hawk",    emoji: "🦅", title: "Price Hawk",     desc: "Find a single saving over $10",   check: s => s.maxSingleSaving >= 10  },
  { name: "Deal Machine",  emoji: "🎯", title: "Deal Machine",   desc: "Find a single saving over $25",   check: s => s.maxSingleSaving >= 25  },
];

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
const staggerV = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

// ── Achievement unlock celebration ────────────────────────────────────────────
function UnlockBanner({ badge, onDismiss }: { badge: BadgeDef; onDismiss: () => void }) {
  useEffect(() => { const id = setTimeout(onDismiss, 3500); return () => clearTimeout(id); }, [onDismiss]);
  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
      transition={{ type: "spring", damping: 18, stiffness: 300 }}
      className="fixed top-0 left-0 right-0 z-50 px-4 pt-12 pb-4 pointer-events-none"
    >
      <div className="rounded-2xl p-4 flex items-center gap-3 mx-auto max-w-sm"
        style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.95), rgba(109,40,217,0.95))", boxShadow: "0 8px 32px rgba(124,58,237,0.45)" }}>
        <span className="text-3xl">{badge.emoji}</span>
        <div>
          <p className="text-[10px] font-bold tracking-[0.28em] text-violet-200 uppercase">Badge Unlocked!</p>
          <p className="text-base font-black text-white">{badge.title}</p>
          <p className="text-xs text-violet-300">{badge.desc}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RewardsTab() {
  const [stats,     setStats]     = useState<UserStats | null>(null);
  const [unlocked,  setUnlocked]  = useState<Set<string>>(new Set());
  const [newBadge,  setNewBadge]  = useState<BadgeDef | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [sharing,   setSharing]   = useState(false);
  const [copied,    setCopied]    = useState(false);

  const loadAndCheck = useCallback(async () => {
    const [
      { data: receipts },
      { data: analyses },
      { data: achievements },
    ] = await Promise.all([
      supabase.from("receipts").select("id, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("analyses").select("score, total_found").limit(500),
      supabase.from("achievements").select("badge_name"),
    ]);

    const allAnalyses = (analyses ?? []) as Array<{ score: number; total_found: number }>;
    const userStats: UserStats = {
      receiptsScanned: (receipts ?? []).length,
      totalSavings:    allAnalyses.reduce((s, a) => s + (a.total_found ?? 0), 0),
      streak:          computeStreak((receipts ?? []) as Array<{ created_at: string }>),
      topScore:        allAnalyses.length ? Math.max(...allAnalyses.map(a => a.score ?? 0)) : 0,
      maxSingleSaving: allAnalyses.length ? Math.max(...allAnalyses.map(a => a.total_found ?? 0)) : 0,
    };

    const unlockedNames = new Set((achievements ?? []).map((a: { badge_name: string }) => a.badge_name));

    // Check for newly unlockable badges
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      for (const badge of BADGES) {
        if (!unlockedNames.has(badge.name) && badge.check(userStats)) {
          const { error } = await supabase
            .from("achievements")
            .insert({ user_id: user.id, badge_name: badge.name })
            .select()
            .single();
          if (!error) {
            unlockedNames.add(badge.name);
            setNewBadge(badge); // show banner for the first newly unlocked one
            break;
          }
        }
      }
    }

    setStats(userStats);
    setUnlocked(unlockedNames);
    setLoading(false);
  }, []);

  useEffect(() => { loadAndCheck(); }, [loadAndCheck]);

  const share = async () => {
    setSharing(true);
    const text = stats
      ? `I've scanned ${stats.receiptsScanned} receipts and saved $${stats.totalSavings.toFixed(2)} with Receipt Detective! 🕵️`
      : "I'm using Receipt Detective to hunt down the best prices!";
    if (navigator.share) {
      try { await navigator.share({ title: "Receipt Detective", text }); }
      catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
    setSharing(false);
  };

  if (loading) {
    return <div className="flex-1 flex justify-center items-center"><div className="w-6 h-6 border-2 border-white/10 border-t-violet-500 rounded-full animate-spin" /></div>;
  }

  const unlockedBadges = BADGES.filter(b => unlocked.has(b.name));
  const lockedBadges   = BADGES.filter(b => !unlocked.has(b.name));
  const pct = Math.round((unlockedBadges.length / BADGES.length) * 100);

  return (
    <>
      <AnimatePresence>
        {newBadge && <UnlockBanner badge={newBadge} onDismiss={() => setNewBadge(null)} />}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto">
        <motion.div className="px-4 pt-3 pb-24 space-y-4 max-w-sm mx-auto"
          variants={staggerV} initial="hidden" animate="show">

          {/* Header */}
          <motion.div variants={cardV}>
            <p className="text-[10px] font-bold tracking-[0.28em] text-zinc-500 uppercase">Detective Bureau</p>
            <p className="text-xl font-black text-white">Achievements</p>
          </motion.div>

          {/* Progress ring */}
          <motion.div variants={cardV}>
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4 flex items-center gap-4">
                <div className="relative w-[72px] h-[72px] flex-shrink-0">
                  <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
                    <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                    <circle cx="36" cy="36" r="30" fill="none" stroke="#a855f7" strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 30}`}
                      strokeDashoffset={`${2 * Math.PI * 30 * (1 - pct / 100)}`}
                      style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.33,1,0.68,1)" }} />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[17px] font-black text-violet-400">{pct}%</span>
                  </div>
                </div>
                <div>
                  <p className="text-base font-black text-white">{unlockedBadges.length}/{BADGES.length} Badges</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    {pct >= 100 ? "All badges collected! 🏆" : pct >= 50 ? "Halfway there, Detective." : "Keep scanning to earn more."}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Stats summary */}
          {stats && (
            <motion.div variants={cardV}>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Scanned", value: stats.receiptsScanned.toString(), color: "#a855f7" },
                  { label: "Saved",   value: `$${stats.totalSavings.toFixed(0)}`, color: "#22c55e" },
                  { label: "Streak",  value: `${stats.streak}🔥`, color: "#f97316" },
                ].map(stat => (
                  <div key={stat.label} className="rounded-xl p-3 text-center"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p className="text-[18px] font-black" style={{ color: stat.color }}>{stat.value}</p>
                    <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-wide mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Unlocked badges */}
          {unlockedBadges.length > 0 && (
            <motion.div variants={cardV}>
              <p className="text-[10px] font-bold tracking-[0.2em] text-violet-400 uppercase mb-2">Earned</p>
              <div className="grid grid-cols-3 gap-2">
                {unlockedBadges.map(badge => (
                  <motion.div key={badge.name}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    className="rounded-2xl p-3 flex flex-col items-center gap-1 text-center"
                    style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}>
                    <span className="text-2xl">{badge.emoji}</span>
                    <p className="text-[10px] font-bold text-violet-300 leading-tight">{badge.title}</p>
                    <p className="text-[8px] text-zinc-600 leading-tight">{badge.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Locked badges */}
          {lockedBadges.length > 0 && (
            <motion.div variants={cardV}>
              <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-600 uppercase mb-2">Locked</p>
              <div className="grid grid-cols-3 gap-2">
                {lockedBadges.map(badge => (
                  <div key={badge.name}
                    className="rounded-2xl p-3 flex flex-col items-center gap-1 text-center opacity-35"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="text-2xl grayscale">{badge.emoji}</span>
                    <p className="text-[10px] font-bold text-zinc-500 leading-tight">{badge.title}</p>
                    <p className="text-[8px] text-zinc-700 leading-tight">{badge.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Celebrating mascot if all badges unlocked */}
          {pct >= 100 && (
            <motion.div variants={cardV} className="flex justify-center">
              <MascotLottie state="celebrating" style={{ width: 120, height: 120 }} />
            </motion.div>
          )}

          {/* Share card */}
          <motion.div variants={cardV}>
            <Card className="rounded-2xl shadow-none text-white overflow-hidden" style={GLASS}>
              <div className="p-4 space-y-3">
                <p className="text-[9px] font-bold tracking-[0.28em] text-zinc-500 uppercase">Share Your Case</p>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Brag to friends about your savings. Every detective needs an audience.
                </p>
                <motion.button whileTap={{ scale: 0.97 }} onClick={share} disabled={sharing}
                  className="w-full py-3 rounded-xl font-black text-[12px] tracking-widest uppercase text-white disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 20px rgba(124,58,237,0.35)" }}>
                  {copied ? "✓ Copied!" : sharing ? "Sharing…" : "Share My Stats 🕵️"}
                </motion.button>
              </div>
            </Card>
          </motion.div>

        </motion.div>
      </div>
    </>
  );
}

// ── Helper: streak computation ─────────────────────────────────────────────────
function computeStreak(scans: Array<{ created_at: string }>): number {
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
