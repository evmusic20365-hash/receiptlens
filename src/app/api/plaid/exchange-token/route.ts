import { plaidClient, isPlaidConfigured, normalizePlaidCategory } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface ExchangeBody { public_token: string; institution?: { name?: string; institution_id?: string }; }

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json({ error: "Plaid not configured." }, { status: 503 });
  }

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ExchangeBody;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }

  const { public_token, institution } = body;
  if (!public_token) return Response.json({ error: "public_token required" }, { status: 400 });

  try {
    // Exchange public token → access token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = exchangeRes.data.access_token;
    const itemId      = exchangeRes.data.item_id;

    // Fetch accounts associated with this item
    const accountsRes = await plaidClient.accountsGet({ access_token: accessToken });
    const accounts    = accountsRes.data.accounts;

    // Save each account to linked_accounts
    const savedAccounts = [];
    for (const acct of accounts) {
      const row = {
        user_id:            user.id,
        bank_name:          institution?.name ?? accountsRes.data.item.institution_id ?? "Unknown Bank",
        plaid_account_id:   acct.account_id,
        plaid_access_token: accessToken,
        plaid_item_id:      itemId,
        account_type:       acct.type,
        mask:               acct.mask ?? null,
        last_synced_at:     null,
      };
      const { data: saved } = await supabaseAdmin
        .from("linked_accounts")
        .upsert(row, { onConflict: "plaid_account_id" })
        .select("id")
        .single();
      if (saved) savedAccounts.push({ ...row, id: saved.id, name: acct.name });
    }

    // Kick off initial transaction sync (last 90 days)
    const syncRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", "") ?? ""}/api/plaid/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ account_ids: savedAccounts.map(a => a.id) }),
    }).catch(() => null); // Don't block on sync failure

    void syncRes;

    return Response.json({
      success: true,
      accounts: savedAccounts.map(a => ({ id: a.id, bank_name: a.bank_name, account_type: a.account_type, mask: a.mask })),
    });
  } catch (err) {
    console.error("[plaid/exchange-token]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Plaid error: ${msg}` }, { status: 500 });
  }
}

export { normalizePlaidCategory };
