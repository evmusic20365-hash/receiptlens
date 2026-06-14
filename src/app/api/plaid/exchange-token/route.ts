import { plaidClient, isPlaidConfigured } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncAccountTransactions } from "@/lib/plaid-sync";

interface ExchangeBody {
  public_token: string;
  institution?: { name?: string; institution_id?: string };
}

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json(
      { error: "Plaid not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to .env.local" },
      { status: 503 },
    );
  }

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ExchangeBody;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }

  const { public_token, institution } = body;
  if (!public_token) return Response.json({ error: "public_token required" }, { status: 400 });

  try {
    // Exchange public token → access token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token });
    const accessToken = exchangeRes.data.access_token;
    const itemId      = exchangeRes.data.item_id;

    // Fetch accounts for this item
    const accountsRes = await plaidClient.accountsGet({ access_token: accessToken });
    const accounts    = accountsRes.data.accounts;

    const savedAccounts: Array<{ id: string; bank_name: string; account_type: string; mask: string | null; user_id: string; plaid_access_token: string; plaid_cursor: null }> = [];

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

      if (saved) {
        savedAccounts.push({
          id:                 saved.id,
          bank_name:          row.bank_name,
          account_type:       row.account_type,
          mask:               row.mask,
          user_id:            user.id,
          plaid_access_token: accessToken,
          plaid_cursor:       null,
        });
      }
    }

    // Kick off initial transaction sync directly (no HTTP, no broken URL)
    console.log(`[exchange-token] kicking off sync for ${savedAccounts.length} account(s)`);
    let totalSynced = 0;
    for (const saved of savedAccounts) {
      try {
        const added = await syncAccountTransactions(saved, user.id);
        totalSynced += added;
        console.log(`[exchange-token] synced account ${saved.id}: ${added} transactions added`);
      } catch (syncErr) {
        console.error(`[exchange-token] sync failed for account ${saved.id}:`, syncErr);
      }
    }

    return Response.json({
      success:      true,
      txns_synced:  totalSynced,
      accounts:     savedAccounts.map(a => ({
        id:           a.id,
        bank_name:    a.bank_name,
        account_type: a.account_type,
        mask:         a.mask,
      })),
    });
  } catch (err) {
    console.error("[plaid/exchange-token]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Plaid error: ${msg}` }, { status: 500 });
  }
}
