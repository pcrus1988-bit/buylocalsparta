/** The canonical brand row stores only a bucket-relative object key. */
export function publicBrandLogoUrl(objectKey: string | null | undefined): string | undefined {
  if (!objectKey || !/^[a-z0-9][a-z0-9/_-]*\.(?:svg|png|webp)$/i.test(objectKey) || objectKey.includes("..")) return undefined;
  // A public project identifier is not a credential. Keep this URL out of product records.
  const base = "https://eemihhfreggbigxejjhj.supabase.co/storage/v1/object/public/brands/";
  return base + objectKey.split("/").map(encodeURIComponent).join("/");
}
