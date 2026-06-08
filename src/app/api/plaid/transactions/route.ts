import { supabaseAdmin } from "@/lib/supabase-admin";

// GET /api/plaid/transactions?limit=50&offset=0&category=Groceries&from=2025-01-01&to=2025-12-31
export async function GET(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url    = new URL(request.url);
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const cat    = url.searchParams.get("category");
  const from   = url.searchParams.get("from");
  const to     = url.searchParams.get("to");
  const search = url.searchParams.get("q");

  let query = supabaseAdmin
    .from("bank_transactions")
    .select("id, amount, merchant, normalized_category, date, pending, matched_receipt_id, notes, account_id, linked_accounts(bank_name, mask, account_type)")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (cat)    query = query.eq("normalized_category", cat);
  if (from)   query = query.gte("date", from);
  if (to)     query = query.lte("date", to);
  if (search) query = query.ilike("merchant", `%${search}%`);

  const { data, error, count } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ transactions: data ?? [], count });
}
