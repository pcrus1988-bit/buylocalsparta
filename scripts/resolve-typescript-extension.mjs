import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith("next/") && !specifier.endsWith(".js")) {
      try {
        return await nextResolve(`${specifier}.js`, context);
      } catch {
        // Fall through to the normal TypeScript-relative resolution rules below.
      }
    }
    if (error?.code !== "ERR_MODULE_NOT_FOUND" || !context.parentURL || !(specifier.startsWith("./") || specifier.startsWith("../"))) {
      throw error;
    }

    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = new URL(`${specifier}${suffix}`, context.parentURL);
      if (candidate.protocol === "file:" && existsSync(fileURLToPath(candidate))) {
        return nextResolve(candidate.href, context);
      }
    }

    throw error;
  }
}
