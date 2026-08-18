import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hashPassword } from "@buy-local-sparta/core";
import { createPostgresRuntimeFromEnv, PostgresAdminAuthService } from "@buy-local-sparta/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "admin@buylocalsparta.gr";
const TOKEN_SHA256 = "253c94104945690d717344f2a6955598dc74c4a6f8032e220180595e84b3f5f9";

function tokenMatches(value: string) {
  const actual = Buffer.from(createHash("sha256").update(value).digest("hex"), "utf8");
  const expected = Buffer.from(TOKEN_SHA256, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "preview") {
    return new Response(null, { status: 404 });
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!tokenMatches(token)) {
    return new Response(null, { status: 404 });
  }

  const secret = process.env.BLS_AUTH_SECRET?.trim();
  if (!secret) {
    return Response.json({ ok: false, error: "BLS_AUTH_SECRET is not configured in preview" }, { status: 503 });
  }

  const db = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-admin-bootstrap-once" });
  const now = Date.now();
  const requestId = `admin-bootstrap-${randomUUID()}`;
  const password = `${randomBytes(24).toString("base64url")}!A9`;
  const userId = `usr_admin_${randomUUID().replaceAll("-", "")}`;

  try {
    const existing = await db.sqlPool.query<{ email: string }>(
      `select u.email::text as email
         from public.users u
         join public.platform_user_roles r on r.user_id = u.id
        where r.role = 'super_admin'
        limit 1`
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return Response.json({ ok: false, error: "A super_admin already exists", email: existing.rows[0]?.email }, { status: 409 });
    }

    await db.persistence.identity.saveAccount({
      scope: { marketId: "sparta", platformAccess: true, requestId },
      account: {
        id: userId,
        email: ADMIN_EMAIL,
        passwordHash: hashPassword(password),
        status: "active",
        roles: ["super_admin"],
        emailVerified: true,
        createdAt: now
      }
    });

    const auth = new PostgresAdminAuthService({ identity: db.persistence.identity, secret });
    const login = await auth.authenticate({ email: ADMIN_EMAIL, password, now: Date.now() });
    if (!login.principal.roles.includes("super_admin") || login.principal.vendorId) {
      throw new Error("Created account did not authenticate as a platform super_admin");
    }

    return Response.json(
      {
        ok: true,
        email: ADMIN_EMAIL,
        password,
        roles: login.principal.roles,
        verified: true
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "admin_bootstrap_failed" },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
