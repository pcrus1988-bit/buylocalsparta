import "server-only";

/** Exact original user-provided bilingual press-release PDF files, 1 November 2026. */
export const MICROBUSINESS_PRESS_FILES = {
  el: {
    url: "https://d2ol7oe51mr4n9.cloudfront.net/user_2wjmZ7H6DgmdTuAfQJ5N4lp4foD/895a571e-a3e0-4f6e-8324-8951bd7edf97.pdf",
    filename: "KONTA-MOY-Microbusinesses-Regional-Voices-EL-2026.pdf"
  },
  en: {
    url: "https://d2ol7oe51mr4n9.cloudfront.net/user_2wjmZ7H6DgmdTuAfQJ5N4lp4foD/98992545-ab1a-49d6-813a-3267f4cedd09.pdf",
    filename: "KONTA-MOY-Microbusinesses-Regional-Voices-EN-2026.pdf"
  }
} as const;
export type MicrobusinessPressLanguage = keyof typeof MICROBUSINESS_PRESS_FILES;
/** Only pinned verified origins; reject non-PDF bodies or unexpected file sizes. */
export async function readMicrobusinessPressPdf(language: MicrobusinessPressLanguage): Promise<Uint8Array> {
  const response = await fetch(MICROBUSINESS_PRESS_FILES[language].url, {
    signal: AbortSignal.timeout(15000),
    cache: "force-cache"
  });
  if (!response.ok) throw new Error("MICROBUSINESS_PRESS_PDF_SOURCE_UNAVAILABLE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 1000 || bytes.length > 3_000_000 ||
      bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 ||
      bytes[3] !== 0x46 || bytes[4] !== 0x2d) {
    throw new Error("MICROBUSINESS_PRESS_PDF_SOURCE_INVALID");
  }
  return bytes;
}
