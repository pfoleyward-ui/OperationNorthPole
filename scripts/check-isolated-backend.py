"""Explicit controlled-email rehearsal in a newly created disposable D1 database.
Never binds or writes an operational booking database. Restores disabled services.
"""
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--send-approved-staging-emails',action='store_true',help='Authorize at most three labeled test emails to the already approved Gmail inbox')
args=parser.parse_args()
if not args.send_approved_staging_emails:parser.error('Live email rehearsal requires --send-approved-staging-emails')
import os,json,time,uuid,sqlite3,subprocess,urllib.request
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
base='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID'];sp=Path('wrangler.integrations.staging.jsonc');gp=Path('wrangler.notifications.staging.jsonc');so=sp.read_text();go=gp.read_text();temp=Path('wrangler.backend-readiness.staging.jsonc');runid='backend-readiness-'+datetime.now(ZoneInfo('America/New_York')).strftime('%Y%m%d')+'-'+uuid.uuid4().hex[:8];created=None;enabled=False;report={'run_id':runid,'synthetic_disposable_database_only':True,'sole_real_recipient':'santablizard@gmail.com','maximum_new_test_emails':3,'operational_notes_collection_enabled':False,'automatic_retention_enabled':False,'production_changed':False};edb='6ae1f1e9-7014-4cd8-abcb-ba12e2549cf7'
def api(p,data=None,method=None):
 with urllib.request.urlopen(urllib.request.Request(base+p,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=json.dumps(data).encode() if data is not None else None,method=method),timeout=30) as r:
  v=json.load(r);assert v['success'];return v['result']
def q(db,sql,params=[]):return api('/d1/database/'+db+'/query',{'sql':sql,'params':params})[0]['results']
def deploy(path,label):
 with open('work/isolated-'+label+'.log','w') as f:r=subprocess.run(['node_modules/.bin/wrangler','deploy','--config',str(path)],stdout=f,stderr=subprocess.STDOUT)
 if r.returncode:raise RuntimeError('Staging step failed: '+label)
assert 8<=datetime.now(ZoneInfo('America/New_York')).hour<20
assert json.loads(so)['name']=='operation-north-pole-integrations-staging' and json.loads(go)['name']=='operation-north-pole-notifications-staging'
assert json.loads(go)['vars']['GATEWAY_DELIVERY_ENABLED']=='false' and json.loads(so)['vars']['INTEGRATION_PLANNER_ENABLED']=='false'
public=api('/workers/scripts/operationnorthpole/deployments');operational_before=q('4db01c7d-9271-4b68-9839-323bb6887c6f',"SELECT (SELECT COUNT(*) FROM booking_requests) AS bookings,(SELECT COUNT(*) FROM elf_notes) AS notes,(SELECT SUM(version) FROM hq_bookings) AS version_total")
started=int(time.time()*1000)
try:
 created=api('/d1/database',{'name':'onp-backend-readiness-'+uuid.uuid4().hex[:10]})['uuid']
 for filename in ['0001_booking_intake.sql','0002_santa_hq.sql','0003_integrations.sql','0004_customer_email.sql','0005_elf_notes.sql']:
  pending=''
  for char in Path('migrations/'+filename).read_text():
   pending+=char
   if char==';' and sqlite3.complete_statement(pending):q(created,pending);pending=''
  assert not pending.strip()
 q(created,'CREATE TABLE synthetic_isolation_guard(database_id TEXT NOT NULL)');q(created,'INSERT INTO synthetic_isolation_guard VALUES(?)',[created])
 cfg=json.loads(so);cfg['main']='workers/backend-readiness-test.ts';cfg['d1_databases']=[{'binding':'DB','database_name':'onp-isolated-readiness','database_id':created}];cfg['vars']={'BACKEND_READINESS_ENABLED':'true','TEST_DATABASE_ID':created,'RUN_ID':runid,'EXPIRES_AT':str(int(time.time()*1000)+600000)};cfg['services']=[{'binding':'NOTIFY','service':'operation-north-pole-notifications-staging'}];temp.write_text(json.dumps(cfg,indent=2)+'\n')
 gateway=json.loads(go);gateway['vars']['GATEWAY_DELIVERY_ENABLED']='true';gp.write_text(json.dumps(gateway,indent=2)+'\n');enabled=True;deploy(gp,'enable-private-gateway');deploy(temp,'deploy-disposable-runner');print('Disposable-only rehearsal scheduled; real collection/retention and operational scheduler remain off',flush=True)
 deadline=time.monotonic()+420
 while time.monotonic()<deadline:
  exists=q(created,"SELECT name FROM sqlite_master WHERE name='synthetic_backend_evidence'")
  if exists:
   rows=q(created,'SELECT report FROM synthetic_backend_evidence WHERE id=?',[runid])
   if rows:
    evidence=json.loads(rows[0]['report']);report['rehearsal']=evidence
    if evidence['phase'] in ['passed','failed']:break
  time.sleep(10)
 else:report['bounded_window_ended']=True
finally:
 gp.write_text(go)
 restoration_errors=[]
 if enabled:
  try:deploy(gp,'restore-private-gateway-off')
  except Exception:restoration_errors.append('gateway_restore_failed')
 try:deploy(sp,'restore-original-disabled-scheduler')
 except Exception:restoration_errors.append('scheduler_restore_failed')
 report['gateway_and_original_scheduler_restored_off']=not restoration_errors
 report['restoration_errors']=restoration_errors
 try:
  report['new_gateway_receipts']=q(edb,"SELECT state,attempts,provider_id IS NOT NULL AS provider_receipt_present,destination='santablizard@gmail.com' AS sole_approved_destination FROM gateway_deliveries WHERE created_at>=?",[started])
  report['signed_webhook_receipts']=q(edb,'SELECT COUNT(*) AS n FROM gateway_webhook_receipts WHERE received_at>=?',[started])[0]['n']
  report['public_worker_history_unchanged']=public==api('/workers/scripts/operationnorthpole/deployments')
  report['operational_booking_and_note_metadata_unchanged']=operational_before==q('4db01c7d-9271-4b68-9839-323bb6887c6f',"SELECT (SELECT COUNT(*) FROM booking_requests) AS bookings,(SELECT COUNT(*) FROM elf_notes) AS notes,(SELECT SUM(version) FROM hq_bookings) AS version_total")
 finally:
  if created:
   try:api('/d1/database/'+created,method='DELETE');report['temporary_database_deleted']=True
   except Exception:report['temporary_database_deleted']=False
  Path('work/isolated-backend-result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
 if restoration_errors:raise RuntimeError('Staging restoration incomplete; inspect the sanitized report')
