/**
 * Official GEMI publicity URL. Never generate contact links from research
 * addresses/phones, and never interpolate unchecked external URLs.
 */
export function officialGemiPublicityUrl(gemiNumber: string): string | undefined {
  const digits = gemiNumber.trim();
  if (!/^[0-9]{8,20}$/.test(digits)) return undefined;
  return "https://publicity.businessportal.gr/company/" + digits;
}
