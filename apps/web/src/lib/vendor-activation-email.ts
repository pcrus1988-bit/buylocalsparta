import { sendTransactionalEmail } from "./transactional-email";
import type { VendorActivationAccess } from "./vendor-activation-access";

function publicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BLS_PUBLIC_BASE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  return production ? `https://${production.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : "https://kontamou.site";
}

export async function sendVendorActivationEmail(access: VendorActivationAccess) {
  const loginUrl = `${publicBaseUrl()}/vendor/login`;
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
      "KONTA MOY · Buy Local Sparta"
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
