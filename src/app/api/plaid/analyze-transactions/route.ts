import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase-admin";

const client = new Anthropic();

export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch last 30 days of debit transactions
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0];

  const { data: txns, error: txnErr } = await supabaseAdmin
    .from("bank_transactions")
    .select("amount, merchant, normalized_category, date")
    .eq("user_id", user.id)
    .gt("amount", 0)
    .gte("date", thirtyDaysAgo)
    .order("amount", { ascending: false })
    .limit(100);

  if (txnErr) return Response.json({ error: txnErr.message }, { status: 500 });

  if (!txns?.length) {
    return Response.json({
      alerts: [],
      total_monthly_savings: 0,
      summary: "No Intel Yet, Detective — sync your bank transactions first.",
      grade: null,
    });
  }

  // Aggregate by merchant
  const merchantMap: Record<string, { count: number; total: number; category: string }> = {};
  for (const txn of txns) {
    const key = (txn.merchant?.trim() || "Unknown").slice(0, 60);
    if (!merchantMap[key]) merchantMap[key] = { count: 0, total: 0, category: txn.normalized_category ?? "Other" };
    merchantMap[key].count  += 1;
    merchantMap[key].total  += Number(txn.amount);
  }

  // Skip categories that can't be comparison-shopped
  const SKIP_CATS = new Set(["Income", "Transport", "Travel", "Other"]);
  const summaryLines = Object.entries(merchantMap)
    .filter(([, v]) => !SKIP_CATS.has(v.category))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 25)
    .map(([merchant, { count, total, category }]) => {
      const avg = total / count;
      return `- ${merchant} (${category}): ${count}x, $${total.toFixed(2)} total, avg $${avg.toFixed(2)}`;
    });

  if (!summaryLines.length) {
    return Response.json({
      alerts: [],
      total_monthly_savings: 0,
      summary: "No Intel Yet, Detective — no comparable purchases found.",
      grade: "A",
    });
  }

  const summaryText = summaryLines.join("\n");

  console.log(`[analyze-transactions] user=${user.id}, merchants=${summaryLines.length}`);

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: `You are a covert price-intelligence operative analyzing a target's bank transaction history. Your mission: identify spending leaks — places they're overpaying vs. cheaper alternatives. Return ONLY valid JSON, no markdown, no code fences.

{
  "alerts": [
    {
      "merchant": "<exact merchant name from data>",
      "category": "<category>",
      "avg_amount": <average transaction amount as number>,
      "cheaper_store": "<specific alternative store where this is cheaper>",
      "cheaper_price": <estimated cheaper price for an equivalent purchase>,
      "savings_pct": <integer, estimated percentage savings>,
      "suggestion": "<1 punchy detective-voice tip, e.g. 'Intel confirmed: Costco carries this for $X — that's $Y less per visit.'>",
      "severity": "<'high' | 'medium' | 'low'>"
    }
  ],
  "total_monthly_savings": <total estimated monthly savings as number>,
  "summary": "<1 sentence in detective voice, e.g. 'Case file: 4 spending leaks detected, $XX.XX/month at risk.'>",
  "grade": "<'A' | 'B' | 'C' | 'D'> — overall spending efficiency"
}

RULES:
1. Only flag merchants with 15%+ savings potential at a real alternative store.
2. Name specific realistic stores: Amazon, Walmart, Target, Costco, Aldi, Sam's Club, Trader Joe's, Walgreens, CVS.
3. Detective/spy voice in suggestions. Punchy, one sentence.
4. Skip: transfers, income, rent, utilities, insurance — not comparison-shoppable.
5. Maximum 8 alerts. Rank by highest monthly dollar savings first.
6. severity: 'high' = 30%+ savings, 'medium' = 15–30%, 'low' = 15% exactly.
7. avg_amount and cheaper_price must be realistic dollar amounts (not zero).
8. If spending looks efficient overall, say so and give grade A or B.

Bank transaction summary (last 30 days, grouped by merchant):
${summaryText}`,
      }],
    });
  } catch (err) {
    console.error("[analyze-transactions] Claude error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
  }

  const text  = message.content[0].type === "text" ? message.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[analyze-transactions] no JSON in response:", text.slice(0, 200));
    return Response.json({ error: "Could not parse Claude response." }, { status: 500 });
  }

  let parsed: {
    alerts?: Array<{
      merchant: string; category: string; avg_amount: number;
      cheaper_store: string; cheaper_price: number; savings_pct: number; suggestion: string; severity: string;
    }>;
    total_monthly_savings?: number;
    summary?: string;
    grade?: string;
  };
  try { parsed = JSON.parse(match[0]); }
  catch { return Response.json({ error: "Could not parse response JSON." }, { status: 500 }); }

  const alerts = parsed.alerts ?? [];

  // Persist alerts — clear stale ones first, then insert fresh batch
  if (alerts.length) {
    await supabaseAdmin.from("spending_alerts").delete().eq("user_id", user.id);
    const { error: insertErr } = await supabaseAdmin.from("spending_alerts").insert(
      alerts.map(a => ({
        user_id:       user.id,
        merchant:      a.merchant,
        category:      a.category,
        avg_amount:    a.avg_amount,
        cheaper_store: a.cheaper_store,
        cheaper_price: a.cheaper_price,
        savings_pct:   a.savings_pct,
        suggestion:    a.suggestion,
      }))
    );
    if (insertErr) console.error("[analyze-transactions] insert error:", insertErr);
  }

  console.log(`[analyze-transactions] ${alerts.length} alerts, $${parsed.total_monthly_savings ?? 0}/mo, grade ${parsed.grade}`);
  return Response.json(parsed);
}
