import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  const { imageBase64 } = await request.json();

  // Extract media type from the data URL prefix
  const mediaTypeMatch = imageBase64.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,/);
  const mediaType = (mediaTypeMatch?.[1] ?? "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp";

  // Strip the data URL prefix to get raw base64
  const base64Data = imageBase64.replace(/^data:[^,]+,/, "");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Data },
          },
          {
            type: "text",
            text: 'Extract every line item from this receipt. Return ONLY a JSON object with no markdown:\n{ "storeName": string, "date": string, "items": [{ "name": string, "price": number, "quantity": number }], "total": number }',
          },
        ],
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
