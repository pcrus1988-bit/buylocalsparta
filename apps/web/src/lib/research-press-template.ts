import { renderAdminMailHtml, validateCustomMailHtml } from "./admin-mail-template";

export function pressHtmlFragment(body: string, language: "el" | "en" = "el"): string {
  const safeBody = validateCustomMailHtml(body);
  return safeBody + (language === "en" ? [
    '<div style="margin-top:34px;padding:22px 0 0;border-top:1px solid #d7e5d8;color:#425e4b;font-size:13px;line-height:1.8">',
    '<strong style="font-size:16px;color:#173e2a">KONTA MOY · Press Office</strong><br>',
    'Greek local commerce platform · Sparta, Greece<br>',
    'Email: <a href="mailto:research@kontamou.site" style="color:#17684e">research@kontamou.site</a><br>',
    'Website: <a href="https://kontamou.site" style="color:#17684e">kontamou.site</a><br>',
    '<span style="font-size:12px">You are receiving this professional press communication from KONTA MOY.',
    ' To request removal from the press list, reply to research@kontamou.site with the subject Unsubscribe.</span>',
    '</div>'
  ] : [
    '<div style="margin-top:34px;padding:22px 0 0;border-top:1px solid #d7e5d8;color:#425e4b;font-size:13px;line-height:1.8">',
    '<strong style="font-size:16px;color:#173e2a">Γραφείο Τύπου · KONTA MOY</strong><br>',
    'Ελληνική πλατφόρμα τοπικού εμπορίου · Σπάρτη, Ελλάδα<br>',
    'Email: <a href="mailto:research@kontamou.site" style="color:#17684e">research@kontamou.site</a><br>',
    'Website: <a href="https://kontamou.site" style="color:#17684e">kontamou.site</a><br>',
    '<span style="font-size:12px">Λαμβάνετε το δελτίο τύπου ως επαγγελματική επικοινωνία με το Γραφείο Τύπου.',
    ' Για διακοπή επικοινωνίας απαντήστε με θέμα «Διαγραφή» στο research@kontamou.site.</span>',
    '</div>'
  ]).join("");
}

export function pressPreviewHtml(html: string, language: "el" | "en" = "el"): string {
  return renderAdminMailHtml({ format: "html", text: "", html: pressHtmlFragment(html, language), locale: language }) || "";
}

