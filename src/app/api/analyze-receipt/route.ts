import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const sampleTransactions = [
  { date: "2024-01-15", amount: 8.50,  description: "Coffee",                      category: "food",        time: "19:30" },
  { date: "2024-01-15", amount: 12.99, description: "Snack",                       category: "food",        time: "20:15" },
  { date: "2024-01-16", amount: 6.99,  description: "Convenience store",           category: "convenience", time: "19:45" },
  { date: "2024-01-17", amount: 5.49,  description: "Single-serve coffee",         category: "convenience", time: "08:00" },
  { date: "2024-01-18", amount: 3.99,  description: "Duplicate pasta (already own)", category: "duplicate", time: "14:20" },
  { date: "2024-01-19", amount: 2.49,  description: "Duplicate rice",              category: "duplicate",   time: "16:30" },
];

export async function POST() {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze these transactions and identify spending leaks. Return ONLY valid JSON — no markdown, no code fences.

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
- Be specific: reference times, percentages, or patterns from the data
- score should reflect severity: ~70 for moderate leaks (~$300/mo)

Transactions:
${JSON.stringify(sampleTransactions, null, 2)}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    return Response.json({ error: "parse_failed" }, { status: 500 });
  }

  return Response.json(JSON.parse(match[0]));
}
