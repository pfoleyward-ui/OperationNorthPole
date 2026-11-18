"""Pre-upload staging assets with session JWTs; never deploys or changes routes.

Uses inherited proxy/CA settings. Keeps API and temporary credentials in memory.
Run after building wrangler.site.staging.jsonc, then deploy with that manifest.
"""
import base64
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / '.open-next/assets'
CONFIG = json.loads((ROOT / 'wrangler.site.staging.jsonc').read_text())

def require(condition):
    if not condition:
        raise RuntimeError('Unsafe staging asset configuration; refusing upload')

require(CONFIG['name'] == 'operation-north-pole-site-staging')
require(CONFIG['workers_dev'] is False and CONFIG['preview_urls'] is False)
require(not CONFIG.get('routes'))
require(CONFIG['assets']['directory'] == '.open-next/assets')
require(not (ASSETS / '.assetsignore').exists())
require(not any(p.is_symlink() for p in ASSETS.rglob('*')))
require(CONFIG['vars']['SITE_STAGING_ENABLED'] == 'true')
require(CONFIG['vars']['PUBLIC_INTAKE_ENABLED'] == 'false')
require(CONFIG['assets']['run_worker_first'] is True)
BASE = 'https://api.cloudflare.com/client/v4/accounts/' + os.environ['CLOUDFLARE_ACCOUNT_ID']

def request(path, body, token, content_type='application/json'):
    req = urllib.request.Request(BASE + path, data=body, headers={
        'Authorization': 'Bearer ' + token, 'Content-Type': content_type})
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            value = json.load(response)
            if not value.get('success'):
                raise RuntimeError('Cloudflare request unsuccessful')
            return value['result']
    except urllib.error.URLError as error:
        if not isinstance(error, urllib.error.HTTPError):
            raise RuntimeError('Cloudflare transport failed; rerun to resume missing assets') from None
        raise RuntimeError(f'Cloudflare HTTP {error.code}') from None

# Match the installed, pinned Wrangler content-and-extension hash algorithm.
manifest = json.loads(subprocess.check_output(['node', '-e', '''
const fs=require('node:fs'),path=require('node:path'),blake=require('blake3-wasm');
const dir='.open-next/assets',manifest={};
for(const rel of fs.readdirSync(dir,{recursive:true})) {
 const p=path.join(dir,rel);if(!fs.statSync(p).isFile())continue;
 const data=fs.readFileSync(p);
 manifest['/'+rel.split(path.sep).join('/')]= {
 hash:blake.hash(data.toString('base64')+path.extname(p).substring(1)).toString('hex').slice(0,32),size:data.length};
}
process.stdout.write(JSON.stringify(manifest));
'''], cwd=ROOT, text=True))
session = request('/workers/scripts/' + CONFIG['name'] + '/assets-upload-session',
                  json.dumps({'manifest': manifest}).encode(), os.environ['CLOUDFLARE_API_TOKEN'])
by_hash = {entry['hash']: ASSETS / name.lstrip('/') for name, entry in manifest.items()}
uploaded = 0
# Bound multipart requests to one asset to avoid proxy request-size limits.
for bucket in ([h] for group in session['buckets'] for h in group):
    boundary = 'onp' + uuid.uuid4().hex
    parts = []
    for asset_hash in bucket:
        path = by_hash[asset_hash]
        mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{asset_hash}"; filename="{asset_hash}"\r\nContent-Type: {mime}\r\n\r\n').encode()
                     + base64.b64encode(path.read_bytes()) + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    request('/workers/assets/upload?base64=true', b''.join(parts), session['jwt'],
            'multipart/form-data; boundary=' + boundary)
    uploaded += len(bucket)
    print(json.dumps({'uploaded_assets': uploaded}), flush=True)
print(json.dumps({'success': True, 'manifest_assets': len(manifest), 'uploaded_assets': uploaded}))
