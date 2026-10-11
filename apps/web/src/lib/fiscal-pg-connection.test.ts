import assert from "node:assert/strict";
import {X509Certificate} from "node:crypto";
import {test} from "node:test";
import {fiscalPgConnectionOptions} from "./fiscal-pg-connection.ts";
import {FISCAL_SUPABASE_ROOT_CA} from "./fiscal-supabase-root-ca.ts";

const expectedRootFingerprint =
  "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa";

test("Fiscal pinned Supabase CA matches the published root fingerprint and is a CA",()=>{
  const certificate=new X509Certificate(FISCAL_SUPABASE_ROOT_CA);
  assert.equal(certificate.fingerprint256.replaceAll(":","").toLowerCase(),expectedRootFingerprint);
  assert.equal(certificate.ca,true);
  assert.match(certificate.subject,/Supabase Root 2021 CA/);
});

test("Fiscal shared pooler uses explicit verified TLS and removes URL SSL overrides",()=>{
  const original="postgresql://postgres.testproject:synthetic-password@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&uselibpqcompat=true";
  const configured=fiscalPgConnectionOptions(original);
  assert.ok(configured.ssl);
  assert.equal(configured.ssl.rejectUnauthorized,true);
  assert.equal(configured.ssl.servername,"aws-1-eu-central-1.pooler.supabase.com");
  assert.equal(configured.ssl.ca,FISCAL_SUPABASE_ROOT_CA);
  const url=new URL(configured.connectionString);
  assert.equal(url.searchParams.has("sslmode"),false);
  assert.equal(url.searchParams.has("uselibpqcompat"),false);
  assert.equal(url.hostname,"aws-1-eu-central-1.pooler.supabase.com");
});

test("Fiscal disposable CI PostgreSQL is unchanged, and invalid schemes fail closed",()=>{
  const local="postgresql://fiscal:synthetic@127.0.0.1:5432/fiscal_ci";
  assert.deepEqual(fiscalPgConnectionOptions(local),{connectionString:local});
  assert.throws(()=>fiscalPgConnectionOptions("http://example.invalid"),/INVALID_SCHEME/);
});

test("SSL options may not be disabled by shared pooler query parameters",()=>{
  const original="postgresql://postgres.testproject:synthetic@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=disable&ssl=false";
  const configured=fiscalPgConnectionOptions(original);
  assert.equal(configured.ssl?.rejectUnauthorized,true);
  const url=new URL(configured.connectionString);
  assert.equal(url.searchParams.has("sslmode"),false);
  assert.equal(url.searchParams.has("ssl"),false);
});
