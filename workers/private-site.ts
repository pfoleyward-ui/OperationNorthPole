/** Private HQ/notes gateway: no public assets and no public route until Access is ready. */
import {routeSite,type SiteEnv} from './site-router.ts';
export default {fetch(request:Request,env:SiteEnv,ctx:unknown){
 return routeSite(request,env,ctx,{async fetch(){return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});}});
}};
