"""Native D1 export/download/import for locally generated synthetic fixtures only.
No production/staging account data or real keyrings are read. Signed URLs stay in memory.
"""
import hashlib
import json
from pathlib import Path
import runpy
import time
import urllib.request
import uuid
from native_d1_sql import dependency_ordered_dump

lib=runpy.run_path(str(Path(__file__).with_name('check-populated-d1-recovery.py')),run_name='recovery_library')
api,query,populate,export,fingerprint=[lib[k] for k in ['api','query','populate','export','fingerprint']]
payload=json.loads(Path('work/synthetic-recovery-source.json').read_text())
assert payload.get('syntheticOnly') is True and payload.get('source')=='local application handlers with synthetic fixtures'
assert all(json.loads(row['request_json'])['customer']['email'].endswith('@example.test') for row in payload['booking']['tables']['booking_requests']['rows'])
assert all(row['destination'].endswith('@example.test') for row in payload['email']['tables']['gateway_deliveries']['rows'])

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
opener=urllib.request.build_opener(NoRedirect)

def native_export(db):
    bookmark=None
    for _ in range(90):
        value=api('/d1/database/'+db+'/export',{'output_format':'polling','dump_options':{'no_data':False,'no_schema':False,'tables':[]},**({'current_bookmark':bookmark} if bookmark else {})})
        if value.get('success') is False or value.get('status')=='error':raise RuntimeError('Native export failed')
        if value.get('status')=='complete':
            # No API Authorization header is used on the signed download request.
            with opener.open(urllib.request.Request(value['result']['signed_url']),timeout=30) as response:data=response.read(16*1024*1024+1)
            assert 0<len(data)<=16*1024*1024
            assert b'CREATE TABLE' in data
            return data
        bookmark=value.get('at_bookmark');time.sleep(1)
    raise RuntimeError('Native export timed out')

def native_import(db,data):
    etag=hashlib.md5(data).hexdigest();value=api('/d1/database/'+db+'/import',{'action':'init','etag':etag})
    if 'upload_url' in value:
        req=urllib.request.Request(value['upload_url'],data=data,method='PUT',headers={'Content-Length':str(len(data))})
        with opener.open(req,timeout=30) as response:
            assert response.status==200 and response.headers.get('ETag','').strip('"')==etag
        value=api('/d1/database/'+db+'/import',{'action':'ingest','filename':value['filename'],'etag':etag})
    for _ in range(90):
        if value.get('success') is False or value.get('status')=='error':
            Path('work/native-import-failure-private.json').write_text(json.dumps(value));Path('work/native-import-failure-private.json').chmod(0o600)
            raise RuntimeError('Native import failed')
        if value.get('status')=='complete':return
        time.sleep(1);value=api('/d1/database/'+db+'/import',{'action':'poll','current_bookmark':value['at_bookmark']})
    raise RuntimeError('Native import timed out')

reports=[];restored={'reference':payload['reference']};created_all=[]
try:
    for role in ['booking','email']:
        created=[]
        try:
            for kind in ['source','restore']:
                value=api('/d1/database',{'name':'onp-native-'+role+'-'+kind+'-'+uuid.uuid4().hex[:8]})
                created.append(value['uuid']);created_all.append(value['uuid'])
            populate(created[0],payload[role]);assert fingerprint(export(created[0],payload[role]))==fingerprint(payload[role])
            data=native_export(created[0]);path=Path('work/native-synthetic-'+role+'.sql');path.write_bytes(data);path.chmod(0o600)
            ordered=dependency_ordered_dump(data.decode(),{name:table['dependencies'] for name,table in payload[role]['tables'].items()});restore_bytes=ordered.encode();restore_path=Path('work/native-synthetic-'+role+'-ordered.sql');restore_path.write_bytes(restore_bytes);restore_path.chmod(0o600)
            native_import(created[1],restore_bytes);result=export(created[1],payload[role]);assert fingerprint(result)==fingerprint(payload[role]);assert query(created[1],'PRAGMA foreign_key_check')==[]
            restored[role]=result
            reports.append({'role':role,'native_export_download_import':'passed','restore_statement_order':'all tables, dependency-ordered original inserts, then original indexes/triggers','sql_bytes':len(data),'sql_sha256':hashlib.sha256(data).hexdigest(),'rows':sum(len(t['rows']) for t in result['tables'].values()),'tables':len(result['tables']),'exact_schema_data_and_foreign_keys':'passed','actual_account_databases_read':False})
            print(json.dumps(reports[-1]),flush=True)
        finally:
            for db in reversed(created):api('/d1/database/'+db,method='DELETE');created_all.remove(db)
    path=Path('work/synthetic-recovery-restored.json');path.write_text(json.dumps(restored));path.chmod(0o600)
finally:
    Path('work/native-d1-recovery-report.json').write_text(json.dumps({'results':reports,'temporary_database_cleanup_complete':not created_all,'production_and_operational_staging_data_used':False,'signed_urls_or_credentials_logged':False},indent=2)+'\n')
