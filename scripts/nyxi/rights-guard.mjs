// NYXI: advisory rights guard; no authority to grant rights.
export const validSha256 = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
