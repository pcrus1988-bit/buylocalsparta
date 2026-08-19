import Link from "next/link";

export function VendorAgreementForm({
  vendorId,
  defaults
}: Readonly<{
  vendorId: string;
  csrfToken: string;
  defaults?: Readonly<{
    code?: string;
    commissionRateBps?: number;
    listingFeeMinor?: number;
    recurringFeeMinor?: number;
    recurringFeePeriod?: string;
    sourceDocumentReference?: string;
  }>;
}>) {
  return <div className="workspace-tool-body">
    <div className="workspace-callout">
      <strong>Governed contract workflow</strong>
      <span>Η δημιουργία/έκδοση σύμβασης, το PDF, η αποστολή, η παραλαβή του συνυπογεγραμμένου gov.gr PDF, η επαλήθευση και η τελική ενεργοποίηση της συμφωνίας γίνονται μόνο από το Finance → Vendor agreements.</span>
    </div>
    {defaults?.code && <p className="workspace-queue-summary">Τρέχουσα συμφωνία: <strong>{defaults.code}</strong>{defaults.sourceDocumentReference ? ` · ${defaults.sourceDocumentReference}` : ""}</p>}
    <div className="workspace-form-actions">
      <Link className="button" href={`/admin/finance/agreements?vendorId=${encodeURIComponent(vendorId)}`}>Άνοιγμα contract workflow</Link>
    </div>
  </div>;
}
