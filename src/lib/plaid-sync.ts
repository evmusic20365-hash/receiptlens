// Shared Plaid sync logic — imported by exchange-token and sync routes directly
// so we never need an internal HTTP call between routes.

import { plaidClient, normalizePlaidCategory } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase-admin";

interface LinkedAccount {
  id: string;
  user_id: string;
  plaid_access_token: string | null;
  plaid_cursor: string | null;
}

// Sync one linked account: fetch new/modified/removed transactions from Plaid,
// write to bank_transactions, update cursor, and run receipt auto-match.
// Returns the number of newly added transactions.
export async function syncAccountTransactions(
  acct: LinkedAccount,
  userId: string,
): Promise<number> {
  if (!acct.plaid_access_token) return 0;

  let nextCursor: string | undefined = acct.plaid_cursor ?? undefined;
  let hasMore = true;
  let totalAdded = 0;

  while (hasMore) {
    const syncRes = await plaidClient.transactionsSync({
      access_token: acct.plaid_access_token,
      cursor: nextCursor,
      count: 500,
    });

    const { added, modified, removed, next_cursor, has_more } = syncRes.data;

    if (added.length) {
      const rows = added.map(txn => ({
        user_id:             userId,
        account_id:          acct.id,
        plaid_txn_id:        txn.transaction_id,
        amount:              txn.amount,
        merchant:            txn.merchant_name ?? txn.name ?? "",
        plaid_category:      txn.personal_finance_category
          ? [txn.personal_finance_category.primary, txn.personal_finance_category.detailed]
          : (txn.category ?? []),
        normalized_category: normalizePlaidCategory(
          txn.personal_finance_category?.primary,
          txn.personal_finance_category?.detailed,
        ),
        date:    txn.date,
        pending: txn.pending ?? false,
      }));

      const { error: insErr } = await supabaseAdmin
        .from("bank_transactions")
        .upsert(rows, { onConflict: "plaid_txn_id", ignoreDuplicates: true });

      if (!insErr) totalAdded += rows.length;
    }

    for (const txn of modified) {
      await supabaseAdmin.from("bank_transactions").update({
        amount:   txn.amount,
        merchant: txn.merchant_name ?? txn.name ?? "",
        pending:  txn.pending ?? false,
      }).eq("plaid_txn_id", txn.transaction_id);
    }

    for (const txn of removed) {
      await supabaseAdmin
        .from("bank_transactions")
        .delete()
        .eq("plaid_txn_id", txn.transaction_id);
    }

    nextCursor = next_cursor;
    hasMore    = has_more;
  }

  await supabaseAdmin.from("linked_accounts").update({
    plaid_cursor:   nextCursor,
    last_synced_at: new Date().toISOString(),
  }).eq("id", acct.id);

  await autoMatchTransactions(userId, acct.id);
  return totalAdded;
}

// Match bank transactions to scanned receipts: same amount ±$0.11 within 2 days.
async function autoMatchTransactions(userId: string, accountId: string) {
  try {
    const { data: unmatched } = await supabaseAdmin
      .from("bank_transactions")
      .select("id, amount, date")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .is("matched_receipt_id", null)
      .gt("amount", 0);

    if (!unmatched?.length) return;

    const { data: receipts } = await supabaseAdmin
      .from("receipts")
      .select("id, total, receipt_date")
      .eq("user_id", userId);

    if (!receipts?.length) return;

    for (const txn of unmatched) {
      for (const receipt of receipts) {
        if (!receipt.total || !receipt.receipt_date) continue;
        const amountMatch = Math.abs(txn.amount - receipt.total) < 0.11;
        const daysDiff    = Math.abs(
          new Date(txn.date).getTime() - new Date(receipt.receipt_date).getTime()
        ) / 86_400_000;
        if (amountMatch && daysDiff <= 2) {
          await supabaseAdmin
            .from("bank_transactions")
            .update({ matched_receipt_id: receipt.id })
            .eq("id", txn.id);
          break;
        }
      }
    }
  } catch (err) {
    console.error("[autoMatch]", err);
  }
}
