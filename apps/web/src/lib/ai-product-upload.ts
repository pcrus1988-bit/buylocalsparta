import { gunzipSync } from "node:zlib";
import { AI_PRODUCT_IMPORT_LIMITS } from "./admin-ai-product-import";

export type AiProductUpload = Readonly<{
  uploadedFilename: string;
  sourceFilename: string;
  compressed: boolean;
  uploadedBytes: number;
  sourceBytes: number;
  sourceText: string;
}>;

export async function readAiProductUpload(file: File): Promise<AiProductUpload> {
  if (file.size === 0) throw new Error("Uploaded product file is empty");
  if (file.size > AI_PRODUCT_IMPORT_LIMITS.maxUploadedBytes) throw new Error("Uploaded product file exceeds the 8 MB safety limit");

  const uploaded = Buffer.from(await file.arrayBuffer());
  const compressed = file.name.toLowerCase().endsWith(".gz") || file.type.includes("gzip");
  let source: Buffer;
  if (compressed) {
    try {
      source = gunzipSync(uploaded, { maxOutputLength: AI_PRODUCT_IMPORT_LIMITS.maxSourceBytes });
    } catch (error) {
      throw new Error(`Unable to safely decompress product import: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else source = uploaded;

  if (source.length > AI_PRODUCT_IMPORT_LIMITS.maxSourceBytes) throw new Error("Decompressed product import exceeds the 20 MB safety limit");
  if (source.includes(0)) throw new Error("Product import appears to be binary rather than CSV/TSV text");
  const sourceText = source.toString("utf8");
  if (!sourceText.trim()) throw new Error("Product import file is empty");

  return {
    uploadedFilename: file.name,
    sourceFilename: compressed ? file.name.replace(/\.gz$/i, "") : file.name,
    compressed,
    uploadedBytes: uploaded.length,
    sourceBytes: source.length,
    sourceText
  };
}
