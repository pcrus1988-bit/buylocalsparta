import test from "node:test";
import assert from "node:assert/strict";
import {
 EXPIRE_DRINKSTOCK_CRASH_SQL,decideSessionRevisionRecovery
} from "../src/lib/drinkstock-session-recovery.ts";

const original="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const session=(state:"running"|"paused"|"crashing"|"ended"|"scheduled",id=original)=>({id,state});

test("expiry of a 60-second crash does not bump user-command revision",()=>{
 assert.match(EXPIRE_DRINKSTOCK_CRASH_SQL,/state='crashing' AND crash_until<=now\(\)/);
 assert.match(EXPIRE_DRINKSTOCK_CRASH_SQL,/SET state='running',crash_until=NULL/);
 assert.doesNotMatch(EXPIRE_DRINKSTOCK_CRASH_SQL,/revision\s*=/i);
});

test("pause and end recover when same session has advanced revision",()=>{
 assert.equal(decideSessionRevisionRecovery("pause",original,session("running")),"retry");
 assert.equal(decideSessionRevisionRecovery("pause",original,session("crashing")),"retry");
 assert.equal(decideSessionRevisionRecovery("end",original,session("running")),"retry");
 assert.equal(decideSessionRevisionRecovery("end",original,session("paused")),"retry");
 assert.equal(decideSessionRevisionRecovery("end",original,session("crashing")),"retry");
 assert.equal(decideSessionRevisionRecovery("resume",original,session("paused")),"retry");
});

test("already fulfilled commands do not execute again",()=>{
 assert.equal(decideSessionRevisionRecovery("pause",original,session("paused")),"already_applied");
 assert.equal(decideSessionRevisionRecovery("end",original,session("ended")),"already_applied");
 assert.equal(decideSessionRevisionRecovery("resume",original,session("running")),"already_applied");
});

test("never replay a destructive action across a new session",()=>{
 for(const action of ["pause","end","resume","crash","start","revoke_pass"] as const)
  assert.equal(decideSessionRevisionRecovery(action,original,session("running",other)),"review",action);
 assert.equal(decideSessionRevisionRecovery("end",original,null),"review");
 assert.equal(decideSessionRevisionRecovery("pause",original,session("scheduled")),"review");
 assert.equal(decideSessionRevisionRecovery("resume",original,session("ended")),"review");
 assert.equal(decideSessionRevisionRecovery("start",null,session("running",other)),"review");
});

test("TV setting and access pass actions recover only within same session",()=>{
 for(const action of ["create_screen","create_table","revoke_pass","set_screen_feed"] as const){
  assert.equal(decideSessionRevisionRecovery(action,original,session("running")),"retry");
  assert.equal(decideSessionRevisionRecovery(action,original,session("running",other)),"review");
 }
 assert.equal(decideSessionRevisionRecovery("start",null,null),"retry");
 assert.equal(decideSessionRevisionRecovery("start",original,session("ended")),"retry");
});
