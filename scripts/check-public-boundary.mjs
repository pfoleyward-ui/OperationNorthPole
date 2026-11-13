import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.PUBLIC_BASE_URL||'http://127.0.0.1:8799';
const output=process.env.VISUAL_OUTPUT_DIR||'/workspace/public-release-validation';
await mkdir(output,{recursive:true});
const checks=[];
for(const [path,status] of [['/',200],['/services',200],['/_optimized/santa-cutout-750.webp',200],['/images/santa-family.jpg',200],['/book',404],['/review',404],['/hq',404],['/hq/api/bookings',404],['/api/bookings',404],['/webhooks/resend',404]]){
 const response=await fetch(base+path,{redirect:'manual'});assert.equal(response.status,status,path);await response.arrayBuffer();checks.push({path,method:'GET',status});
}
for(const path of ['/api/bookings','/hq/api/bookings','/webhooks/resend','/book']){
 const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual'});assert.equal(response.status,404,path);checks.push({path,method:'POST',status:response.status});
}
// Wrangler's loopback server rewrites Host; verify real domain routing only live.
if(new URL(base).hostname==='santablizard.com'){
 const redirected=await fetch('https://www.santablizard.com/services?source=invite',{redirect:'manual'});
 assert.equal(redirected.status,308);assert.equal(redirected.headers.get('location'),'https://santablizard.com/services?source=invite');
 checks.push({host:'www.santablizard.com',path:'/services?source=invite',status:308,location:redirected.headers.get('location')});
}
await writeFile(output+'/boundary-report.json',JSON.stringify({base,liveDomainVerified:base==='https://santablizard.com',checks},null,2)+'\n');
console.log('PASS public documents/images and blocked private routes/submissions. '+(new URL(base).hostname==='santablizard.com'?'Live www redirect verified.':'Live www/HTTPS checks pending; redirect logic is unit-tested.'));
