import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

const config=readFileSync("apps/web/next.config.ts","utf8");
const callback=readFileSync("apps/web/src/app/timologio-admin/sso/callback/route.ts","utf8");
const tickets=readFileSync("apps/web/src/lib/fiscal-superadmin-tickets.ts","utf8");
const accessPage=readFileSync("apps/web/src/app/admin/fiscal-access/page.tsx","utf8");

test("FISCAL handoff sends safe Origin without leaking private admin paths",()=>{
 const start=config.indexOf('source: "/admin/fiscal-access"');
 assert.ok(start!==-1,"Only the authenticated admin handoff may receive the special headers");
 const policy=config.slice(start,config.indexOf("]",start)+1);
 assert.match(policy,/Content-Security-Policy.*FISCAL_HANDOFF_CSP/);
 assert.match(policy,/Referrer-Policy.*"origin"/);
 assert.doesNotMatch(policy,/Referrer-Policy.*"no-referrer"/,
  "A no-referrer navigation policy produces an opaque Origin on cross-origin POST in some browsers");
 assert.match(policy,/Cache-Control.*"private, no-store"/);
 assert.match(config,/CONTENT_SECURITY_POLICY\.replace\("form-action 'self'",`form-action 'self' \$\{FISCAL_SSO_ORIGIN\}`\)/);
 assert.match(config,/normalizedOrigin\(process\.env\.FISCAL_SERVICE_BASE_URL\)/);
});
test("FISCAL callback retains strict Origin, no ticket URL and one-time signature validation",()=>{
 assert.match(callback,/request\.headers\.get\("origin"\)!==origin/);
 assert.match(callback,/SSO_ORIGIN_NOT_ALLOWED/);
 assert.match(callback,/await redeemFiscalSsoTicket\(ticket,new URL\(request\.url\)\.origin\)/);
 assert.match(accessPage,/<form action=\{transfer\.targetUrl\} method="post">/);
 assert.match(accessPage,/type="hidden" name="ticket"/);
 assert.match(tickets,/createHmac\("sha256",secret\(\)\)/);
 assert.match(tickets,/ticketTtlMs=60\*1000/);
});
