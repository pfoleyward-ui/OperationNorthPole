import test from "node:test";
import assert from "node:assert/strict";
import { validDate, validTime, resolveWallTime, selectInstant, localParts, intervalTouchesBlackout } from "../../src/domain/booking/time.ts";
for(const date of ["2026-02-29","2026-02-30","2026-13-01","2026-00-10","2026-1-02","tomorrow","0000-01-01",null]) test(`invalid calendar date ${date}`,()=>assert.equal(validDate(date),false));
test("leap day accepted",()=>assert.equal(validDate("2028-02-29"),true));
for(const time of ["24:00","12:60","9:30","01:30Z","12:00:00",null])test(`invalid clock ${time}`,()=>assert.equal(validTime(time),false));
test("spring DST gap is rejected",()=>assert.equal(resolveWallTime("2027-03-14","02:30").kind,"nonexistent"));
test("fall DST fold has two explicit options",()=>{
 const fold=resolveWallTime("2026-11-01","01:30");assert.equal(fold.kind,"ambiguous");
 assert.deepEqual(fold.candidates.map(n=>new Date(n).toISOString()),["2026-11-01T05:30:00.000Z","2026-11-01T06:30:00.000Z"]);
 assert.throws(()=>selectInstant("2026-11-01","01:30"),/Ambiguous/);
 assert.equal(selectInstant("2026-11-01","01:30","later")-selectInstant("2026-11-01","01:30","earlier"),3600000);
});
test("winter and summer offsets are computed in New York, independent of host timezone",()=>{
 assert.equal(new Date(selectInstant("2027-01-10","12:00")).toISOString(),"2027-01-10T17:00:00.000Z");
 assert.equal(new Date(selectInstant("2027-07-10","12:00")).toISOString(),"2027-07-10T16:00:00.000Z");
 assert.deepEqual(localParts(Date.parse("2026-12-24T02:00:00Z")),{date:"2026-12-23",time:"21:00"});
});
test("events crossing into either Christmas blackout day are rejected",()=>{
 assert.ok(intervalTouchesBlackout(selectInstant("2026-12-23","23:45"),selectInstant("2026-12-24","00:15")));
 assert.ok(intervalTouchesBlackout(selectInstant("2026-12-25","23:45"),selectInstant("2026-12-26","00:15")));
 assert.equal(intervalTouchesBlackout(selectInstant("2026-12-23","23:30"),selectInstant("2026-12-24","00:00")),false);
 assert.equal(intervalTouchesBlackout(selectInstant("2026-12-26","00:00"),selectInstant("2026-12-26","00:30")),false);
});
test("invalid intervals fail closed",()=>assert.ok(intervalTouchesBlackout(NaN,Infinity)));
test("extreme syntactically valid dates do not throw",()=>{for(const d of ["0001-01-01","9999-12-31"])assert.doesNotThrow(()=>resolveWallTime(d,"23:00"));});
test("out-of-range and unbounded intervals fail closed without scanning",()=>{
 assert.ok(intervalTouchesBlackout(1e20,1e20+1e6));
 assert.ok(intervalTouchesBlackout(0,253402300799999));
 assert.ok(intervalTouchesBlackout(-1,1000));
});
