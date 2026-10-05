export function customerTryOnGenerationConfigured(): boolean {
  return Boolean(process.env.FASHN_API_KEY?.trim());
}
