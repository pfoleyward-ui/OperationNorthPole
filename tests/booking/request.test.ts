import test from "node:test";
import assert from "node:assert/strict";
import { validateBookingRequest, validAppointment } from "../../src/domain/booking/request.ts";
import { selectInstant } from "../../src/domain/booking/time.ts";
const now=Date.parse("2026-10-01T00:00:00Z");
const input=()=>({serviceId:"home-visits",timing:{date:"2026-12-20",time:"14:00"},customer:{name:" Test Adult ",email:"adult@example.com",phone:"845-234-2858"},location:"Synthetic venue, Blooming Grove, NY",eventType:"Family visit",answers:{childrenCount:2,familyGifts:true}});
test("valid request is normalized, serializable, and does not reserve an appointment",()=>{
 const result=validateBookingRequest(input(),now);assert.ok(result.ok);if(!result.ok)return;
 assert.equal(result.value.customer.name,"Test Adult");assert.equal(result.value.timing.timeZone,"America/New_York");assert.equal(result.value.timing.durationMinutes,30);
 assert.equal(new Date(result.value.timing.earliestStart).toISOString(),"2026-12-20T19:00:00.000Z");assert.deepEqual(JSON.parse(JSON.stringify(result.value)),result.value);assert.equal('status' in result.value,false);
});
const invalidCases:[string,(v:Record<string,unknown>)=>void][]=[
 ["unknown service",v=>v.serviceId="toString"], ["invalid date",v=>v.timing={date:"2026-02-30",time:"14:00"}],
 ["Christmas Eve",v=>v.timing={date:"2026-12-24",time:"14:00"}],["Christmas Day",v=>v.timing={date:"2026-12-25",time:"14:00"}],
 ["blocked alternative",v=>v.alternative={date:"2026-12-24",time:"14:00"}], ["past time",v=>v.timing={date:"2026-09-01",time:"14:00"}],
 ["invalid alternative",v=>v.alternative={date:"2026-12-20",time:"24:00"}], ["fixed duration override",v=>v.durationMinutes=60],
 ["negative duration",v=>v.durationMinutes=-1],["fractional duration",v=>v.durationMinutes=1.5],
 ["crosses blackout",v=>v.timing={date:"2026-12-23",time:"23:45"}],
 ["invalid email",v=>v.customer={name:"Adult",email:"bad",phone:"8452342858"}],["invalid phone",v=>v.customer={name:"Adult",email:"a@example.com",phone:"call-me"}],
 ["missing location",v=>delete v.location], ["negative guest count",v=>v.guestCount=-1], ["non-string event",v=>v.eventType=42],
 ["wrong service question",v=>v.answers={studioName:"Studio"}],["invalid count answer",v=>v.answers={childrenCount:1.5}],
 ["invalid boolean answer",v=>v.answers={familyGifts:"yes"}], ["unsupported secret notes",v=>v.elfNotes={childName:"Not collected"}],
 ["forged price",v=>v.totalCents=1], ["oversized instructions",v=>v.instructions="x".repeat(2001)],
 ["invalid window",v=>v.timing={date:"2026-12-20",time:"14:00",latestTime:"13:00"}],
 ["spring gap",v=>v.timing={date:"2027-03-14",time:"02:30"}],
 ["ambiguous fold without choice",v=>v.timing={date:"2026-11-01",time:"01:30"}],
 ["invalid disambiguation",v=>v.timing={date:"2026-11-01",time:"01:30",disambiguation:"guess"}],
];
for(const [name,mutate]of invalidCases)test(`invalid request: ${name}`,()=>{const v:Record<string,unknown>=input();mutate(v);assert.equal(validateBookingRequest(v,now).ok,false);});
for(const v of [null,[],"request",{},42])test(`malformed request ${JSON.stringify(v)}`,()=>assert.equal(validateBookingRequest(v,now).ok,false));
test("unknown trivia duration stays unknown until agreed, and is required for a concrete appointment",()=>{
 const v={...input(),serviceId:"trivia",answers:{triviaPlan:"A brewery event"}};
 const result=validateBookingRequest(v,now);assert.ok(result.ok);if(result.ok)assert.equal(result.value.timing.durationMinutes,null);
 const agreed=validateBookingRequest({...v,durationMinutes:90},now);assert.ok(agreed.ok);if(agreed.ok)assert.equal(agreed.value.timing.durationMinutes,90);
 assert.equal(validAppointment(selectInstant("2026-12-20","14:00"),selectInstant("2026-12-20","15:30"),"trivia"),true);
});
test("start windows and optional alternative use explicit resolved instants",()=>{
 const v={...input(),timing:{date:"2026-12-20",time:"14:00",latestTime:"16:00"},alternative:{date:"2026-12-21",time:"15:00"}};
 const r=validateBookingRequest(v,now);assert.ok(r.ok);if(r.ok){assert.equal(r.value.timing.latestStart-r.value.timing.earliestStart,7200000);assert.ok(r.value.alternative);}
});
test("explicit fall-back choice permits an unambiguous request",()=>assert.ok(validateBookingRequest({...input(),timing:{date:"2026-11-01",time:"01:30",disambiguation:"later"}},now).ok));
test("all services accept only their own optional planning questions",()=>{
 for(const serviceId of ["photography","dj-parties","photo-booth","complete-party","meet-greet","trivia"])assert.ok(validateBookingRequest({...input(),serviceId,answers:{}},now).ok);
});
test("invalid clock rejected",()=>assert.equal(validateBookingRequest(input(),NaN).ok,false));
