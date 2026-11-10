// Generates gitignored, disabled staging manifests. Does not deploy or copy secrets.
import {readFile,writeFile} from 'node:fs/promises';
const ids={booking:'4db01c7d-9271-4b68-9839-323bb6887c6f',email:'6ae1f1e9-7014-4cd8-abcb-ba12e2549cf7'};
for(const service of ['booking','integrations','notifications','private-site','site']){
 const source=`wrangler.${service}.jsonc`;const config=JSON.parse(await readFile(source,'utf8'));
 config.name+='-staging';
 for(const db of config.d1_databases||[]){const role=db.database_name.endsWith('booking')?'booking':'email';db.database_id=ids[role];db.database_name+='-staging';}
 for(const binding of config.services||[])binding.service+='-staging';
 if(config.vars.HQ_ORIGIN)config.vars.HQ_ORIGIN='https://staging.santablizard.com';
 if(config.vars.ELF_ORIGIN)config.vars.ELF_ORIGIN='https://staging.santablizard.com';
 if(config.vars.BOOKING_ORIGIN)config.vars.BOOKING_ORIGIN='https://staging.santablizard.com';
 if(config.vars.INTEGRATION_INSTALLATION_ID)config.vars.INTEGRATION_INSTALLATION_ID='santablizard-staging-20261110';
 const destination=`wrangler.${service}.staging.jsonc`;
 try{await writeFile(destination,JSON.stringify(config,null,2)+'\n',{flag:'wx'});console.log('Prepared '+destination);}catch(error){if(error.code!=='EEXIST')throw error;console.log('Preserved existing '+destination);}
}
