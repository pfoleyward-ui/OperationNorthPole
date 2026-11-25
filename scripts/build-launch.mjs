/** Build the reviewed launch profile with matching server/static public variables.
 * Builds only: never deploys or activates services. No provider secrets are loaded.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const config=process.env.PRODUCTION_SITE_CONFIG||'wrangler.launch.jsonc';const value=JSON.parse((await readFile(config,'utf8')).split('\n').filter(line=>!line.trimStart().startsWith('//')).join('\n'));
assert.equal(value.name,'operationnorthpole');assert.equal(value.vars.CUSTOMER_BOOKING_MODE,'production');assert.equal(value.vars.PUBLIC_WEBSITE_ONLY,'false');assert.equal(value.vars.HQ_ENABLED,'false');assert.equal(value.vars.SITE_STAGING_ENABLED,'false');assert.ok(['true','false'].includes(value.vars.PUBLIC_BOOKING_SITE_ENABLED));
if(value.vars.PUBLIC_BOOKING_SITE_ENABLED==='true')assert.ok(value.vars.TURNSTILE_SITE_KEY);
const env={...process.env,CUSTOMER_BOOKING_MODE:'production',PUBLIC_BOOKING_SITE_ENABLED:value.vars.PUBLIC_BOOKING_SITE_ENABLED,TURNSTILE_SITE_KEY:value.vars.TURNSTILE_SITE_KEY||''};
const result=spawnSync('node_modules/.bin/opennextjs-cloudflare',['build','--config',config],{env,stdio:'inherit'});process.exit(result.status??1);
