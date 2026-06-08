import { plaidClient, isPlaidConfigured, normalizePlaidCategory } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  // Fetch linked accounts for this user (optionally filtered to specific IDs)
  let query = supabaseAdmin.from("linked_accounts").select("*").eq("user_id", user.id);
  if (body.account_ids?.length) query = query.in("id", body.account_ids);
  const { data: accounts, error: acctErr } = await query;
  if (acctErr || !accounts?.length) return Response.json({ synced: 0, added: 0 });

  let totalAdded = 0;

  for (const acct of accounts) {
    if (!acct.plaid_access_token) continue;

    let cursor    = acct.plaid_cursor ?? undefined;
    let hasMore   = true;
    let nextCursor = cursor;

    try {
      while (hasMore) {
        const syncRes = await plaidClient.transactionsSync({
          access_token: acct.plaid_access_token,
          cursor: nextCursor,
          count: 500,
        });

        const { added, modified, removed, next_cursor, has_more } = syncRes.data;

        // Insert new transactions
        if (added.length) {
          const rows = added.map(txn => ({
            user_id:            user.id,
            account_id:         acct.id,
            plaid_txn_id:       txn.transaction_id,
            amount:             txn.amount,
            merchant:           txn.merchant_name ?? txn.name ?? "",
            plaid_category:     txn.personal_finance_category
              ? [txn.personal_finance_category.primary, txn.personal_finance_category.detailed]
              : (txn.category ?? []),
            normalized_category: normalizePlaidCategory(
              txn.personal_finance_category?.primary,
              txn.personal_finance_category?.detailed
            ),
            date:    txn.date,
            pending: txn.pending ?? false,
          }));

          const { error: insErr } = await supabaseAdmin
            .from("bank_transactions")
            .upsert(rows, { onConflict: "plaid_txn_id", ignoreDuplicates: true });

          if (!insErr) totalAdded += rows.length;
        }

        // Update modified transactions
        for (const txn of modified) {
          await supabaseAdmin.from("bank_transactions").update({
            amount:   txn.amount,
            merchant: txn.merchant_name ?? txn.name ?? "",
            pending:  txn.pending ?? false,
          }).eq("plaid_txn_id", txn.transaction_id);
        }

        // Remove deleted transactions
        for (const txn of removed) {
          await supabaseAdmin.from("bank_transactions").delete().eq("plaid_txn_id", txn.transaction_id);
        }

        nextCursor = next_cursor;
        hasMore    = has_more;
      }

      // Update cursor + last_synced_at
      await supabaseAdmin.from("linked_accounts").update({
        plaid_cursor:  nextCursor,
        last_synced_at: new Date().toISOString(),
      }).eq("id", acct.id);

      // Auto-match transactions to receipts (same date ±1 day, same amount)
      await autoMatchTransactions(user.id, acct.id);

    } catch (err) {
      console.error(`[plaid/sync] account ${acct.id}:`, err);
    }
  }

  return Response.json({ synced: accounts.length, added: totalAdded });
}

// Match bank transactions to scanned receipts by amount + date proximity
async function autoMatchTransactions(userId: string, accountId: string) {
  try {
    const { data: unmatched } = await supabaseAdmin
      .from("bank_transactions")
      .select("id, amount, date, merchant")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .is("matched_receipt_id", null)
      .gt("amount", 0); // only debits

    if (!unmatched?.length) return;

    const { data: receipts } = await supabaseAdmin
      .from("receipts")
      .select("id, total, receipt_date, store_name")
      .eq("user_id", userId);

    if (!receipts?.length) return;

    for (const txn of unmatched) {
      for (const receipt of receipts) {
        if (!receipt.total || !receipt.receipt_date) continue;
        const amountMatch = Math.abs(txn.amount - receipt.total) < 0.11;
        const txnDate  = new Date(txn.date).getTime();
        const recDate  = new Date(receipt.receipt_date).getTime();
        const daysDiff = Math.abs(txnDate - recDate) / 86_400_000;
        if (amountMatch && daysDiff <= 2) {
          await supabaseAdmin.from("bank_transactions").update({ matched_receipt_id: receipt.id }).eq("id", txn.id);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[autoMatch]", err);
  }
}
