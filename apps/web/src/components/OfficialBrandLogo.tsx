import Image from "next/image";

/**
 * The permanent KONTA MOY wordmark used in both public site landmarks.
 * Do not replace this with plain text or remote CMS media.
 */
export function OfficialBrandLogo({ placement }: { placement: "header" | "footer" }) {
  return (
    <Image
      src="/brand/kontamou-logo.svg"
      alt="KONTA MOY"
      width={120}
      height={81}
      className={`official-brand-logo official-brand-logo--${placement}`}
      unoptimized
      priority={placement === "header"}
    />
  );
}
