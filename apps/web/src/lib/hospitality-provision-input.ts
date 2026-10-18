/** Admin-only input policy. No public partner enrolment or access grants. */
export type HospitalityProvisionInput = Readonly<{
  slug: string;
  name: string;
  ownerEmail: string;
  venueName: string;
}>;

export class HospitalityProvisionInputError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function parseHospitalityProvisionInput(value: unknown): HospitalityProvisionInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HospitalityProvisionInputError("INVALID_REQUEST");
  const body = value as Record<string, unknown>;
  const string = (key: keyof HospitalityProvisionInput) =>
    typeof body[key] === "string" ? body[key].trim() : "";
  const slug = string("slug").toLowerCase();
  const name = string("name");
  const ownerEmail = string("ownerEmail").toLowerCase();
  const venueName = string("venueName");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug) || slug.endsWith("-"))
    throw new HospitalityProvisionInputError("INVALID_PARTNER_SLUG");
  if (name.length < 2 || name.length > 200)
    throw new HospitalityProvisionInputError("INVALID_PARTNER_NAME");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 254)
    throw new HospitalityProvisionInputError("INVALID_OWNER_EMAIL");
  if (venueName.length < 2 || venueName.length > 200)
    throw new HospitalityProvisionInputError("INVALID_VENUE_NAME");
  return { slug, name, ownerEmail, venueName };
}
