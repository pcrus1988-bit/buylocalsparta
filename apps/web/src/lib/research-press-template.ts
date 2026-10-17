import { renderAdminMailHtml, validateCustomMailHtml } from "./admin-mail-template";

export function pressHtmlFragment(body: string): string {
  const safeBody = validateCustomMailHtml(body);
  return safeBody + [
    '<div style="margin-top:34px;padding:22px 0 0;border-top:1px solid #d7e5d8;color:#425e4b;font-size:13px;line-height:1.8">',
    '<strong style="font-size:16px;color:#173e2a">Γραφείο Τύπου · KONTA MOY</strong><br>',
    'Ελληνική πλατφόρμα τοπικού εμπορίου · Σπάρτη, Ελλάδα<br>',
    'Email: <a href="mailto:research@kontamou.site" style="color:#17684e">research@kontamou.site</a><br>',
    'Website: <a href="https://kontamou.site" style="color:#17684e">kontamou.site</a><br>',
    '<span style="font-size:12px">Λαμβάνετε το δελτίο τύπου ως επαγγελματική επικοινωνία με το Γραφείο Τύπου.',
    ' Για διακοπή επικοινωνίας απαντήστε με θέμα «Διαγραφή» στο research@kontamou.site.</span>',
    '</div>'
  ].join("");
}

export function pressPreviewHtml(html: string): string {
  return renderAdminMailHtml({ format: "html", text: "", html: pressHtmlFragment(html) }) || "";
}

