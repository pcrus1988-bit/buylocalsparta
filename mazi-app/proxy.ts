import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({request});
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet, authHeaders) {
          cookiesToSet.forEach(({name,value}) => request.cookies.set(name,value));
          response = NextResponse.next({request});
          cookiesToSet.forEach(({name,value,options}) => response.cookies.set(name,value,options));
          if (authHeaders) Object.entries(authHeaders).forEach(([key,value]) => response.headers.set(key,value));
        }
      }
    }
  );
  // Validate/refresh JWT; never authorize from an unverified getSession() cookie.
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {matcher:["/members/:path*","/proposals/:path*","/admin/:path*","/auth/:path*","/join/:path*","/dashboard/:path*","/marketplace/:path*","/forum/:path*","/livechat/:path*","/inbox/:path*","/community/:path*"]};
