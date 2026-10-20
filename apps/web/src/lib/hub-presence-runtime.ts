import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { directoryPlanAgreement } from "./hub-directory-agreement";

export type ApprovedPresence = Readonly<{
  id: string; businessName: string; hubCity: string;
  eligibleEmail: boolean; accepted: boolean; templateVersion?: string;
}>;

export async function approvedHubPresence(id: string, principal?: SessionPrincipal): Promise<ApprovedPresence | undefined> {
  if (!/^hubprospect_[A-Za-z0-9_-]{6,90}$/.test(id)) return undefined;
  const result = await getProductionPostgresRuntime().sqlPool.query<SqlRow>(`
    SELECT h.public_id,h.business_name,h.hub_city,h.email,h.owner_user_id,
           u.public_id AS owner_public_id, EXISTS(
             SELECT 1 FROM vendor_directory_agreement_acceptances a
             WHERE a.prospect_id=h.id AND a.plan_code='presence'
           ) AS accepted
    FROM hub_expansion_prospects h
    LEFT JOIN users u ON u.id=h.owner_user_id
    WHERE h.public_id=$1 AND h.plan_code='presence' AND h.status='approved'
    LIMIT 1
  `, [id]);
  const row = result.rows[0];
  if (!row) return undefined;
  const eligibleEmail = Boolean(principal?.roles.includes("customer") &&
    principal.email?.trim().toLowerCase() === String(row.email).trim().toLowerCase());
  return {
    id: String(row.public_id),
    businessName: String(row.business_name), hubCity: String(row.hub_city),
    eligibleEmail,
    accepted: eligibleEmail && row.accepted === true
  };
}

export async function acceptApprovedHubPresence(id: string, principal: SessionPrincipal, input: {
  templateSha256: string; termsConsent: boolean; publicationConsent: boolean
}) {
  if (!/^hubprospect_[A-Za-z0-9_-]{6,90}$/.test(id) || !principal.roles.includes("customer") ||
    !input.termsConsent || !input.publicationConsent ||
    !/^[0-9a-f]{64}$/.test(input.templateSha256)) throw new Error("PRESENCE_AGREEMENT_CONSENT_REQUIRED");
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction(
    { platformAccess: true, marketId: "sparta", requestId: "presence-agreement:" + id },
    async tx => {
      const user = await tx.query<SqlRow>(
        "SELECT id::text AS id,email::text AS email FROM users WHERE public_id=$1 AND status='active' AND email_verified_at IS NOT NULL LIMIT 1",
        [principal.userId]
      );
      if (!user.rowCount || !principal.email ||
          String(user.rows[0].email).toLowerCase() !== principal.email.trim().toLowerCase()) {
        throw new Error("VERIFIED_ACCOUNT_REQUIRED");
      }
      const prospect = await tx.query<SqlRow>(`
        SELECT id::text AS id,public_id,status::text AS status,plan_code,billing_cycle,
               legal_name,business_name,tax_number,contact_name,email,
               owner_user_id::text AS owner_user_id
        FROM hub_expansion_prospects WHERE public_id=$1 FOR UPDATE
      `, [id]);
      const row = prospect.rows[0];
      if (!row || row.plan_code !== "presence" || row.status !== "approved") throw new Error("PRESENCE_NOT_APPROVED");
      if (String(row.email).trim().toLowerCase() !== String(user.rows[0].email).toLowerCase()) {
        throw new Error("PRESENCE_EMAIL_MISMATCH");
      }
      if (row.owner_user_id && String(row.owner_user_id) !== String(user.rows[0].id)) {
        throw new Error("PRESENCE_ALREADY_OWNED");
      }
      const agreement = directoryPlanAgreement(row as Parameters<typeof directoryPlanAgreement>[0], "presence");
      if (input.templateSha256 !== agreement.templateSha256) throw new Error("PRESENCE_AGREEMENT_VERSION_CHANGED");
      const old = await tx.query<SqlRow>(`
        SELECT owner_user_id::text AS owner_user_id,template_sha256
        FROM vendor_directory_agreement_acceptances
        WHERE prospect_id=$1::uuid AND template_version=$2 LIMIT 1
      `, [row.id, agreement.plan.templateVersion]);
      if (old.rowCount) {
        if (String(old.rows[0].owner_user_id) !== String(user.rows[0].id) ||
          String(old.rows[0].template_sha256) !== agreement.templateSha256) throw new Error("PRESENCE_AGREEMENT_CONFLICT");
        return;
      }
      await tx.query(`
        INSERT INTO vendor_directory_agreement_acceptances
          (prospect_id,owner_user_id,plan_code,billing_cycle,template_version,
           template_sha256,terms_snapshot,publication_consent,accepted_at)
        VALUES($1::uuid,$2::uuid,'presence',$3,$4,$5,$6::jsonb,true,now())
      `, [row.id,user.rows[0].id,agreement.plan.billingCycle,agreement.plan.templateVersion,
           agreement.templateSha256,JSON.stringify(agreement.terms)]);
      await tx.query("UPDATE hub_expansion_prospects SET owner_user_id=$2::uuid,updated_at=now() WHERE id=$1::uuid",
        [row.id,user.rows[0].id]);
      // Paid PRESENCE must remain approved, not converted, until billing and public publication are ready.
    },
    { isolation: "serializable" }
  );
}
