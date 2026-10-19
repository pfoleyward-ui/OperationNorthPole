import test from "node:test";
import assert from "node:assert/strict";
import {basePriceForDuration, CATALOG_VERSION} from "../../src/config/services.ts";
import {validateQuote} from "../../src/domain/booking/lifecycle.ts";
import {selectInstant} from "../../src/domain/booking/time.ts";
for(const [minutes,cents] of [[60,20000],[90,30000],[120,40000],[150,50000]])test(`Meet & Greet ${minutes} minutes costs ${cents} cents`,()=>assert.equal(basePriceForDuration("meet-greet",minutes),cents));
for(const minutes of [0,30,59,61,89,91,60.5,NaN])test(`invalid Meet & Greet duration ${minutes}`,()=>assert.throws(()=>basePriceForDuration("meet-greet",minutes)));
test("Trivia is $300 per agreed session, independent of session length",()=>{for(const n of [30,60,90,120])assert.equal(basePriceForDuration("trivia",n),30000);});
test("Meet & Greet quote cannot undercharge approved extensions",()=>{
 const start=selectInstant("2026-12-20","14:00");const q={id:"q",bookingId:"b",serviceId:"meet-greet",catalogVersion:CATALOG_VERSION,revision:1,currency:"USD",start,end:start+90*60000,createdAt:start-86400000,expiresAt:start-3600000,totalCents:20000,adjustmentReason:"Not permitted"};
 assert.equal(validateQuote(q).ok,false);assert.ok(validateQuote({...q,totalCents:30000,adjustmentReason:undefined}).ok);
});
