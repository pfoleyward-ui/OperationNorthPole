import test from "node:test";
import assert from "node:assert/strict";
import { requiredResources, occupiedInterval, overlaps } from "../../src/domain/booking/scheduling.ts";
test("standalone booth does not reserve Santa; complete party requires attendant",()=>{
 assert.deepEqual(requiredResources("photo-booth"),["photo-booth","booth-attendant"]);
 assert.deepEqual(requiredResources("complete-party"),["santa","photo-booth","booth-attendant"]);
 assert.deepEqual(requiredResources("home-visits"),["santa"]);
});
test("half-open scheduling permits adjacent events but detects occupied buffers",()=>{
 const a=occupiedInterval("a","santa",1000000,2000000,0,0);
 const b=occupiedInterval("b","santa",2000000,3000000,0,0);
 assert.equal(overlaps(a,b),false);
 assert.equal(overlaps(a,occupiedInterval("b","santa",2000000,3000000,1,0)),true);
 assert.equal(overlaps(occupiedInterval("a","santa",1000000,2000000,0,1),b),true);
});
test("independent resources do not conflict; containment and exact equality do",()=>{
 const a=occupiedInterval("a","santa",1000000,2000000,0,0);
 assert.equal(overlaps(a,occupiedInterval("b","photo-booth",1000000,2000000,0,0)),false);
 assert.equal(overlaps(a,occupiedInterval("b","santa",1100000,1900000,0,0)),true);
 assert.equal(overlaps(a,{...a,id:"another"}),true);
});
test("invalid buffers and malformed snapshots fail closed",()=>{
 assert.throws(()=>occupiedInterval("a","santa",1000000,2000000,-1,0));
 assert.throws(()=>occupiedInterval("a","santa",1000000,2000000,0,0.5));
 const a=occupiedInterval("a","santa",1000000,2000000,0,0);
 assert.throws(()=>overlaps(a,{...a,start:NaN}));
});
