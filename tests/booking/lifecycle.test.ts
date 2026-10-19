import test from "node:test";
import assert from "node:assert/strict";
import { acceptQuote, transitionBooking, validateQuote, type Quote, type Booking, type BookingStatus } from "../../src/domain/booking/lifecycle.ts";
import { selectInstant } from "../../src/domain/booking/time.ts";
const now=Date.parse("2026-10-01T00:00:00Z");
const quote=():Quote=>({id:"q1",bookingId:"b1",serviceId:"home-visits",revision:1,catalogVersion:1,currency:"USD",totalCents:15000,start:selectInstant("2026-12-20","14:00"),end:selectInstant("2026-12-20","14:30"),createdAt:now-1000,expiresAt:now+86400000});
const booking=(status:BookingStatus="awaiting_customer_acceptance"):Booking=>({id:"b1",serviceId:"home-visits",version:1,status,quote:quote()});
const accepted=()=>{const a=acceptQuote(quote(),1,now,"customer");assert.ok(a.ok);return a.ok?a.value:undefined;};
const context=()=>({actor:"santa" as const,now,expectedVersion:1,acceptance:accepted(),scheduleCheck:{bookingVersion:1,checkedAt:now,conflictFree:true,staffingVerified:true}});
test("manual quote and acceptance remain separate from confirmation",()=>{
 assert.ok(validateQuote(quote()).ok);const b=booking();const before=structuredClone(b);const r=transitionBooking(b,"confirmed",context());assert.ok(r.ok);if(r.ok){assert.equal(r.value.status,"confirmed");assert.equal(r.value.version,2);}assert.deepEqual(b,before);
});
for(const [name,patch]of Object.entries({"fractional cents":{totalCents:15000.1},"zero total":{totalCents:0},"negative total":{totalCents:-1},"unsafe total":{totalCents:Number.MAX_SAFE_INTEGER+1},"currency":{currency:"EUR"},"catalog version":{catalogVersion:999},"revision":{revision:0},"invalid appointment":{end:quote().start},"wrong fixed duration":{end:quote().end+60000},"expiry":{expiresAt:now-2000},"undisclosed change":{totalCents:17500},"unknown field":{staffPassword:"x"}}))test(`invalid quote: ${name}`,()=>assert.equal(validateQuote({...quote(),...patch}).ok,false));
test("manual adjusted quote requires disclosure, never calculates travel",()=>assert.ok(validateQuote({...quote(),totalCents:17500,adjustmentReason:"Agreed travel logistics"}).ok));
for(const revision of [0,2])test(`stale quote acceptance revision ${revision}`,()=>assert.equal(acceptQuote(quote(),revision,now,"customer").ok,false));
test("expired and pre-issue acceptance rejected",()=>{assert.equal(acceptQuote(quote(),1,quote().expiresAt,"customer").ok,false);assert.equal(acceptQuote(quote(),1,now-2000,"customer").ok,false);});
for(const [name,patch]of Object.entries({"wrong actor":{actor:"customer"},"stale booking":{expectedVersion:2},"missing agreement":{acceptance:undefined},"missing conflict check":{scheduleCheck:undefined},"conflict":{scheduleCheck:{bookingVersion:1,checkedAt:now,conflictFree:false,staffingVerified:true}},"old schedule check":{scheduleCheck:{bookingVersion:1,checkedAt:now-1,conflictFree:true,staffingVerified:true}},"future acceptance":{acceptance:{...accepted(),acceptedAt:now+1}}}))test(`confirmation blocked: ${name}`,()=>assert.equal(transitionBooking(booking(),"confirmed",{...context(),...patch} as ReturnType<typeof context>).ok,false));
test("new quote cannot be substituted at confirmation",()=>assert.equal(transitionBooking(booking(),"confirmed",{...context(),quote:{...quote(),revision:2,totalCents:16000,adjustmentReason:"Updated logistics"}}).ok,false));
test("acceptance of a superseded proposal cannot confirm",()=>assert.equal(transitionBooking({...booking(),quote:{...quote(),revision:2}},"confirmed",context()).ok,false));
test("reviewing a proposal clears old acceptance",()=>{
 const r=transitionBooking({...booking(),acceptance:accepted()},"under_review",{actor:"santa",now,expectedVersion:1});assert.ok(r.ok);if(r.ok)assert.equal(r.value.acceptance,undefined);
});
test("party staffing must be verified",()=>{
 const q:Quote={...quote(),serviceId:"complete-party",totalCents:155000,end:quote().start+240*60000};
 const a=acceptQuote(q,1,now,"recorded_offline");assert.ok(a.ok);if(!a.ok)return;
 const b:Booking={...booking(),serviceId:"complete-party",quote:q};
 assert.equal(transitionBooking(b,"confirmed",{...context(),acceptance:a.value,scheduleCheck:{bookingVersion:1,checkedAt:now,conflictFree:true,staffingVerified:false}}).ok,false);
 assert.ok(transitionBooking(b,"confirmed",{...context(),acceptance:a.value}).ok);
});
test("completion requires event end; acknowledgment cannot cancel",()=>{
 assert.equal(transitionBooking(booking("confirmed"),"completed",context()).ok,false);
 assert.ok(transitionBooking(booking("confirmed"),"completed",{...context(),now:quote().end}).ok);
 assert.equal(transitionBooking(booking("confirmed"),"canceled",{...context(),actor:"customer"}).ok,false);
});
for(const status of ["requested","declined","canceled","completed"] as const)test(`cannot directly confirm ${status}`,()=>assert.equal(transitionBooking(booking(status),"confirmed",context()).ok,false));
test("proposal workflow requires a valid quote to send",()=>{
 const b:Booking={id:"b1",serviceId:"home-visits",version:1,status:"under_review"};
 assert.equal(transitionBooking(b,"awaiting_customer_acceptance",{actor:"santa",now,expectedVersion:1}).ok,false);
 assert.ok(transitionBooking(b,"awaiting_customer_acceptance",{actor:"santa",now,expectedVersion:1,quote:quote()}).ok);
 assert.ok(transitionBooking(b,"alternative_proposed",{actor:"santa",now,expectedVersion:1}).ok);
});
test("draft alternatives cannot roll quote revisions backward",()=>assert.equal(transitionBooking({...booking("under_review"),quote:{...quote(),revision:2}},"alternative_proposed",{actor:"santa",now,expectedVersion:1,quote:quote()}).ok,false));
test("a malformed stored quote cannot be completed",()=>assert.equal(transitionBooking({...booking("confirmed"),quote:{...quote(),end:NaN}},"completed",context()).ok,false));
test("changing total without incrementing the revision is rejected",()=>assert.equal(transitionBooking(booking("under_review"),"awaiting_customer_acceptance",{actor:"santa",now,expectedVersion:1,quote:{...quote(),totalCents:16000,adjustmentReason:"Updated logistics"}}).ok,false));
test("property ordering does not change proposal identity",()=>{
 const q=quote();const reordered=Object.fromEntries(Object.entries(q).reverse()) as Quote;
 assert.ok(transitionBooking(booking("under_review"),"awaiting_customer_acceptance",{actor:"santa",now,expectedVersion:1,quote:reordered}).ok);
});
