let cached: { rate: number; expiresAt: number } | null = null;

const ECB_DAILY_XML = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CACHE_MS = 6 * 60 * 60 * 1000;

export async function getUsdToEurReferenceRate(
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetchImpl(ECB_DAILY_XML, {
      method: "GET",
      headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
      signal: controller.signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`ECB FX request failed with HTTP ${response.status}`);
    const xml = await response.text();
    const match = xml.match(/currency=['"]USD['"]\s+rate=['"]([0-9.]+)['"]/i);
    const eurToUsd = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(eurToUsd) || eurToUsd <= 0) {
      throw new Error("ECB FX response did not contain a valid USD reference rate");
    }
    const rate = 1 / eurToUsd;
    cached = { rate, expiresAt: Date.now() + CACHE_MS };
    return rate;
  } finally {
    clearTimeout(timeout);
  }
}
