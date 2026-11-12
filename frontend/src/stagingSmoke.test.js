import { test } from "node:test";
import assert from "node:assert/strict";

const api="https://spendly-v11-qa-staging.up.railway.app";
const origin="https://spendly-git-test-v11-release-safety-ibra-4331.vercel.app";
const fetchWithTimeout=(path,init={})=>fetch(api+path,{...init,signal:AbortSignal.timeout(12000)});

test("staging Safe to Spend requires auth, no anonymous financial reads",async()=>{
  const res=await fetchWithTimeout("/api/account/safe-to-spend");
  assert.equal(res.status,401,"Unauthenticated balance endpoint must reject requests");
});

test("staging adjustment history requires auth",async()=>{
  const res=await fetchWithTimeout("/api/account/safe-to-spend/adjustments");
  assert.equal(res.status,401,"Unauthenticated adjustment ledger must reject requests");
});

test("staging baseline rejects unauthenticated writes",async()=>{
  const res=await fetchWithTimeout("/api/account/safe-to-spend/baseline",{
    method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({amount:777,startDate:"2026-11-01"})
  });
  assert.equal(res.status,401,"Unauthenticated baseline update must reject requests");
});

test("staging allows CORS exclusively for isolated QA preview",async()=>{
  const res=await fetchWithTimeout("/api/account/safe-to-spend",{
    method:"OPTIONS",
    headers:{"Origin":origin,"Access-Control-Request-Method":"GET","Access-Control-Request-Headers":"authorization"}
  });
  assert.equal(res.status,200,"CORS preflight must succeed");
  assert.equal(res.headers.get("access-control-allow-origin"),origin);
  assert.notEqual(res.headers.get("access-control-allow-origin"),"https://spendly-two-beige.vercel.app");
});
