import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

const ORIGIN = "https://mazi.kontamou.site";

/** Fixed same-origin redirects. End with an empty fragment to prevent a
 * credential-bearing fragment from leaking to ordinary member/join pages.
 */
function completedRedirect(path: "/members" | "/join?notice=expired_link") {
  return NextResponse.redirect(new URL(path + "#", ORIGIN));
}

/**
 * PKCE and custom token-hash email templates are completed on the server.
 * Older/implicit Supabase magic links return session tokens in a #fragment.
 * HTTP never sends that fragment to this handler: preserve it on a same-origin
 * redirect to /auth/finish, where browser code consumes and immediately
 * removes it from the address bar before exchanging tokens for SSR cookies.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (url.searchParams.has("error") || url.searchParams.has("error_code") || (code && hash)) {
    return completedRedirect("/join?notice=expired_link");
  }

  if (!code && !hash) {
    // Location deliberately has NO fragment. Per RFC 9110 section 10.2.2,
    // same-origin redirect inherits the original URL's #access_token fragment.
    return NextResponse.redirect(new URL("/auth/finish", ORIGIN));
  }

  const db = await createClient();
  let verified = false;
  if (code && !hash) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (hash && (type === "email" || type === "magiclink" || type === "invite") && !code) {
    const { error } = await db.auth.verifyOtp({ token_hash: hash, type });
    verified = !error;
  }
  return completedRedirect(verified ? "/members" : "/join?notice=expired_link");
}
