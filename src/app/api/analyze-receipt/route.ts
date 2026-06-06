import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

const sampleTransactions = [
  { date: "2024-01-15", amount: 8.50,  description: "Coffee",                        category: "food",        time: "19:30" },
  { date: "2024-01-15", amount: 12.99, description: "Snack",                         category: "food",        time: "20:15" },
  { date: "2024-01-16", amount: 6.99,  description: "Convenience store",             category: "convenience", time: "19:45" },
  { date: "2024-01-17", amount: 5.49,  description: "Single-serve coffee",           category: "convenience", time: "08:00" },
  { date: "2024-01-18", amount: 3.99,  description: "Duplicate pasta (already own)", category: "duplicate",   time: "14:20" },
  { date: "2024-01-19", amount: 2.49,  description: "Duplicate rice",                category: "duplicate",   time: "16:30" },
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const receiptItems: ReceiptItem[] | null = body.items ?? null;

  console.log("[analyze-receipt] incoming request:", {
    hasItems:  !!receiptItems,
    itemCount: receiptItems?.length ?? 0,
    mode:      receiptItems ? "real receipt" : "sample data",
  });

  const dataText = receiptItems
    ? receiptItems
        .map((item) => `- ${item.name}: $${Number(item.price).toFixed(2)} x ${item.quantity || 1}`)
        .join("\n")
    : JSON.stringify(sampleTransactions, null, 2);

  const dataLabel = receiptItems ? "Receipt items" : "Transactions";

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze these ${dataLabel.toLowerCase()} and identify spending leaks. Return ONLY valid JSON — no markdown, no code fences.

{
  "score": <integer 0-100, shopping health — 100 = perfect, lower = more leaks>,
  "leaks": [
    { "name": "SHORT UPPERCASE LABEL", "amount": <integer monthly dollars>, "description": "<one specific sentence>" }
  ],
  "totalFound": <integer monthly total>,
  "yearlyPotential": <integer yearly total>
}

Rules:
- Return exactly 3 leaks, ordered largest to smallest
- Be specific: reference item names, prices, or patterns from the data
- score should reflect severity: ~70 for moderate leaks (~$300/mo)

${dataLabel}:
${dataText}`,
        },
      ],
    });
    console.log("[analyze-receipt] Claude response:", message.content[0]);
  } catch (err) {
    console.error("[analyze-receipt] Claude API error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Analysis failed: ${msg}` }, { status: 500 });
  }

  const text  = message.content[0].type === "text" ? message.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[analyze-receipt] no JSON found in Claude response, raw text:", text);
    return Response.json({ error: "Could not parse analysis response — Claude returned unexpected output." }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    console.log("[analyze-receipt] parsed result:", parsed);
    return Response.json(parsed);
  } catch (err) {
    console.error("[analyze-receipt] JSON.parse error:", err, "raw match:", match[0]);
    return Response.json({ error: "Could not parse analysis response." }, { status: 500 });
  }
}
