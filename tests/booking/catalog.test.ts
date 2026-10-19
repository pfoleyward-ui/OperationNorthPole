import test from "node:test";
import assert from "node:assert/strict";
import { bookableServices, serviceRates, services, completeParty, isServiceId } from "../../src/config/services.ts";
const expected = {
 "home-visits": [15000, 30, "home-visits"], photography: [150000,480,"photography"],
 "dj-parties": [75000,240,"dj-parties"], "photo-booth": [80000,240,"photo-booth"],
 "complete-party": [155000,240,"dj-parties"], "meet-greet": [20000,null,"off-season"], trivia: [30000,null,"off-season"],
} as const;
for (const [id, [cents, minutes, category]] of Object.entries(expected)) test(`approved catalog: ${id}`,()=>{
 assert.ok(isServiceId(id)); const service=bookableServices[id];
 assert.equal(service.basePriceCents,cents);assert.equal(service.durationMinutes,minutes);assert.equal(service.categoryId,category);assert.equal(service.currency,"USD");assert.ok(service.description);assert.ok(service.includes.length);
});
test("five public categories retain exact price labels and URLs",()=>{
 assert.deepEqual(services.map(s=>[s.id,s.price]),[
 ["home-visits","$150 · 30-minute visit"],["photography","$1,500 · 8-hour studio day"],["dj-parties","$750 · 4-hour DJ / MC"],["photo-booth","$800 · 4-hour staffed booth"],["off-season","Appearances from $200/hour · Trivia $300/session"],
 ]);
 assert.equal(completeParty.price,"$1,550 · 4 hours");
 assert.equal(completeParty.description,"One convenient entertainment package: $750 DJ + $800 photo booth, with no separate charge for games or guest interaction.");
 assert.equal(serviceRates["complete-party"].basePriceCents,serviceRates["dj-parties"].basePriceCents+serviceRates["photo-booth"].basePriceCents);
});
for(const id of ["toString","__proto__","constructor",null,42,"elves"]) test(`unknown service rejected: ${String(id)}`,()=>assert.equal(isServiceId(id),false));
test("every approved marketing field and Santa note matches the pre-foundation fixture",async()=>{
 const {readFileSync}=await import("node:fs");
 const {santaNote}=await import("../../src/config/services.ts");
 const approved=JSON.parse(readFileSync(new URL("./fixtures/approved-marketing.json",import.meta.url),"utf8"));
 // Only the newly approved Meet & Greet policy may change the old marketing fixture.
 approved.services[4].note = "Standard appearances and Santa Meet & Greet visits have a minimum of $200 for one hour, plus $100 per additional 30 minutes. Santa-hosted trivia is $300/session; duration and event requirements must be agreed upon before confirmation.";
 assert.deepEqual({santaNote,services},approved);
});
