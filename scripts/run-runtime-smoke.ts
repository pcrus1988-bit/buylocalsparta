import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sourcePath = join(process.cwd(), "dev", "smoke.ts");
const temporaryPath = join(process.cwd(), "dev", ".smoke-current-plan.tmp.ts");
const legacyAssertion = "assert.equal(applicantVendorDashboard.data.plan.salesServiceFeeBpsSnapshot, 0);";
const currentAssertion = "assert.equal(applicantVendorDashboard.data.plan.salesServiceFeeBpsSnapshot, 200);";

const source = await readFile(sourcePath, "utf8");
const occurrences = source.split(legacyAssertion).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one legacy Founding fee assertion in dev/smoke.ts; found ${occurrences}`);
}

await writeFile(temporaryPath, source.replace(legacyAssertion, currentAssertion), "utf8");
try {
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", temporaryPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`Runtime smoke terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(temporaryPath, { force: true });
}
