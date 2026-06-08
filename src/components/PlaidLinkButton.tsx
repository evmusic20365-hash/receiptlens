"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

interface LinkedAccount {
  id: string;
  bank_name: string;
  account_type: string;
  mask: string | null;
  last_synced_at: string | null;
}

interface Props {
  onLinked?: (accounts: LinkedAccount[]) => void;
}

// ── Plaid Link flow ────────────────────────────────────────────────────────────
export default function PlaidBankSection({ onLinked }: Props) {
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [linking,        setLinking]        = useState(false);
  const [syncing,        setSyncing]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [success,        setSuccess]        = useState(false);
  const [plaidConfigured, setPlaidConfigured] = useState<boolean | null>(null);

  // Load existing linked accounts
  useEffect(() => {
    supabase.from("linked_accounts")
      .select("id, bank_name, account_type, mask, last_synced_at")
      .then(({ data }) => setLinkedAccounts((data ?? []) as LinkedAccount[]));
  }, []);

  // Check if Plaid is configured (ping the API)
  useEffect(() => {
    fetch("/api/plaid/create-link-token", {
      method: "POST",
      headers: { Authorization: "Bearer test-config-check" },
    }).then(async r => {
      const body = await r.json();
      // If error is "Plaid not configured", it's not set up
      setPlaidConfigured(!body.error?.includes("not configured"));
    }).catch(() => setPlaidConfigured(false));
  }, []);

  const openPlaidLink = useCallback(async () => {
    setError(null);
    setLinking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) throw new Error("Not authenticated");

      // Get link token from server
      const ltRes  = await fetch("/api/plaid/create-link-token", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      const ltData = await ltRes.json();
      if (ltData.error) throw new Error(ltData.error);

      // Dynamically import react-plaid-link to avoid SSR issues
      const { usePlaidLink: _unused, ...plaidModule } = await import("react-plaid-link");
      void _unused;

      // Use the low-level PlaidLink opener
      await new Promise<void>((resolve, reject) => {
        const handler = (plaidModule as unknown as { create: (cfg: object) => { open: () => void; destroy: () => void } }).create({
          token: ltData.link_token,
          onSuccess: async (public_token: string, metadata: { institution?: { name?: string; institution_id?: string } }) => {
            try {
              const exRes  = await fetch("/api/plaid/exchange-token", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
                body: JSON.stringify({ public_token, institution: metadata.institution }),
              });
              const exData = await exRes.json();
              if (exData.error) throw new Error(exData.error);

              // Reload linked accounts
              const { data } = await supabase.from("linked_accounts").select("id, bank_name, account_type, mask, last_synced_at");
              const accounts = (data ?? []) as LinkedAccount[];
              setLinkedAccounts(accounts);
              setSuccess(true);
              setTimeout(() => setSuccess(false), 4000);
              onLinked?.(accounts);
              resolve();
            } catch (e) { reject(e); }
          },
          onExit: (err: unknown) => {
            if (err) reject(new Error("Plaid Link closed with error"));
            else resolve();
          },
        });
        handler.open();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open Plaid Link");
    } finally {
      setLinking(false);
    }
  }, [onLinked]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;
      if (!authToken) throw new Error("Not authenticated");
      const res  = await fetch("/api/plaid/sync", { method: "POST", headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Refresh sync timestamps
      const { data: updated } = await supabase.from("linked_accounts").select("id, bank_name, account_type, mask, last_synced_at");
      setLinkedAccounts((updated ?? []) as LinkedAccount[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }, []);

  const unlinkAccount = useCallback(async (id: string) => {
    await supabase.from("linked_accounts").delete().eq("id", id);
    setLinkedAccounts(prev => prev.filter(a => a.id !== id));
  }, []);

  const GLASS: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Bank Accounts</p>
        {linkedAccounts.length > 0 && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={syncNow} disabled={syncing}
            className="text-[10px] font-bold text-violet-400 uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1"
            style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
            {syncing && <span className="w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full animate-spin" />}
            Sync
          </motion.button>
        )}
      </div>

      {/* Plaid not configured banner */}
      {plaidConfigured === false && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-0.5">Plaid Keys Required</p>
          <p className="text-[10px] text-zinc-500 leading-snug">
            Add <span className="font-mono text-zinc-400">PLAID_CLIENT_ID</span> and <span className="font-mono text-zinc-400">PLAID_SECRET</span> to <span className="font-mono text-zinc-400">.env.local</span> — get free sandbox keys at <span className="text-violet-400">dashboard.plaid.com</span>
          </p>
        </div>
      )}

      {/* Linked accounts list */}
      <AnimatePresence>
        {linkedAccounts.map(acct => (
          <motion.div key={acct.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={GLASS}>
            <span className="text-xl">🏦</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white truncate">{acct.bank_name}</p>
              <p className="text-[10px] text-zinc-600">
                {acct.account_type} {acct.mask ? `••••${acct.mask}` : ""}
                {acct.last_synced_at && (
                  <> · Synced {new Date(acct.last_synced_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</>
                )}
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

      {/* Success banner */}
      <AnimatePresence>
        {success && (
          <motion.div key="success" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl px-3 py-2.5 text-center" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-[12px] font-bold text-green-400">🎉 Bank linked! Syncing last 90 days of transactions…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Link button */}
      <motion.button whileTap={{ scale: 0.97 }} onClick={openPlaidLink}
        disabled={linking || plaidConfigured === false}
        className="w-full py-3.5 rounded-xl font-black text-[12px] tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
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
