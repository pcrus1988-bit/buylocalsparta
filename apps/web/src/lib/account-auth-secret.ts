export function accountAuthSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for production account sessions");
  }
  return "buy-local-sparta-development-account-auth-secret-not-production";
}
