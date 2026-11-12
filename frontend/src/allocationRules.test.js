import test from "node:test";
import assert from "node:assert/strict";
import { sumExpenses, allocationTotal, rebalanceAllocations, paycheckAllocationsInCents } from "./allocationRules.js";

const allocations = [
  { id:"investment",kind:"investments",percent:20 },
  { id:"expenses",kind:"expenses",percent:30 },
  { id:"savings",kind:"savings",percent:15 },
  { id:"safe",kind:"safe",percent:35 },
];
test("dashboard expense total is exact and follows add/edit/remove",()=>{
  assert.equal(sumExpenses([{amount:1200},{amount:85},{amount:97}]),1382);
  assert.equal(sumExpenses([{amount:1200},{amount:85},{amount:100}]),1385);
  assert.equal(sumExpenses([{amount:1200},{amount:85}]),1285);
  assert.equal(sumExpenses([{amount:0.1},{amount:0.2}]),0.3);
});
test("changing other bucket reduces Safe to Spend and stays at 100%",()=>{
  const r=rebalanceAllocations(allocations,"expenses",40);
  assert.equal(allocationTotal(r),100);
  assert.equal(r.find(c=>c.id==="expenses").percent,40);
  assert.equal(r.find(c=>c.kind==="safe").percent,25);
  assert.equal(allocations.find(c=>c.id==="expenses").percent,30);
});
test("safe slider adjusts the remaining buckets without negative shares",()=>{
  const low=rebalanceAllocations(allocations,"safe",5);
  const high=rebalanceAllocations(allocations,"safe",99);
  assert.equal(allocationTotal(low),100);
  assert.equal(allocationTotal(high),100);
  assert.ok(low.every(c=>c.percent>=0));
  assert.ok(high.every(c=>c.percent>=0));
  assert.equal(high.find(c=>c.kind==="safe").percent,99);
});
test("custom retirement replaces investment without changing total",()=>{
  const custom=[
    {id:"retirement",kind:"other",percent:20},...allocations.filter(c=>c.id!=="investment")
  ];
  const result=paycheckAllocationsInCents(1000,custom);
  assert.equal(result.goals.retirement,20000);
  assert.equal(result.plannedSafeCents,35000);
  assert.equal(Object.values(result.goals).reduce((s,c)=>s+c,0)+result.plannedSafeCents,100000);
});
test("paycheck allocation is planning-only, all cents assigned without rounding loss",()=>{
  const result=paycheckAllocationsInCents(101.13,allocations);
  assert.equal(result.paycheckCents,10113);
  assert.equal(Object.values(result.goals).reduce((s,x)=>s+x,0)+result.plannedSafeCents,10113);
  assert.equal("safe" in result.goals,false);
});
test("invalid total or missing Safe to Spend fails instead of assigning money",()=>{
  assert.throws(()=>paycheckAllocationsInCents(100,allocations.filter(c=>c.kind!=="safe")));
  assert.throws(()=>paycheckAllocationsInCents(0,allocations));
});
