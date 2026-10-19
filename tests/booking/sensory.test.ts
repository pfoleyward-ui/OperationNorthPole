import test from "node:test";
import assert from "node:assert/strict";
import {validateBookingRequest} from "../../src/domain/booking/request.ts";
import {bookingSubmissionAvailability} from "../../src/domain/booking/submission.ts";
import {basePriceForDuration,bookableServices} from "../../src/config/services.ts";
const request={serviceId:"home-visits",timing:{date:"2027-12-20",time:"14:00"},customer:{name:"Sample Adult",email:"sample@example.test",phone:"202-555-0100"},location:"Sample venue",eventType:"Sample visit",answers:{}};
for(const value of [true,false])test(`sensory preference ${value} stays a boolean and adds no service or charge`,()=>{
 const r=validateBookingRequest({...request,sensoryFriendly:value},Date.parse("2026-10-19T00:00Z"));assert.ok(r.ok);if(r.ok)assert.equal(r.value.sensoryFriendly,value);
 assert.equal(basePriceForDuration("home-visits",30),15000);assert.equal(Object.keys(bookableServices).length,7);
});
for(const value of ["diagnosis",{diagnosis:"not collected"},1,null])test(`reject unstructured sensitive preference ${JSON.stringify(value)}`,()=>assert.equal(validateBookingRequest({...request,sensoryFriendly:value},Date.parse("2026-10-19T00:00Z")).ok,false));
for(const key of ["diagnosis","medicalDetails","childName","preparationNotes","elfNotes"])test(`reject deferred private field ${key}`,()=>assert.equal(validateBookingRequest({...request,[key]:"not collected"},Date.parse("2026-10-19T00:00Z")).ok,false));
test("submission gate fails closed until secure persistence exists",()=>assert.deepEqual(bookingSubmissionAvailability(),{kind:"unavailable",reason:"secure_persistence_not_configured"}));
