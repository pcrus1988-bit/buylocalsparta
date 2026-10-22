import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return store.getAll(); },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({name,value,options}) => store.set(name,value,options));
          } catch {
            // Server Components cannot set cookies; proxy.ts handles refreshing them.
          }
        }
      }
    }
  );
}
