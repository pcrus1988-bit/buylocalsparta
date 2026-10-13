import { createSign } from "node:crypto";

// Temporary, branch-scoped one-shot operation. Never submits on production builds.
const isOneShotPreview =
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "ops/gsc-sitemap-submit-20261013";

if (isOneShotPreview) {
  const siteUrl = process.env.BLS_GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();
  const clientEmail = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (process.env.BLS_GOOGLE_SEARCH_CONSOLE_ENABLED !== "true" ||
      siteUrl !== "sc-domain:kontamou.site" || !clientEmail || !privateKey) {
    throw new Error("[gsc-sitemap-once] Missing or unexpected Search Console configuration.");
  }

  const base64 = (data) => Buffer.from(data).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = base64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/webmasters",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + "." + base64(signer.sign(privateKey));

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!tokenResponse.ok) {
    throw new Error("[gsc-sitemap-once] Google OAuth rejected (" + tokenResponse.status + ").");
  }
  const token = (await tokenResponse.json()).access_token;
  if (typeof token !== "string" || !token) {
    throw new Error("[gsc-sitemap-once] Google OAuth returned no token.");
  }

  const sitemap = "https://kontamou.site/sitemap.xml";
  const apiUrl = "https://www.googleapis.com/webmasters/v3/sites/" +
    encodeURIComponent(siteUrl) + "/sitemaps/" + encodeURIComponent(sitemap);
  const submitResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: { authorization: "Bearer " + token }
  });
  if (!submitResponse.ok) {
    throw new Error("[gsc-sitemap-once] Google sitemap submission failed (" + submitResponse.status + ").");
  }
  console.log("[gsc-sitemap-once] Google accepted sitemap submission (HTTP " +
    submitResponse.status + "): " + sitemap);

  // Independent Google-side read-back, not an inference from the submission response.
  const verifyResponse = await fetch(apiUrl, {
    headers: { authorization: "Bearer " + token }
  });
  if (!verifyResponse.ok) {
    throw new Error("[gsc-sitemap-once] Google sitemap verification failed (" + verifyResponse.status + ").");
  }
  const status = await verifyResponse.json();
  console.log("[gsc-sitemap-once] Verified Google sitemap state:", JSON.stringify({
    path: status.path,
    lastSubmitted: status.lastSubmitted,
    isPending: status.isPending,
    isSitemapsIndex: status.isSitemapsIndex,
    warnings: status.warnings,
    errors: status.errors
  }));
}
