import test from "node:test";
import assert from "node:assert/strict";
import { clamAvConfigFromEnv } from "../src/index.ts";

test("ClamAV configuration is explicit and bounded", () => {
  const config=clamAvConfigFromEnv({BLS_CLAMAV_HOST:"clamav",BLS_CLAMAV_PORT:"3310",BLS_MEDIA_MAX_BYTES:"1024"} as NodeJS.ProcessEnv);
  assert.equal(config.host,"clamav"); assert.equal(config.port,3310); assert.equal(config.maxBytes,1024);
  assert.throws(()=>clamAvConfigFromEnv({} as NodeJS.ProcessEnv),/BLS_CLAMAV_HOST/);
});
