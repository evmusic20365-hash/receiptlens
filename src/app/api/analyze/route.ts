import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const client = new Anthropic();

  // Sample transaction data for demo
  const sampleTransactions = [
    { date: "2024-01-15", amount: 8.5, description: "Coffee", category: "food", time: "19:30" },
    { date: "2024-01-15", amount: 12.99, description: "Snack", category: "food", time: "20:15" },
    { date: "2024-01-16", amount: 6.99, description: "Convenience store", category: "convenience", time: "19:45" },
    { date: "2024-01-17", amount: 5.49, description: "Single-serve coffee", category: "convenience", time: "08:00" },
    { date: "2024-01-18", amount: 3.99, description: "Duplicate pasta (already own)", category: "duplicate", time: "14:20" },
    { date: "2024-01-19", amount: 2.49, description: "Duplicate rice", category: "duplicate", time: "16:30" },
  ];

  const prompt = `Analyze these transactions and identify spending leaks. Return a JSON object with this structure (no markdown, just JSON):
{
  "leaks": [
    {
      "name": "LEAK NAME",
      "amount": monthly_amount_in_dollars,
      "description": "One sentence insight about this leak"
    }
  ],
  "totalFound": total_monthly_leak,
  "yearlyPotential": total_yearly_leak
}

Transactions:
${JSON.stringify(sampleTransactions, null, 2)}

Identify the 3 biggest leak categories. Be specific about times/patterns.`;

  const message = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  // Extract the JSON from Claude's response
  const responseText = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  const analysisData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

  return Response.json(analysisData || { error: "Failed to analyze" });
}
