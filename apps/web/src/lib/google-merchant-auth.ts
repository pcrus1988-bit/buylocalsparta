import "server-only";

const DEFAULT_PROJECT_NUMBER = "835567488295";
const DEFAULT_POOL_ID = "vercel";
const DEFAULT_PROVIDER_ID = "vercel";
const DEFAULT_SERVICE_ACCOUNT = "merchant-sync@konta-mou-merchant-production.iam.gserviceaccount.com";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const MERCHANT_SCOPE = "https://www.googleapis.com/auth/content";
const TOKEN_SAFETY_WINDOW_MS = 120_000;

type StsTokenResponse = Readonly<{
  access_token?: string;
  expires_in?: number;
}>;

type ServiceAccountTokenResponse = Readonly<{
  accessToken?: string;
  expireTime?: string;
}>;

let cachedMerchantToken: { accessToken: string; expiresAt: number } | undefined;

function configValue(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function googleErrorBody(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 700);
}

async function responseJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${googleErrorBody(text) || response.statusText}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export function googleWorkloadIdentityAudience(env: NodeJS.ProcessEnv = process.env): string {
  const projectNumber = configValue(env.GOOGLE_WIF_PROJECT_NUMBER, DEFAULT_PROJECT_NUMBER);
  const poolId = configValue(env.GOOGLE_WIF_POOL_ID, DEFAULT_POOL_ID);
  const providerId = configValue(env.GOOGLE_WIF_PROVIDER_ID, DEFAULT_PROVIDER_ID);
  return `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
}

export async function getGoogleMerchantAccessToken(env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const now = Date.now();
  if (cachedMerchantToken && cachedMerchantToken.expiresAt - now > TOKEN_SAFETY_WINDOW_MS) return cachedMerchantToken.accessToken;

  const subjectToken = env.VERCEL_OIDC_TOKEN?.trim();
  if (!subjectToken) throw new Error("VERCEL_OIDC_TOKEN is required for Google Merchant Workload Identity Federation.");

  const audience = googleWorkloadIdentityAudience(env);
  const stsBody = new URLSearchParams({
    audience,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    scope: CLOUD_PLATFORM_SCOPE,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    subject_token: subjectToken
  });
  const stsResponse = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: stsBody,
    cache: "no-store"
  });
  const sts = await responseJson<StsTokenResponse>(stsResponse, "Google STS token exchange");
  if (!sts.access_token) throw new Error("Google STS token exchange returned no access token.");

  const serviceAccount = configValue(env.GOOGLE_MERCHANT_SERVICE_ACCOUNT, DEFAULT_SERVICE_ACCOUNT);
  const impersonationUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`;
  const impersonationResponse = await fetch(impersonationUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${sts.access_token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ scope: [MERCHANT_SCOPE], lifetime: "3600s" }),
    cache: "no-store"
  });
  const impersonated = await responseJson<ServiceAccountTokenResponse>(impersonationResponse, "Google service-account impersonation");
  if (!impersonated.accessToken) throw new Error("Google service-account impersonation returned no access token.");

  const parsedExpiry = impersonated.expireTime ? Date.parse(impersonated.expireTime) : Number.NaN;
  const fallbackExpiry = now + Math.max(60, Number(sts.expires_in ?? 3600)) * 1000;
  cachedMerchantToken = {
    accessToken: impersonated.accessToken,
    expiresAt: Number.isFinite(parsedExpiry) ? parsedExpiry : fallbackExpiry
  };
  return cachedMerchantToken.accessToken;
}
