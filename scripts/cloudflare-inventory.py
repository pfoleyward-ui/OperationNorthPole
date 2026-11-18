"""Read-only launch inventory. Records binding metadata, never secret values/rows."""
import concurrent.futures
import json
import os
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

ACCOUNT=os.environ['CLOUDFLARE_ACCOUNT_ID']
ROOT='https://api.cloudflare.com/client/v4'
def api(path,body=None):
    request=urllib.request.Request(ROOT+path,headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'},data=json.dumps(body).encode() if body else None)
    try:
        with urllib.request.urlopen(request,timeout=25) as response:return json.load(response)
    except urllib.error.HTTPError as error:
        value=json.loads(error.read())
        return {'success':False,'http_status':error.code,'errors':[{k:e[k] for k in ['code','message','error'] if k in e} for e in value.get('errors',[])]}

def worker(item):
    name=item['id'];prefix=f'/accounts/{ACCOUNT}/workers/scripts/{name}'
    settings=api(prefix+'/settings');result=settings.get('result') or {}
    safe=[]
    for binding in result.get('bindings',[]):
        entry={k:binding[k] for k in ['name','type','id','service'] if k in binding}
        if binding['type']=='plain_text' and (binding['name'].endswith('_ENABLED') or binding['name'] in ['PUBLIC_WEBSITE_ONLY','CUSTOMER_BOOKING_MODE','ELF_RETENTION_APPROVED','ACCESS_TEAM_DOMAIN']):entry['value']=binding.get('text')
        safe.append(entry)
    deploy=api(prefix+'/deployments');deployments=(deploy.get('result') or {}).get('deployments',[])
    return {'name':name,'modified_on':item.get('modified_on'),'bindings':safe,'logging':{'logpush':result.get('logpush',False),'observability':result.get('observability')},'subdomain':api(prefix+'/subdomain').get('result'),'schedules':(api(prefix+'/schedules').get('result') or {}).get('schedules'),'latest_deployment':{k:deployments[0][k] for k in ['id','created_on','versions'] if k in deployments[0]} if deployments else None}

workers=api(f'/accounts/{ACCOUNT}/workers/scripts')
report={'workers':list(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(worker,workers.get('result',[]))),'domains':api(f'/accounts/{ACCOUNT}/workers/domains').get('result'),'queues':api(f'/accounts/{ACCOUNT}/queues').get('result'),'access_apps':api(f'/accounts/{ACCOUNT}/access/apps'),'identity_providers':api(f'/accounts/{ACCOUNT}/access/identity_providers'),'access_organization':api(f'/accounts/{ACCOUNT}/access/organizations')}
report['databases']=[]
for db in api(f'/accounts/{ACCOUNT}/d1/database').get('result',[]):
    query=api(f'/accounts/{ACCOUNT}/d1/database/{db["uuid"]}/query',{'sql':'SELECT name FROM d1_migrations ORDER BY id'})
    report['databases'].append({'name':db['name'],'uuid':db['uuid'],'migrations':query.get('result',[{}])[0].get('results',[]) if query.get('success') else [],'migration_query_success':query.get('success',False)})
report['public_http']=[]
for path in ['/','/services','/book','/hq','/api/bookings','/review','/elf-notes','/webhooks/resend']:
    code=subprocess.check_output(['curl','-sS','--max-time','20','-o','/dev/null','-w','%{http_code}','https://santablizard.com'+path],text=True)
    report['public_http'].append({'path':path,'status':int(code)})
report['public_http'].append({'url':'https://www.santablizard.com/','status':int(subprocess.check_output(['curl','-sS','--max-time','20','-o','/dev/null','-w','%{http_code}','https://www.santablizard.com/'],text=True))})
Path('work/cloudflare-inventory-final.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'workers':[w['name'] for w in report['workers']],'databases':report['databases'],'public_http':report['public_http']}))
