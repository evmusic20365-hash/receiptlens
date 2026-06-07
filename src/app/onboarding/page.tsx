"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

const NAVY: React.CSSProperties = { background: "linear-gradient(160deg, #0a0e1a 0%, #131832 100%)" };
const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.045)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  boxShadow: "0 0 0 1px rgba(139,92,246,0.22), 0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
};
const INPUT: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  colorScheme: "dark",
};

const STEPS = [
  {
    mascot:   "/mascot-default.png",
    badge:    "STEP 1 OF 3",
    title:    "Report for duty,\nDetective.",
    subtitle: "Every case file starts with a name on the badge.",
  },
  {
    mascot:   "/mascot-confused.png",
    badge:    "STEP 2 OF 3",
    title:    "Establish your\nrecord.",
    subtitle: "When did this detective first hit the streets?",
  },
  {
    mascot:   "/mascot-celebrating.png",
    badge:    "STEP 3 OF 3",
    title:    "Set your\nmission parameters.",
    subtitle: "How much should we be saving per month? (Optional — you can skip this.)",
  },
];

// Mutable animation objects — Framer Motion requires non-readonly arrays
const MASCOT_ANIMS = [
  { y: [0, -10, 0] },
  { rotate: [-6, 6, -6] },
  { y: [0, -12, 0], rotate: [-3, 3, -3] },
];

const slideVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 48 }),
  center: { opacity: 1, x: 0 },
  exit:  (dir: number) => ({ opacity: 0, x: dir * -48 }),
};

const inputCls = "w-full rounded-xl px-4 py-3.5 text-[14px] text-white placeholder-zinc-600 outline-none transition-all focus:shadow-[0_0_0_1.5px_rgba(167,139,250,0.5)]";

export default function OnboardingPage() {
  const router = useRouter();
  const [step,     setStep]     = useState(0);
  const [dir,      setDir]      = useState(1);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [name,     setName]     = useState("");
  const [username, setUsername] = useState("");
  const [birthday, setBirthday] = useState("");
  const [budget,   setBudget]   = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      setUserId(session.user.id);

      // If profile is already complete, skip onboarding
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, birthday")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile?.name && profile?.birthday) router.push("/");
    };
    init();
  }, [router]);

  const advance = () => { setDir(1); setStep(s => s + 1); setError(null); };
  const back    = () => { setDir(-1); setStep(s => s - 1); setError(null); };

  const save = async (monthlyBudget?: number) => {
    if (!userId) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id:             userId,
        name:           name.trim(),
        username:       username.trim() || null,
        birthday:       birthday || null,
        monthly_budget: monthlyBudget ?? (budget ? parseFloat(budget) : null),
      });

    if (error) { setError(error.message); setLoading(false); }
    else router.push("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    save();
  };

  const s = STEPS[step];

  return (
    <div
      className="h-[100dvh] text-white font-sans flex flex-col items-center justify-center px-6 overflow-hidden"
      style={{ ...NAVY, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-violet-600/[0.09] rounded-full blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-56 h-56 bg-indigo-600/[0.06] rounded-full blur-[90px]" />
      </div>

      {/* Fixed header — "Welcome, Detective" */}
      <motion.div
        className="relative flex flex-col items-center gap-1 mb-5"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-[10px] font-bold tracking-[0.3em] text-zinc-600 uppercase">Receipt Detective</p>
        <h1 className="text-[22px] font-black text-white text-center leading-none">Welcome, Detective 🕵️</h1>
        <p className="text-[12px] text-zinc-500 text-center mt-0.5">Let&apos;s set up your case file before we begin.</p>
      </motion.div>

      {/* Progress dots */}
      <motion.div
        className="relative flex items-center gap-2 mb-5"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
      >
        {STEPS.map((_, i) => (
          <motion.div
            key={i}
            className="h-1.5 rounded-full"
            animate={{
              width:   i === step ? 28 : 8,
              opacity: i === step ? 1 : i < step ? 0.5 : 0.2,
              background: i <= step ? "#a855f7" : "rgba(255,255,255,0.2)",
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </motion.div>

      {/* Step content — animated on step change */}
      <div className="relative w-full max-w-sm">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col gap-4"
          >
            {/* Mascot */}
            <div className="flex justify-center">
              <motion.img
                src={s.mascot}
                alt=""
                className="w-[80px] h-[80px] object-contain drop-shadow-[0_0_24px_rgba(139,92,246,0.4)]"
                animate={MASCOT_ANIMS[step]}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            {/* Glass card */}
            <div className="rounded-3xl p-6 flex flex-col gap-5" style={GLASS}>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-bold tracking-[0.3em] text-violet-400 uppercase">{s.badge}</span>
                <h2 className="text-[20px] font-black text-white leading-snug whitespace-pre-line">{s.title}</h2>
                <p className="text-[12px] text-zinc-500 leading-snug">{s.subtitle}</p>
              </div>

              {/* Step 1: Name + Username */}
              {step === 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Jane Doe"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      autoComplete="name"
                      className={inputCls}
                      style={INPUT}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Username</label>
                    <input
                      type="text"
                      placeholder="e.g. detective_jane"
                      value={username}
                      onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                      autoComplete="username"
                      maxLength={32}
                      className={inputCls}
                      style={INPUT}
                    />
                  </div>
                  <motion.button
                    type="button"
                    onClick={advance}
                    disabled={!name.trim()}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-black text-[13px] tracking-widest uppercase text-white disabled:opacity-40 mt-1 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.4)" }}
                  >
                    Continue
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </motion.button>
                </div>
              )}

              {/* Step 2: Birthday */}
              {step === 1 && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Date of Birth *</label>
                    <input
                      type="date"
                      value={birthday}
                      onChange={e => setBirthday(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                      className={inputCls}
                      style={{ ...INPUT, WebkitAppearance: "none" }}
                    />
                    <p className="text-[11px] text-zinc-600">We use this to personalize your savings insights.</p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={advance}
                    disabled={!birthday}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-black text-[13px] tracking-widest uppercase text-white disabled:opacity-40 mt-1 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.4)" }}
                  >
                    Continue
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </motion.button>
                </div>
              )}

              {/* Step 3: Budget */}
              {step === 2 && (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">Monthly Budget Goal</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 text-[14px] font-bold">$</span>
                      <input
                        type="number"
                        placeholder="500"
                        value={budget}
                        onChange={e => setBudget(e.target.value)}
                        min="0"
                        step="10"
                        className={`${inputCls} pl-8`}
                        style={INPUT}
                      />
                    </div>
                    <p className="text-[11px] text-zinc-600">We&apos;ll track how close your actual spending gets to this target.</p>
                  </div>

                  {error && (
                    <p className="text-[12px] text-red-400 bg-red-500/[0.08] rounded-xl px-3 py-2.5 border border-red-500/20 leading-snug">
                      {error}
                    </p>
                  )}

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl font-black text-[14px] tracking-widest uppercase text-white disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.4)" }}
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Briefing in…
                      </>
                    ) : (
                      <>
                        Start Investigating
                        <span className="text-[16px]">🔍</span>
                      </>
                    )}
                  </motion.button>

                  {/* Skip budget */}
                  {!loading && (
                    <motion.button
                      type="button"
                      onClick={() => save(undefined)}
                      className="text-center text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors py-1"
                    >
                      Skip for now →
                    </motion.button>
                  )}
                </form>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Back link */}
      {step > 0 && (
        <motion.button
          onClick={back}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mt-5 text-[13px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </motion.button>
      )}
    </div>
  );
}
