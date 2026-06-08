import { CountryCode, Products } from "plaid";
import { plaidClient, isPlaidConfigured } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  if (!isPlaidConfigured()) {
    return Response.json({ error: "Plaid not configured. Add PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV to .env.local" }, { status: 503 });
  }

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Receipt Detective",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return Response.json({ link_token: response.data.link_token });
  } catch (err) {
    console.error("[plaid/create-link-token]", err);
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Plaid error: ${msg}` }, { status: 500 });
  }
}
