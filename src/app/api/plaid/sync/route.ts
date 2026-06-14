import { isPlaidConfigured } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncAccountTransactions } from "@/lib/plaid-sync";

interface SyncBody { account_ids?: string[]; }

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json({ error: "Plaid not configured." }, { status: 503 });
  }

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: SyncBody = {};
  try { body = await request.json(); } catch { /* no body is fine */ }

  let query = supabaseAdmin
    .from("linked_accounts")
    .select("id, user_id, plaid_access_token, plaid_cursor")
    .eq("user_id", user.id);
  if (body.account_ids?.length) query = query.in("id", body.account_ids);

  const { data: accounts, error: acctErr } = await query;
  if (acctErr || !accounts?.length) {
    return Response.json({ synced: 0, added: 0, message: "No linked accounts found." });
  }

  let totalAdded = 0;
  const results: Array<{ account_id: string; added: number; error?: string }> = [];

  for (const acct of accounts) {
    if (!acct.plaid_access_token) {
      results.push({ account_id: acct.id, added: 0, error: "no access token" });
      continue;
    }
    try {
      const added = await syncAccountTransactions(acct, user.id);
      totalAdded += added;
      results.push({ account_id: acct.id, added });
      console.log(`[plaid/sync] account ${acct.id}: +${added} transactions`);
    } catch (err) {
      console.error(`[plaid/sync] account ${acct.id}:`, err);
      results.push({ account_id: acct.id, added: 0, error: String(err) });
    }
  }

  return Response.json({ synced: accounts.length, added: totalAdded, results });
}
