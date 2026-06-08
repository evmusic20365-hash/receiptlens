import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Server-side only — Plaid client uses secret credentials.
const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

const config = new Configuration({
  basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID ?? "",
      "PLAID-SECRET":    process.env.PLAID_SECRET ?? "",
    },
  },
});

export const plaidClient = new PlaidApi(config);

export function isPlaidConfigured() {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

// Map Plaid personal_finance_category.primary to our normalized categories
export function normalizePlaidCategory(primary?: string, detailed?: string): string {
  const p = (primary ?? "").toUpperCase();
  const d = (detailed ?? "").toUpperCase();
  const combined = `${p} ${d}`;

  if (/FOOD_AND_DRINK/.test(p)) {
    if (/GROCERIES|SUPERMARKET/.test(combined)) return "Groceries";
    return "Dining";
  }
  if (/GENERAL_MERCHANDISE|SHOPS/.test(p)) return "Shopping";
  if (/PERSONAL_CARE/.test(p))              return "Beauty";
  if (/MEDICAL|HEALTHCARE/.test(p))         return "Health";
  if (/TRANSPORTATION|GAS/.test(p))         return "Transport";
  if (/TRAVEL/.test(p))                      return "Travel";
  if (/HOME_IMPROVEMENT|RENT_AND_UTIL/.test(p)) return "Household";
  if (/ENTERTAINMENT/.test(p))              return "Entertainment";
  if (/INCOME|TRANSFER_IN/.test(p))         return "Income";
  return "Other";
}
