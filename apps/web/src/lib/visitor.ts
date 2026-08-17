import { headers } from "next/headers";

const VISITOR_HEADER = "x-bls-visitor";

export async function getVisitorKey(): Promise<string> {
  const value = (await headers()).get(VISITOR_HEADER)?.trim();
  if (!value || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) throw new Error("Missing trusted marketplace visitor identity");
  return value;
}
