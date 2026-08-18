import { randomBytes } from "node:crypto";

const PROVISIONAL_VENDOR_ACCOUNT_PREFIX = "vendor-application-invite$";

/**
 * A provisional vendor-applicant identity reserves ownership without granting
 * authentication. `verifyPassword()` deliberately rejects this non-scrypt hash.
 * The real owner can later claim it through the normal email-verified signup flow.
 */
export function provisionalVendorApplicantPasswordHash(): string {
  return `${PROVISIONAL_VENDOR_ACCOUNT_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function isProvisionalVendorApplicantPasswordHash(value: string): boolean {
  return value.startsWith(PROVISIONAL_VENDOR_ACCOUNT_PREFIX);
}
