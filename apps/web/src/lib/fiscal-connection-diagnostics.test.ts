import assert from "node:assert/strict";
import {test} from "node:test";
import {classifyFiscalConnectionProfile} from "./fiscal-connection-diagnostics.ts";

const cases:[string|undefined,string][]=[
  [undefined,"missing"],
  ["   ","missing"],
  ["https://not-postgres.example.invalid","malformed_uri"],
  ["not a uri","malformed_uri"],
  ["postgresql://postgres.testproject:synthetic@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require","shared_transaction_pooler"],
  ["postgresql://postgres:synthetic@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require","shared_pooler_wrong_port_or_user"],
  ["postgresql://postgres.testproject:synthetic@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require","shared_pooler_wrong_port_or_user"],
  ["postgresql://postgres:synthetic@db.testproject.supabase.co:6543/postgres?sslmode=require","dedicated_pooler_ipv6_risk"],
  ["postgresql://postgres:synthetic@db.testproject.supabase.co:5432/postgres?sslmode=require","supabase_direct_connection"],
  ["postgresql://postgres:synthetic@unrecognized.example.invalid:6543/postgres?sslmode=require","unrecognized_connection"]
];
test("FISCAL PostgreSQL profile distinguishes IPv4 shared transaction pooler from dedicated host",()=>{
 for(const [url,expected] of cases)
  assert.equal(classifyFiscalConnectionProfile(url),expected);
});
test("FISCAL connection diagnostics never output credentials, usernames or hostnames",()=>{
 const secret="FISCAL_TEST_CREDENTIAL_DO_NOT_LOG";
 const host="confidential-endpoint.example.invalid";
 const url=`postgresql://postgres:CONTAINS_${secret}@${host}:6543/postgres?sslmode=require`;
 const result=classifyFiscalConnectionProfile(url);
 assert.equal(result,"unrecognized_connection");
 assert.ok(!result.includes(secret));
 assert.ok(!result.includes(host));
 assert.ok(!result.includes("postgres"));
});
