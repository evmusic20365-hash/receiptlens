import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    console.error("[upload-receipt] failed to parse request body");
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { imageBase64 } = body as { imageBase64?: string };
  console.log("[upload-receipt] incoming request:", {
    hasImage:    !!imageBase64,
    imageLength: imageBase64?.length ?? 0,
  });

  if (!imageBase64) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  const mediaTypeMatch = imageBase64.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,/);
  if (!mediaTypeMatch) {
    console.error("[upload-receipt] unsupported or missing media type prefix");
    return Response.json({ error: "Unsupported image format. Use JPEG, PNG, GIF, or WebP." }, { status: 400 });
  }
  const mediaType = mediaTypeMatch[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const base64Data = imageBase64.replace(/^data:[^,]+,/, "");

  let message: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    message = await client.messages.create({
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
    console.log("[upload-receipt] Claude response:", message.content[0]);
  } catch (err) {
    console.error("[upload-receipt] Claude API error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Receipt extraction failed: ${msg}` }, { status: 500 });
  }

  const text  = message.content[0].type === "text" ? message.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error("[upload-receipt] no JSON found in Claude response, raw text:", text);
    return Response.json({ error: "Could not read receipt data — Claude returned unexpected output." }, { status: 500 });
  }

  try {
    const parsed = JSON.parse(match[0]);
    console.log("[upload-receipt] parsed result:", parsed);
    return Response.json(parsed);
  } catch (err) {
    console.error("[upload-receipt] JSON.parse error:", err, "raw match:", match[0]);
    return Response.json({ error: "Could not parse receipt data." }, { status: 500 });
  }
}
