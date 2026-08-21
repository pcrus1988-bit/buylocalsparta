export type LawfulBasis = "contract" | "legal_obligation" | "legitimate_interest" | "consent";
export type GovernanceState = "implemented" | "partial" | "policy_review";
export type RetentionMode = "fixed" | "record_expiry" | "statutory" | "lifecycle" | "review_required";

export type ProcessingActivity = Readonly<{
  id: string;
  name: string;
  purpose: string;
  lawfulBases: readonly LawfulBasis[];
  dataSubjects: readonly string[];
  dataCategories: readonly string[];
  systems: readonly string[];
  recipients: readonly string[];
  access: readonly string[];
  retentionKey: string;
  state: GovernanceState;
}>;

export type RetentionRule = Readonly<{
  key: string;
  label: string;
  mode: RetentionMode;
  rule: string;
  enforcement: string;
  state: GovernanceState;
}>;

export type ProviderGovernance = Readonly<{
  name: string;
  purpose: string;
  data: string;
  roleStatus: "known_processor" | "recipient_role_review" | "public_authority" | "infrastructure_role_review";
  contractReview: string;
}>;

export const PROCESSING_ACTIVITIES: readonly ProcessingActivity[] = [
  {
    id: "account_auth",
    name: "Λογαριασμός και authentication",
    purpose: "Δημιουργία λογαριασμού, σύνδεση, επιβεβαίωση email, ανάκτηση πρόσβασης και προστασία συνεδρίας.",
    lawfulBases: ["contract", "legitimate_interest"],
    dataSubjects: ["customers", "vendor users", "platform staff"],
    dataCategories: ["identity", "contact", "credentials/hash", "session identifiers", "security events"],
    systems: ["users", "customer_profiles", "user_sessions", "email_verification_tokens", "password_reset_tokens"],
    recipients: ["Resend", "hosting/database infrastructure"],
    access: ["subject self-service", "authorized support/security", "platform runtime"],
    retentionKey: "identity_sessions",
    state: "implemented"
  },
  {
    id: "orders_checkout",
    name: "Καλάθι, checkout και παραγγελίες",
    purpose: "Δημιουργία και εκτέλεση ενιαίας παραγγελίας marketplace.",
    lawfulBases: ["contract"],
    dataSubjects: ["customers", "recipients"],
    dataCategories: ["order contents", "address/locker snapshots", "contact", "pricing", "fulfilment"],
    systems: ["carts", "customer_orders", "order_lines", "fulfilment_orders", "order_timeline_events"],
    recipients: ["assigned fulfilment partner where necessary", "delivery provider where necessary"],
    access: ["customer", "purpose-scoped vendor view", "support", "logistics", "authorized platform operations"],
    retentionKey: "commerce_records",
    state: "partial"
  },
  {
    id: "payments_refunds",
    name: "Πληρωμές και refunds",
    purpose: "Έναρξη πληρωμής, reconciliation, λογιστική συμφωνία και επιστροφή χρημάτων.",
    lawfulBases: ["contract", "legal_obligation"],
    dataSubjects: ["customers"],
    dataCategories: ["contact", "order reference", "amount", "provider transaction references", "refund evidence"],
    systems: ["payments", "payment_events", "refunds", "customer_orders"],
    recipients: ["Viva.com", "authorized finance"],
    access: ["finance", "limited support/operations where required", "platform payment runtime"],
    retentionKey: "financial_records",
    state: "partial"
  },
  {
    id: "tax_mydata",
    name: "Φορολογικά / AADE myDATA",
    purpose: "Έκδοση, διαβίβαση, συμφωνία και νόμιμη διατήρηση φορολογικών παραστατικών.",
    lawfulBases: ["legal_obligation"],
    dataSubjects: ["customers", "vendors where fiscal evidence requires it"],
    dataCategories: ["invoice/order data", "tax identifiers where applicable", "MARK/provider references", "fiscal evidence"],
    systems: ["tax_documents", "tax_document_lines", "myDATA transmission/audit records"],
    recipients: ["AADE / myDATA", "authorized finance/accounting"],
    access: ["platform finance", "authorized tax operations", "auditor where justified"],
    retentionKey: "financial_records",
    state: "partial"
  },
  {
    id: "pickup_delivery",
    name: "Παραλαβή και παράδοση",
    purpose: "Προετοιμασία, ασφαλής παραλαβή, τοπική παράδοση ή αποστολή της συγκεκριμένης παραγγελίας.",
    lawfulBases: ["contract"],
    dataSubjects: ["customers", "recipients"],
    dataCategories: ["order reference", "items", "recipient identity", "delivery contact/address/locker only when needed", "pickup code/QR"],
    systems: ["fulfilment_orders", "pickup_groups", "shipments", "shipping provider events"],
    recipients: ["assigned vendor", "BOX NOW or other selected delivery provider"],
    access: ["purpose-scoped vendor fulfilment", "logistics", "customer support"],
    retentionKey: "commerce_records",
    state: "implemented"
  },
  {
    id: "communications_support",
    name: "Transactional communications και υποστήριξη",
    purpose: "Order updates, support, Ask Local, advice, returns and customer-requested communications.",
    lawfulBases: ["contract", "legitimate_interest"],
    dataSubjects: ["customers", "vendors", "message participants"],
    dataCategories: ["email", "message content", "support case data", "related order/request references"],
    systems: ["notifications", "support cases", "conversations/messages", "Ask Local workflow", "email delivery events"],
    recipients: ["Resend", "assigned participant where the workflow requires it"],
    access: ["participants", "customer support", "authorized operations"],
    retentionKey: "communications",
    state: "policy_review"
  },
  {
    id: "personalization",
    name: "Προαιρετική προσωποποίηση",
    purpose: "Recommendations, recently viewed and saved signals requested/enabled by the customer.",
    lawfulBases: ["consent"],
    dataSubjects: ["customers"],
    dataCategories: ["preference flags", "saved products/vendors", "recent product views"],
    systems: ["customer_profiles", "saved_products", "saved_vendors", "recently_viewed_products"],
    recipients: ["none outside platform by default"],
    access: ["customer", "privacy/support where justified", "personalization runtime"],
    retentionKey: "personalization",
    state: "partial"
  },
  {
    id: "analytics",
    name: "Προαιρετικά product analytics",
    purpose: "Μέτρηση product views, engagement και conversion/performance μετά από Analytics consent.",
    lawfulBases: ["consent"],
    dataSubjects: ["site visitors/customers who accepted Analytics"],
    dataCategories: ["pseudonymous analytics identifier", "product interaction", "surface", "engagement"],
    systems: ["bls_analytics cookie", "product_analytics_events", "analytics_events"],
    recipients: ["platform analytics"],
    access: ["authorized analytics roles", "analytics runtime"],
    retentionKey: "analytics",
    state: "partial"
  },
  {
    id: "security_audit",
    name: "Ασφάλεια, abuse prevention και audit",
    purpose: "Προστασία λογαριασμών/υπηρεσίας, rate limiting, διερεύνηση συμβάντων και λογοδοσία προνομιακών ενεργειών.",
    lawfulBases: ["legitimate_interest", "legal_obligation"],
    dataSubjects: ["visitors", "customers", "vendors", "staff"],
    dataCategories: ["pseudonymous identifiers", "security event metadata", "actor/action/resource audit evidence"],
    systems: ["security_events", "audit events", "bls_marketplace", "rate-limit stores"],
    recipients: ["authorized security/audit personnel"],
    access: ["security", "auditor", "super admin only where justified"],
    retentionKey: "security_audit",
    state: "partial"
  },
  {
    id: "privacy_rights",
    name: "Άσκηση δικαιωμάτων GDPR",
    purpose: "Παραλαβή, επαλήθευση, επεξεργασία και τεκμηρίωση αιτημάτων πρόσβασης, export, διόρθωσης, διαγραφής, objection, marketing withdrawal και account closure.",
    lawfulBases: ["legal_obligation"],
    dataSubjects: ["customers/data subjects"],
    dataCategories: ["request", "identity verification evidence", "retention exceptions", "outcome", "audit evidence"],
    systems: ["privacy_requests", "admin privacy workspace"],
    recipients: ["authorized privacy/support/compliance staff"],
    access: ["requesting customer", "privacy.read/privacy.manage roles"],
    retentionKey: "privacy_requests",
    state: "partial"
  },
  {
    id: "vendor_onboarding",
    name: "Vendor onboarding και συνεργασία",
    purpose: "Αξιολόγηση, σύναψη/διαχείριση συνεργασίας, compliance evidence και λειτουργία vendor account.",
    lawfulBases: ["contract", "legal_obligation", "legitimate_interest"],
    dataSubjects: ["vendor representatives", "vendor users"],
    dataCategories: ["business/contact", "representative identity", "agreements", "compliance evidence", "account/session"],
    systems: ["vendor applications", "vendor_businesses", "vendor_users", "commercial agreements", "vendor compliance documents"],
    recipients: ["authorized vendor operations/finance/compliance"],
    access: ["vendor self-service", "vendor operations", "finance/compliance where required"],
    retentionKey: "vendor_governance",
    state: "partial"
  }
] as const;

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    key: "identity_sessions",
    label: "Sessions και authentication tokens",
    mode: "record_expiry",
    rule: "Customer session έως 12h, Vendor έως 8h, Admin έως 6h, Daily έως 12h. Verification/reset tokens έχουν δικό τους expires_at.",
    enforcement: "Runtime expiry plus scheduled/operational cleanup; expired credentials must not remain usable.",
    state: "implemented"
  },
  {
    key: "marketplace_identity",
    label: "Essential marketplace identity",
    mode: "fixed",
    rule: "bls_marketplace έως 31 ημέρες.",
    enforcement: "First-party cookie max-age; not used as the Analytics identity.",
    state: "implemented"
  },
  {
    key: "consent_evidence",
    label: "Cookie consent preference",
    mode: "fixed",
    rule: "bls_consent_v1 έως 180 ημέρες before a fresh choice is required.",
    enforcement: "Versioned first-party preference cookie.",
    state: "implemented"
  },
  {
    key: "personalization",
    label: "Personalization και recently viewed",
    mode: "record_expiry",
    rule: "New profile defaults OFF. Recently viewed entries expire after the configured 90-day lifecycle and are deleted immediately when recently-viewed is disabled/erased.",
    enforcement: "Preference gate, expires_at, erasure path and migration 0098 for future DB defaults.",
    state: "implemented"
  },
  {
    key: "analytics",
    label: "Analytics identifiers/events",
    mode: "record_expiry",
    rule: "Analytics identifier έως 180 ημέρες and deleted on withdrawal. Analytics event retention must use per-record retention policy/fields rather than the essential marketplace identifier.",
    enforcement: "Client + server consent gate; analytics cookie deletion; analytics_events.retention_until where used. Product analytics cleanup policy still requires completion.",
    state: "partial"
  },
  {
    key: "security_audit",
    label: "Security και audit evidence",
    mode: "record_expiry",
    rule: "Retain only for the security/accountability period assigned to the event; do not turn security logs into a permanent customer profile.",
    enforcement: "security_events.retention_until exists; centralized purge/verification policy remains to be completed.",
    state: "partial"
  },
  {
    key: "financial_records",
    label: "Payments, invoices και φορολογικά αρχεία",
    mode: "statutory",
    rule: "Retain for the applicable Greek accounting/tax/legal period. These records are excluded from indiscriminate account-deletion jobs.",
    enforcement: "Retention-aware DSAR outcome and fiscal record preservation. Exact statutory schedule remains subject to accounting/legal confirmation before automated deletion.",
    state: "policy_review"
  },
  {
    key: "commerce_records",
    label: "Order και fulfilment evidence",
    mode: "lifecycle",
    rule: "Operational visibility should shrink after fulfilment; central evidence may remain for returns, guarantees, disputes and legal/accounting obligations.",
    enforcement: "Purpose-scoped vendor views exist; centralized expiry/masking schedule remains to be completed.",
    state: "partial"
  },
  {
    key: "communications",
    label: "Support, Ask Local, advice και transactional communication",
    mode: "review_required",
    rule: "Define lifecycle by workflow, open obligations and dispute/support needs; no permanent retention by default.",
    enforcement: "Policy and cleanup jobs required before production compliance sign-off.",
    state: "policy_review"
  },
  {
    key: "privacy_requests",
    label: "Privacy request evidence",
    mode: "review_required",
    rule: "Retain enough evidence to demonstrate lawful handling of the request without retaining unnecessary copies of exported personal data.",
    enforcement: "privacy_requests stores deadlines/outcome/retention snapshot; final evidence-retention duration requires policy approval.",
    state: "partial"
  },
  {
    key: "vendor_governance",
    label: "Vendor agreements/compliance evidence",
    mode: "lifecycle",
    rule: "Retain while collaboration/legal obligations require it, then archive/delete according to approved commercial and statutory schedules.",
    enforcement: "Agreement/compliance lifecycle exists; final centralized retention schedule remains to be approved.",
    state: "partial"
  }
] as const;

