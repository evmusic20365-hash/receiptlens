"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlaidLink } from "react-plaid-link";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────
interface LinkedAccount {
  id: string;
  bank_name: string;
  account_type: string;
  mask: string | null;
  last_synced_at: string | null;
}

interface SpendingAlert {
  merchant: string;
  category: string;
  avg_amount: number;
  cheaper_store: string;
  cheaper_price: number;
  savings_pct: number;
  suggestion: string;
  severity: "high" | "medium" | "low";
}

interface AnalysisResult {
  alerts: SpendingAlert[];
  total_monthly_savings: number;
  summary: string;
  grade: string | null;
}

interface PlaidLinkError {
  error_type: string;
  error_code: string;
  display_message: string;
}
interface PlaidLinkOnSuccessMetadata {
  institution: null | { name: string; institution_id: string };
}

// ── Inner trigger: mounts usePlaidLink and auto-opens when ready ──────────────
function PlaidLinkTrigger({
  linkToken,
  onSuccess,
  onExit,
}: {
  linkToken: string;
  onSuccess: (public_token: string, meta: PlaidLinkOnSuccessMetadata) => void;
  onExit: (error: null | PlaidLinkError) => void;
}) {
  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });
  useEffect(() => { if (ready) open(); }, [ready, open]);
  return null;
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const GLASS: React.CSSProperties = {
  background:     "rgba(255,255,255,0.04)",
  border:         "1px solid rgba(255,255,255,0.08)",
  backdropFilter: "blur(20px)",
};

const SEV_COLOR: Record<string, string> = {
  high:   "#f87171",
  medium: "#fbbf24",
  low:    "#a3a3a3",
};

interface Props { onLinked?: (accounts: LinkedAccount[]) => void; }

