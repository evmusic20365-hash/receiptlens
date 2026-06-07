"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
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
};

export default function SignupPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  // Already logged in → go straight to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Create profile row — runs client-side after signup.
    // If email confirmation is required, data.session will be null but data.user exists.
    if (data.user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({ id: data.user.id, email: data.user.email });
      if (profileError) console.warn("[signup] profile insert failed:", profileError.message);
    }

    if (data.session) {
      router.push("/");
    } else {
      // Email confirmation required
      setError("Check your email to confirm your account, then sign in.");
      setLoading(false);
    }
  };

  return (
    <div
      className="h-[100dvh] text-white font-sans flex flex-col items-center justify-center px-6"
      style={{ ...NAVY, paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-violet-600/[0.09] rounded-full blur-[140px]" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/[0.06] rounded-full blur-[100px]" />
      </div>

      <motion.div
        className="relative w-full max-w-sm flex flex-col gap-5"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Mascot + wordmark */}
        <div className="flex flex-col items-center gap-2">
          <motion.img
            src="/mascot-celebrating.png"
            alt=""
            className="w-[88px] h-[88px] object-contain drop-shadow-[0_0_28px_rgba(139,92,246,0.4)]"
            animate={{ rotate: [-4, 4, -4] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <p className="text-[10px] font-bold tracking-[0.28em] text-zinc-600 uppercase">Receipt Detective</p>
        </div>

        {/* Glass card */}
        <div className="rounded-3xl p-6 flex flex-col gap-5" style={GLASS}>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-black text-white leading-snug">Open a new<br />case file.</h1>
            <p className="text-[13px] text-zinc-500">Your savings investigation starts here.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl px-4 py-3.5 text-[14px] text-white placeholder-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
              style={INPUT}
            />
            <input
              type="password"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-xl px-4 py-3.5 text-[14px] text-white placeholder-zinc-600 outline-none focus:border-violet-500/50 transition-colors"
              style={INPUT}
            />

            {error && (
              <p className={`text-[12px] rounded-xl px-3 py-2.5 border leading-snug ${
                error.startsWith("Check your email")
                  ? "text-violet-300 bg-violet-500/[0.08] border-violet-500/20"
                  : "text-red-400 bg-red-500/[0.08] border-red-500/20"
              }`}>
                {error}
              </p>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-2xl font-black text-[13px] tracking-widest uppercase text-white disabled:opacity-50 mt-1"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 24px rgba(124,58,237,0.4)" }}
            >
              {loading ? "Opening case…" : "Create Account"}
            </motion.button>
          </form>
        </div>

        <p className="text-center text-[13px] text-zinc-600">
          Already a detective?{" "}
          <Link href="/login" className="text-violet-400 font-semibold hover:text-violet-300 transition-colors">
            Sign in.
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
