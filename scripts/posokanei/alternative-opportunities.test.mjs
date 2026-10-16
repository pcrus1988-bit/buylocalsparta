import test from "node:test";
import assert from "node:assert/strict";
import {summarizeCheaperAlternatives} from "./alternative-opportunities.mjs";

const approved=(saving,original=2)=>({confidence:"reviewed_equivalent",savingsEur:saving,originalTotalEur:original});
const unverified=(saving)=>({confidence:"unverified_match",savingsEur:saving,originalTotalEur:3});
const automatic=(saving)=>({confidence:"automatically_verified",savingsEur:saving,originalTotalEur:3});

test("banner counts distinct eligible list rows and sums only each row's largest approved saving",()=>{
  const x=summarizeCheaperAlternatives([
    {lineId:"item-a",alternatives:[approved(.24),approved(.07),unverified(2)]},
    {lineId:"item-b",alternatives:[approved(.05),automatic(.4),approved(-.1),unverified(5)]},
    {lineId:"item-c",alternatives:[approved(0)]}
  ]);
  assert.deepEqual(x,{lineIds:["item-a","item-b"],productCount:2,potentialSavingEur:.64});
});

test("hide potential-savings CTA when only unverified, equal or more expensive offers exist",()=>{
  const x=summarizeCheaperAlternatives([
    {lineId:"one",alternatives:[unverified(8)]},
    {lineId:"two",alternatives:[approved(0),approved(-1)]},
    {lineId:"three",alternatives:[]}
  ]);
  assert.deepEqual(x,{lineIds:[],productCount:0,potentialSavingEur:0});
});

test("sums monetary values in integer cents and ignores malformed amounts",()=>{
  const x=summarizeCheaperAlternatives([
    {lineId:"a",alternatives:[approved(.1),approved(.2)]},
    {lineId:"a",alternatives:[approved(.05)]},
    {lineId:"b",alternatives:[approved(.1)]},
    {lineId:"bad",alternatives:[approved(Infinity),approved(.4,NaN)]}
  ]);
  assert.deepEqual(x,{lineIds:["a","b"],productCount:2,potentialSavingEur:.3});
});

test("full candidate summary wins over truncated visible suggestion list",()=>{
  const x=summarizeCheaperAlternatives([
    {lineId:"line-a",alternatives:[approved(.25)],bestCheaperSavingEur:1.25,cheaperAlternativeCount:6},
    {lineId:"line-b",alternatives:[],bestCheaperSavingEur:2.02,cheaperAlternativeCount:7},
    {lineId:"line-c",alternatives:[approved(5)],bestCheaperSavingEur:0,cheaperAlternativeCount:0}
  ]);
  assert.deepEqual(x,{lineIds:["line-a","line-b"],productCount:2,potentialSavingEur:3.27});
});
