/** Narrow invitation-only family ingress; never exposes HQ, booking or provider APIs.
 * Default-off. The private booking service verifies every bearer invitation.
 */
import {bodyText} from './booking/shared.ts';
export interface FamilyEnv {ELF_FAMILY_ENABLED?:string;ELF_FAMILY_ORIGIN?:string;BOOKING?:{fetch(r:Request):Promise<Response>}}
const safe={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers:safe});
export async function routeFamily(request:Request,env:FamilyEnv):Promise<Response>{
 if(env.ELF_FAMILY_ENABLED!=='true')return fail(503,'optional_notes_unavailable');
 const url=new URL(request.url);let expected:URL;
 try{expected=new URL(env.ELF_FAMILY_ORIGIN!);if(expected.protocol!=='https:'||expected.origin!==env.ELF_FAMILY_ORIGIN)throw Error();}catch{return fail(503,'optional_notes_unavailable');}
 if(url.origin!==expected.origin||url.search||url.pathname.includes('%'))return fail(404,'not_found');
 const page=['/elf-notes','/elf-notes/app.js','/elf-notes/style.css'].includes(url.pathname);
 const api=['/elf-notes/read','/elf-notes/save','/elf-notes/delete'].includes(url.pathname);
 if(!page&&!api)return fail(404,'not_found');
 if(request.method!==(page?'GET':'POST'))return fail(405,'method_not_allowed');
 if(!env.BOOKING)return fail(503,'optional_notes_unavailable');
 const headers=new Headers();let body:string|undefined;
 if(api){
  if(request.headers.get('origin')!==expected.origin||request.headers.get('sec-fetch-site')==='cross-site')return fail(403,'forbidden');
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return fail(415,'json_required');
  const auth=request.headers.get('authorization');if(!auth||!/^Bearer [a-f0-9]{64}$/.test(auth))return fail(401,'private_invitation_required');
  const ip=request.headers.get('cf-connecting-ip');if(!ip)return fail(403,'edge_request_required');
  headers.set('Authorization',auth);headers.set('Origin',expected.origin);headers.set('Content-Type','application/json');headers.set('CF-Connecting-IP',ip);
  try{body=await bodyText(request);}catch(error){return fail(error instanceof RangeError?413:400,'invalid_body');}
 }
 try{
  // No browser cookies, Access assertions, actor fields or arbitrary headers cross
  // this ingress. It cannot invoke a non-family path, including through redirects.
  const result=await env.BOOKING.fetch(new Request(url,{method:request.method,headers,...(body===undefined?{}:{body}),redirect:'manual',signal:AbortSignal.timeout(10000)}));
  if(result.status>=300&&result.status<400)return fail(502,'unexpected_redirect');
  const out=new Headers(safe);for(const name of ['content-type','content-security-policy']){const value=result.headers.get(name);if(value)out.set(name,value);}
  return new Response(result.body,{status:result.status,headers:out});
 }catch{return fail(503,'optional_notes_unavailable');}
}
export default {fetch:routeFamily};
