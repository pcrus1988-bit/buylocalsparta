import { WEB_BUILD_VERSION } from "../../../lib/build";

export async function GET() {
  return Response.json({ ok: true, service: "buy-local-sparta-web", build: WEB_BUILD_VERSION });
}
