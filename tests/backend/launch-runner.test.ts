import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hqFixture} from './hq-fixture.ts';
import {gatewayFixture} from './gateway-fixture.ts';
import runner from '../../workers/launch-test.ts';
import booking from '../../workers/booking/index.ts';
import {handleGateway} from '../../workers/notifications/index.ts';
test('private scheduled staging runner completes its workflow and removes synthetic records',async()=>{
 const f=await hqFixture(),g=await gatewayFixture();
 try{
  let work:Promise<unknown>=Promise.resolve();
  runner.scheduled(null,{DB:f.env.DB,EMAIL_DB:g.env.DB,BOOKING:{fetch:r=>booking.fetch(r,{...f.env,HQ_ENABLED:'false'})},NOTIFY:{fetch:r=>handleGateway(r,{...g.gatewayEnv,GATEWAY_DELIVERY_ENABLED:'false'})},RUN_ID:'local-synthetic-runner'},{waitUntil:p=>{work=p;}});
  await work;
  const result=await f.db.prepare('SELECT status,report FROM synthetic_launch_evidence').first<{status:string;report:string}>();
  assert.equal(result?.status,'passed',result?.report);
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM booking_requests').first<{n:number}>())?.n,0);
 }finally{await f.dispose();await g.dispose();}
});