export const PROVIDER_GOVERNANCE: readonly ProviderGovernance[] = [
  {
    name: "Supabase",
    purpose: "PostgreSQL/database platform and related infrastructure",
    data: "Marketplace records stored in the production database and technical metadata required to operate it.",
    roleStatus: "infrastructure_role_review",
    contractReview: "Record DPA, processing region, subprocessors and transfer mechanism in the provider register."
  },
  {
    name: "Vercel",
    purpose: "Hosting/deployment/runtime delivery of the web application",
    data: "HTTP/application data technically processed by hosted runtime and delivery infrastructure.",
    roleStatus: "infrastructure_role_review",
    contractReview: "Record DPA, region/log configuration, subprocessors and transfer mechanism."
  },
  {
    name: "Resend",
    purpose: "Transactional email and configured inbound email handling",
    data: "Recipient/sender addresses, subject/body and delivery/receive metadata relevant to the communication.",
    roleStatus: "known_processor",
    contractReview: "Verify DPA, retention, subprocessors and transfer location before compliance sign-off."
  },
  {
    name: "Viva.com",
    purpose: "Payment initiation, transaction reconciliation and refunds",
    data: "Customer contact/name where present, order reference, amount and payment/provider references.",
    roleStatus: "recipient_role_review",
    contractReview: "Confirm controller/processor allocation by payment activity and regulatory duty; do not label all Viva processing as processor activity by default."
  },
  {
    name: "BOX NOW",
    purpose: "Locker shipment creation and fulfilment",
    data: "Recipient name/email/phone, selected locker, order/parcel reference and necessary parcel information.",
    roleStatus: "recipient_role_review",
    contractReview: "Confirm contractual GDPR role, retention and permitted use is limited to delivery/related obligations."
  },
  {
    name: "AADE / myDATA",
    purpose: "Statutory fiscal reporting",
    data: "Fiscal information required by applicable tax law and the issued document.",
    roleStatus: "public_authority",
    contractReview: "Document legal obligation and exact transmitted fields; DPA-style processor classification is not the model for statutory authority reporting."
  }
] as const;

export function governanceCounts() {
  return {
    activities: PROCESSING_ACTIVITIES.length,
    activitiesNeedingReview: PROCESSING_ACTIVITIES.filter((item) => item.state !== "implemented").length,
    retentionRules: RETENTION_RULES.length,
    retentionNeedingReview: RETENTION_RULES.filter((item) => item.state !== "implemented").length,
    providers: PROVIDER_GOVERNANCE.length,
    providersNeedingContractReview: PROVIDER_GOVERNANCE.filter((item) => item.roleStatus !== "public_authority").length
  } as const;
}