// ── Main component ────────────────────────────────────────────────────────────
export default function PlaidBankSection({ onLinked }: Props) {
  const [linkedAccounts,  setLinkedAccounts]  = useState<LinkedAccount[]>([]);
  const [linkToken,       setLinkToken]       = useState<string | null>(null);
  const [linking,         setLinking]         = useState(false);
  const [syncing,         setSyncing]         = useState(false);
  const [analyzing,       setAnalyzing]       = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [info,            setInfo]            = useState<string | null>(null);
  const [analysis,        setAnalysis]        = useState<AnalysisResult | null>(null);
  const [plaidConfigured, setPlaidConfigured] = useState<boolean | null>(null);

  const flash = (msg: string, ms = 4000) => {
    setInfo(msg);
    setTimeout(() => setInfo(null), ms);
  };

  // Load linked accounts
  useEffect(() => {
    supabase.from("linked_accounts")
      .select("id, bank_name, account_type, mask, last_synced_at")
      .then(({ data }) => setLinkedAccounts((data ?? []) as LinkedAccount[]));
  }, []);

  // Check if Plaid is configured
  useEffect(() => {
    fetch("/api/plaid/create-link-token", { method: "POST", headers: { Authorization: "Bearer config-check" } })
      .then(async r => {
        const body = await r.json();
        setPlaidConfigured(!body.error?.includes("not configured"));
      })
      .catch(() => setPlaidConfigured(false));
  }, []);

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not signed in");
    return session.access_token;
  };

  const reloadAccounts = async () => {
    const { data } = await supabase.from("linked_accounts").select("id, bank_name, account_type, mask, last_synced_at");
    const accounts = (data ?? []) as LinkedAccount[];
    setLinkedAccounts(accounts);
    return accounts;
  };

  // Step 1: Fetch a link token and mount PlaidLinkTrigger
  const openPlaidLink = useCallback(async () => {
    setError(null);
    setLinking(true);
    try {
      const authToken = await getAuthToken();
      const res  = await fetch("/api/plaid/create-link-token", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setLinkToken(data.link_token); // mounts <PlaidLinkTrigger> which auto-opens
    } catch (e) {
      setLinking(false);
      setError(`Connection Compromised — ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  // Step 2: Plaid Link success callback
  const handlePlaidSuccess = useCallback(async (public_token: string, meta: PlaidLinkOnSuccessMetadata) => {
    setLinkToken(null); // unmount trigger
    try {
      const authToken = await getAuthToken();
      const res  = await fetch("/api/plaid/exchange-token", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body:    JSON.stringify({ public_token, institution: meta.institution }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const accounts = await reloadAccounts();
      flash(`🎉 Bank linked! ${data.txns_synced ?? 0} transactions imported. Mission accomplished.`);
      onLinked?.(accounts);
    } catch (e) {
      setError(`Connection Compromised — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinking(false);
    }
  }, [onLinked]);

  // Step 3: Plaid Link exit callback
  const handlePlaidExit = useCallback((err: null | PlaidLinkError) => {
    setLinkToken(null); // unmount trigger
    setLinking(false);
    if (err) {
      setError(`Connection Compromised — ${err.display_message || err.error_code}`);
    } else {
      flash("Mission Aborted.", 2500);
    }
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const authToken = await getAuthToken();
      const res  = await fetch("/api/plaid/sync", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await reloadAccounts();
      flash(`↺ Sync complete — ${data.added ?? 0} new transactions added.`);
    } catch (e) {
      setError(`Connection Compromised — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  const analyzeSpending = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const authToken = await getAuthToken();
      const res  = await fetch("/api/plaid/analyze-transactions", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data as AnalysisResult);
    } catch (e) {
      setError(`Analysis Failed — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const unlinkAccount = useCallback(async (id: string) => {
    await supabase.from("linked_accounts").delete().eq("id", id);
    setLinkedAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  return (
    <div className="space-y-3">
      {/* Mount Plaid trigger when we have a link token */}
      {linkToken && (
        <PlaidLinkTrigger
          linkToken={linkToken}
          onSuccess={handlePlaidSuccess}
          onExit={handlePlaidExit}
        />
      )}

      {/* Header + action buttons */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Bank Accounts</p>
        {linkedAccounts.length > 0 && (
          <div className="flex gap-1.5">
            <motion.button whileTap={{ scale: 0.9 }} onClick={syncNow} disabled={syncing}
              className="text-[10px] font-bold text-violet-400 uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50"
              style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
              {syncing
                ? <><span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" /> Syncing</>
                : "↺ Sync"}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={analyzeSpending} disabled={analyzing}
              className="text-[10px] font-bold text-amber-400 uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1 disabled:opacity-50"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              {analyzing
                ? <><span className="w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full animate-spin" /> Analyzing</>
                : "🔍 Analyze"}
            </motion.button>
          </div>
        )}
      </div>

      {/* Plaid not configured warning */}
      {plaidConfigured === false && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">Plaid Keys Required</p>
          <p className="text-[10px] text-zinc-500 leading-snug">
            Fill in <span className="font-mono text-zinc-400">PLAID_CLIENT_ID</span>, <span className="font-mono text-zinc-400">PLAID_SECRET</span>, and <span className="font-mono text-zinc-400">SUPABASE_SERVICE_KEY</span> in <span className="font-mono text-zinc-400">.env.local</span>, then restart the dev server.
          </p>
        </div>
      )}

      {/* Linked accounts list */}
      <AnimatePresence>
        {linkedAccounts.length === 0 && plaidConfigured !== false && (
          <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-[12px] text-zinc-700 text-center py-2">
            No Intel Yet, Detective — link a bank account to begin.
          </motion.p>
        )}
        {linkedAccounts.map(acct => (
          <motion.div key={acct.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={GLASS}>
            <span className="text-xl">🏦</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate">{acct.bank_name}</p>
              <p className="text-[10px] text-zinc-600">
                {acct.account_type}{acct.mask ? ` ••••${acct.mask}` : ""}
                {acct.last_synced_at &&
                  ` · Synced ${new Date(acct.last_synced_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
              </p>
            </div>
            <span className="text-[10px] font-bold text-green-400">✓ Linked</span>
            <motion.button whileTap={{ scale: 0.85 }} onClick={() => unlinkAccount(acct.id)}
              className="text-zinc-700 hover:text-red-400 transition-colors ml-1 p-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </motion.button>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Info banner */}
      <AnimatePresence>
        {info && (
          <motion.div key="info" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-3 py-2.5 text-center"
            style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.2)" }}>
            <p className="text-[12px] font-bold text-violet-300">{info}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-3 py-2.5" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-[11px] text-red-400">{error}</p>
            <button onClick={() => setError(null)} className="text-[9px] text-zinc-600 mt-0.5 uppercase tracking-wider">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI spending analysis card */}
      <AnimatePresence>
        {analysis && (
          <motion.div key="analysis" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(168,85,247,0.2)", background: "rgba(168,85,247,0.04)" }}>

            <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(168,85,247,0.12)" }}>
              <span className="text-lg">🔍</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-violet-300 uppercase tracking-wider">Intel Report</p>
                <p className="text-[10px] text-zinc-500 leading-snug truncate">{analysis.summary}</p>
              </div>
              <div className="text-right flex-shrink-0">
                {analysis.grade && (
                  <span className="text-[18px] font-black"
                    style={{ color: analysis.grade === "A" ? "#22c55e" : analysis.grade === "B" ? "#a3e635" : analysis.grade === "C" ? "#fbbf24" : "#f87171" }}>
                    {analysis.grade}
                  </span>
                )}
                {analysis.total_monthly_savings > 0 && (
                  <p className="text-[9px] text-green-400 font-bold">${analysis.total_monthly_savings.toFixed(0)}/mo savings</p>
                )}
              </div>
            </div>

            {analysis.alerts.length === 0 ? (
              <p className="text-[12px] text-zinc-600 text-center py-3">No Intel Yet, Detective — no spending leaks found.</p>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {analysis.alerts.map((alert, i) => (
                  <div key={i} className="px-3 py-2 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: SEV_COLOR[alert.severity] ?? "#a3a3a3" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{alert.merchant}</p>
                      <p className="text-[10px] text-zinc-600 leading-snug">{alert.suggestion}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-1">
                      <p className="text-[11px] font-black text-green-400">-{alert.savings_pct}%</p>
                      <p className="text-[9px] text-zinc-700">{alert.cheaper_store}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setAnalysis(null)}
              className="w-full text-[9px] text-zinc-700 uppercase tracking-wider py-2 hover:text-zinc-500 transition-colors">
              Close Report
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Link button */}
      <motion.button whileTap={{ scale: 0.97 }} onClick={openPlaidLink}
        disabled={linking || plaidConfigured === false}
        className="w-full py-3.5 rounded-xl font-black text-[12px] tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity"
        style={{ background: "linear-gradient(135deg, #1a5276, #2e86c1)", boxShadow: "0 4px 20px rgba(46,134,193,0.3)", color: "#fff" }}>
        {linking
          ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting…</>
          : <><span className="text-base">🏦</span> {linkedAccounts.length ? "Link Another Bank" : "Link Your Bank"}</>
        }
      </motion.button>

      {linkedAccounts.length > 0 && (
        <p className="text-[10px] text-zinc-700 text-center">
          Powered by Plaid · Bank-grade encryption · Read-only access
        </p>
      )}
    </div>
  );
}
