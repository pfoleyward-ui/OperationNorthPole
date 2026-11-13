"""Exercise populated synthetic backup/restore in temporary D1 databases only."""
import hashlib
import json
import os
from pathlib import Path
import urllib.request

ROOT='https://api.cloudflare.com/client/v4/accounts/'+os.environ['CLOUDFLARE_ACCOUNT_ID']
HEADERS={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN'],'Content-Type':'application/json'}
def api(path,body=None,method=None):
    req=urllib.request.Request(ROOT+path,headers=HEADERS,data=json.dumps(body).encode() if body is not None else None,method=method)
    with urllib.request.urlopen(req,timeout=30) as response:
        value=json.load(response)
    if not value.get('success'):
        raise RuntimeError('Cloudflare operation failed')
    return value['result']
def query(db,sql,params=None):
    return api('/d1/database/'+db+'/query',{'sql':sql,'params':params or []})[0]['results']
def quoted(name):return '"'+name.replace('"','""')+'"'
def populate(db,snapshot):
    for item in snapshot['schema']:
        if item['type']=='table':query(db,item['sql'])
    done=set()
    while len(done)<len(snapshot['tables']):
        progress=False
        for name,table in snapshot['tables'].items():
            if name in done or any(d!=name and d not in done for d in table['dependencies']):continue
            for row in table['rows']:
                columns=list(row)
                query(db,'INSERT INTO '+quoted(name)+' ('+','.join(map(quoted,columns))+') VALUES ('+','.join('?' for _ in columns)+')',[row[c] for c in columns])
            done.add(name);progress=True
        assert progress,'Foreign-key ordering needs review'
    for item in snapshot['schema']:
        if item['type']!='table':query(db,item['sql'])
def export(db,template):
    snapshot={'schema':query(db,"SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name"),'tables':{}}
    for name,table in template['tables'].items():
        snapshot['tables'][name]={'dependencies':table['dependencies'],'rows':query(db,'SELECT * FROM '+quoted(name))}
    return snapshot
def fingerprint(snapshot):
    normalized={'schema':sorted(snapshot['schema'],key=lambda x:(x['type'],x['name'])),'tables':{name:sorted(table['rows'],key=lambda row:json.dumps(row,sort_keys=True)) for name,table in sorted(snapshot['tables'].items())}}
    return hashlib.sha256(json.dumps(normalized,sort_keys=True,separators=(',',':')).encode()).hexdigest()

payload=json.loads(Path('work/synthetic-recovery-source.json').read_text())
assert payload.get('syntheticOnly') is True and payload.get('source')=='local application handlers with synthetic fixtures'
for row in payload['booking']['tables']['booking_requests']['rows']:
    request=json.loads(row['request_json']);assert request['customer']['email'].endswith('@example.test')
for row in payload['email']['tables']['gateway_deliveries']['rows']:
    assert row['destination'].endswith('@example.test')
report=[];restored={'reference':payload['reference']}
for role in ['booking','email']:
    created=[]
    try:
        for suffix in ['source','restore']:
            database=api('/d1/database',{'name':'onp-synthetic-recovery-'+role+'-'+suffix})
            created.append(database['uuid'])
        populate(created[0],payload[role]);backup=export(created[0],payload[role]);assert fingerprint(backup)==fingerprint(payload[role])
        path=Path('work/synthetic-recovery-'+role+'-backup.json');path.write_text(json.dumps(backup));path.chmod(0o600)
        populate(created[1],json.loads(path.read_text()));result=export(created[1],payload[role]);assert fingerprint(result)==fingerprint(backup)
        assert query(created[1],'PRAGMA foreign_key_check')==[]
        restored[role]=result
        report.append({'role':role,'result':'passed','populated_rows':sum(len(t['rows']) for t in result['tables'].values()),'tables':len(result['tables']),'exact_schema_and_data_match':True,'foreign_key_check':'passed','production_databases_used':False})
    finally:
        for database in reversed(created):api('/d1/database/'+database,method='DELETE')
path=Path('work/synthetic-recovery-restored.json');path.write_text(json.dumps(restored));path.chmod(0o600)
Path('work/synthetic-recovery-cloudflare-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'cloudflare_populated_recovery':report,'temporary_databases_removed':True,'production_writes':0}))
