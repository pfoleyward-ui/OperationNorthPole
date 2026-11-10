"""Test recovery of newly provisioned EMPTY production databases via the API.

Refuses any business rows. Never use as a customer-data backup tool.
No pre-signed export URLs, credentials or customer values are printed.
"""
import json
import os
import urllib.request
from pathlib import Path

ROOT = 'https://api.cloudflare.com/client/v4/accounts/' + os.environ['CLOUDFLARE_ACCOUNT_ID']
HEADERS = {'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN'], 'Content-Type': 'application/json'}

def api(path, body=None, method=None):
    req = urllib.request.Request(ROOT+path, headers=HEADERS, data=json.dumps(body).encode() if body is not None else None, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    if not result.get('success'):
        raise RuntimeError('Cloudflare API operation failed')
    return result['result']

def query(database, sql, params=None):
    return api('/d1/database/'+database+'/query', {'sql':sql, 'params':params or []})[0]['results']

def identifier(name):
    return '"'+name.replace('"','""')+'"'

reports=[]
databases=json.loads(Path('work/production-databases.json').read_text())
for role, source in databases.items():
    schema=query(source['uuid'], "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name")
    tables=[row['name'] for row in schema if row['type']=='table']
    for table in tables:
        if table!='d1_migrations' and query(source['uuid'],'SELECT COUNT(*) AS n FROM '+identifier(table))[0]['n']!=0:
            raise RuntimeError('Refusing to copy nonempty business data')
    migrations=query(source['uuid'],'SELECT * FROM d1_migrations ORDER BY id')
    backup={'schema':schema,'migrations':migrations,'business_data':'verified empty'}
    Path('work/'+role+'-schema-backup.json').write_text(json.dumps(backup,indent=2))
    restore=api('/d1/database',{'name':'operation-north-pole-'+role+'-recovery-check'})
    try:
        for item in schema:
            query(restore['uuid'],item['sql'])
        for row in migrations:
            columns=list(row)
            query(restore['uuid'],'INSERT INTO d1_migrations ('+','.join(map(identifier,columns))+') VALUES ('+','.join('?' for _ in columns)+')',[row[key] for key in columns])
        recovered=query(restore['uuid'],"SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,name")
        assert recovered==schema, 'Restored schema mismatch'
        assert query(restore['uuid'],'SELECT * FROM d1_migrations ORDER BY id')==migrations
        reports.append({'role':role,'schema_objects':len(schema),'migrations':len(migrations),'isolated_restore':'passed','business_rows_copied':0})
    finally:
        api('/d1/database/'+restore['uuid'],method='DELETE')
Path('work/recovery-report.json').write_text(json.dumps(reports,indent=2))
print(json.dumps(reports))
