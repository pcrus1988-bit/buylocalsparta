import { readFileSync } from "node:fs";

type PackageMetadata = Readonly<{ version?: unknown }>;

function readProjectVersion(): string {
  const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageMetadata;
  if (typeof metadata.version !== "string" || !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
    throw new Error("Root package.json must contain a semantic build version");
  }
  return metadata.version;
}

export const BUILD_VERSION = readProjectVersion();
