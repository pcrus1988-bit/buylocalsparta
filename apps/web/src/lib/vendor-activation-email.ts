import { sendTransactionalEmail } from "./transactional-email";
import { KONTA_MOY_EMAIL_BASE_URL } from "./official-email-url";
import type { VendorActivationAccess } from "./vendor-activation-access";

export async function sendVendorActivationEmail(access: VendorActivationAccess) {
  const loginUrl = `${KONTA_MOY_EMAIL_BASE_URL}/vendor/login`;
  const setupLines = access.passwordSetupRequired && access.passwordSetupUrl ? [
    "Για να ολοκληρώσετε την πρόσβαση στο Vendor Workspace, δημιουργήστε τώρα τον προσωπικό σας κωδικό πρόσβασης:",
    access.passwordSetupUrl,
    "",
    "Ο ασφαλής σύνδεσμος είναι μίας χρήσης και λήγει σε 30 λεπτά. Με την ολοκλήρωση επιβεβαιώνεται και το email του vendor λογαριασμού σας."
  ] : [
    "Ο vendor λογαριασμός σας είναι ήδη συνδεδεμένος με επαληθευμένο λογαριασμό. Μπορείτε να χρησιμοποιήσετε τα υπάρχοντα στοιχεία πρόσβασης.",
    `Vendor Workspace: ${loginUrl}`
  ];

  return sendTransactionalEmail({
    to: access.email,
    subject: "Το κατάστημά σας ενεργοποιήθηκε · Ολοκληρώστε την πρόσβαση στο KONTA MOY",
    text: [
      `Καλησπέρα από το KONTA MOY,`,
      "",
      `Η συνεργασία για το κατάστημα «${access.tradingName}» ενεργοποιήθηκε επιτυχώς.`,
      "",
      ...setupLines,
      "",
      "Μετά τη δημιουργία κωδικού μπορείτε να συνδεθείτε στο Vendor Workspace, να διαχειρίζεστε προϊόντα, απόθεμα, παραγγελίες, οικονομικά στοιχεία και αναφορές.",
      "",
      `Vendor Workspace: ${loginUrl}`,
      "",
      "Αν δεν αναγνωρίζετε αυτή την ενεργοποίηση, απαντήστε σε αυτό το email.",
      "",
      "KONTA MOY"
    ].join("\n"),
    eventType: "vendor.activation_access",
    idempotencyKey: access.deliveryKey,
    payload: {
      vendorId: access.vendorId,
      userId: access.userId,
      passwordSetupRequired: access.passwordSetupRequired
    }
  });
}


export async function sendVendorPasswordResetEmail(access: VendorActivationAccess, options: { claim?: boolean } = {}) {
  if (!access.passwordSetupUrl || !access.passwordSetupRequired) throw new Error("Password reset link was not created");
  const destination = options.claim
    ? `${KONTA_MOY_EMAIL_BASE_URL}/vendor/claim`
    : `${KONTA_MOY_EMAIL_BASE_URL}/vendor/login`;
  return sendTransactionalEmail({
    to: access.email,
    subject: "Επαναφορά πρόσβασης · KONTA MOY",
    text: [
      "Καλησπέρα από το KONTA MOY,",
      "",
      `Ζητήθηκε από τη διαχείριση επαναφορά πρόσβασης για «${access.tradingName}».`,
      "Αν το αναγνωρίζετε, ορίστε νέο κωδικό μέσω του ασφαλούς συνδέσμου:",
      access.passwordSetupUrl,
      "",
      "Ο σύνδεσμος χρησιμοποιείται μία φορά και λήγει σε 30 λεπτά.",
      `Στη συνέχεια: ${destination}`,
      "",
      "Αν δεν ζητήσατε επαναφορά, αγνοήστε το μήνυμα και επικοινωνήστε με την υποστήριξη.",
      "",
      "KONTA MOY"
    ].join("\\n"),
    eventType: options.claim ? "hub_claim.owner_password_reset" : "vendor.owner_password_reset",
    idempotencyKey: access.deliveryKey,
    payload: { accountId: access.userId, claim: options.claim === true }
  });
}
