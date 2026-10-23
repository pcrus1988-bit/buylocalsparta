export type ImplicitEmailSession = {
  access_token: string;
  refresh_token: string;
};

/** Pure URL fragment parser, for Supabase's older implicit email-link flow.
 * Never send this fragment to the server or persist it in application state.
 */
export function implicitEmailSession(fragment: string): ImplicitEmailSession | null {
  if (fragment.length > 12000) return null;
  const raw = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!raw || raw.includes("#")) return null;
  const params = new URLSearchParams(raw);
  if (params.has("error") || params.has("error_code") ||
      params.get("token_type") !== "bearer") return null;

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token ||
      access_token.length > 8000 || refresh_token.length > 8000 ||
      /\s/.test(access_token) || /\s/.test(refresh_token)) return null;

  return { access_token, refresh_token };
}
