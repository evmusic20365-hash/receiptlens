import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface ReceiptItem {
  name: string;
  price: number;
  quantity: number;
}

const sampleItems: ReceiptItem[] = [
  { name: "Duke Cannon Big Ass Soap",    price: 14.99, quantity: 1 },
  { name: "LaCroix Sparkling Water 12pk", price: 6.99,  quantity: 1 },
  { name: "Gillette Fusion ProGlide",     price: 19.99, quantity: 1 },
  { name: "Organic Broccoli",             price: 2.49,  quantity: 2 },
  { name: "Hanes White T-Shirts 3pk",     price: 18.99, quantity: 1 },
];

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const receiptItems: ReceiptItem[] | null = body.items ?? null;

  console.log("[analyze-receipt] incoming request:", {
    hasItems:  !!receiptItems,
    itemCount: receiptItems?.length ?? 0,
    mode:      receiptItems ? "real receipt" : "sample data",
  });

  const items = receiptItems ?? sampleItems;
  const dataText = items
    .map(item => `- ${item.name}: $${Number(item.price).toFixed(2)} × ${item.quantity || 1}`)
    .join("\n");

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are a price detective. Analyze these receipt items and identify where the customer could get better prices. Return ONLY valid JSON — no markdown, no code fences.

{
  "score": <integer 0-100; price efficiency — 100 = all best prices, lower = more savings possible>,
  "categories": [
    {
      "emoji": "<single emoji for this product category>",
      "name": "<category name, e.g. Grooming, Drinks, Clothing, Household, Produce>",
      "rating": "<'green' | 'yellow' | 'red'>",
      "items": [
        {
          "name": "<exact item name from receipt>",
          "paid": <price paid as number>,
          "suggestion": "<detective-style price finding or confirmation>",
          "cheaperStore": "<store name — only include for yellow and red ratings>",
          "cheaperPrice": <cheaper unit price as number — only include for yellow and red ratings>
        }
      ]
    }
  ],
  "totalSavings": <total dollars saveable from this receipt as a decimal number>,
  "yearlySavings": <yearly savings projection if this shopping pattern continues>
}

CRITICAL RULES — read carefully:
1. You are a PRICE DETECTIVE, not a lifestyle coach. NEVER comment on whether an item is healthy, necessary, or a good personal choice. Only compare prices objectively.
2. Rating definitions — price comparison ONLY:
   - green: This is the best or near-best price available. Suggestion: "Best price around. Case closed."
   - yellow: 1–19% cheaper somewhere else. Suggestion: "Walmart has this for $X.XX — saves you $X.XX."
   - red: 20%+ cheaper somewhere else, OR a multipack dramatically reduces per-unit cost. Suggestion: "Amazon has a 3-pack for $X.XX vs $X.XX here — save X%."
3. Every yellow or red item MUST include a real store name (Amazon, Walmart, Target, Costco, Walgreens, CVS, Aldi, Trader Joe's, Sam's Club) and a specific realistic price.
4. Suggest multipacks and bundles when they represent significantly better value.
5. Use detective personality in suggestions: "Case closed.", "No leads on a cheaper price.", "Suspect: Amazon at $X.XX.", "Investigation complete."
6. Group related items into logical named categories. One category can contain multiple items.
7. Be specific and accurate with price comparisons — only suggest stores that realistically carry that item.

Receipt items:
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
    console.log("[analyze-receipt] parsed result:", JSON.stringify(parsed, null, 2));
    return Response.json(parsed);
  } catch (err) {
    console.error("[analyze-receipt] JSON.parse error:", err, "raw:", match[0]);
    return Response.json({ error: "Could not parse analysis response." }, { status: 500 });
  }
}
