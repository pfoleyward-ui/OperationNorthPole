/** Disposable-data-only smoke-test leaf. Never use with operational data. */
import {handleElf} from './booking/elf-notes.ts';
import type {Database} from './booking/repository.ts';
interface Env {DB:Database;FAMILY_REHEARSAL_ENABLED?:string;TEST_DATABASE_ID?:string}
export default {async fetch(request:Request,b:Env){
 if(b.FAMILY_REHEARSAL_ENABLED!=='true'||!b.TEST_DATABASE_ID||['4db01c7d-9271-4b68-9839-323bb6887c6f','6ae1f1e9-7014-4cd8-abcb-ba12e2549cf7'].includes(b.TEST_DATABASE_ID))return new Response('Unavailable',{status:503});
 const guard=await b.DB.prepare('SELECT database_id FROM synthetic_isolation_guard').first<{database_id:string}>();if(guard?.database_id!==b.TEST_DATABASE_ID)return new Response('Unavailable',{status:503});
 return handleElf(request,{DB:b.DB,ELF_NOTES_ENABLED:'true',ELF_ORIGIN:'https://notes-staging.santablizard.com',HQ_ORIGIN:'https://staging.santablizard.com',ELF_TOKEN_SECRET:'synthetic-only-family-rehearsal-token-key',ELF_ACTIVE_KEY:'synthetic',ELF_ENCRYPTION_KEYS:JSON.stringify({synthetic:btoa('f'.repeat(32))}),ELF_RETENTION_APPROVED:'false'});
}};
