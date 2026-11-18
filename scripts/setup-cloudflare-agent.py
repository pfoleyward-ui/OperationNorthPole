"""Validate vendored official skills and register the MCP URL; no Cloudflare writes.

Use this as an explicit environment setup step. It does not perform unattended
OAuth or establish that the hosting Cloud task runner loads local MCP config.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'.agents/cloudflare-provenance.json').read_text())
for item in manifest['files']:
    path=root/item['path']
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
        raise SystemExit('Skill integrity check failed: '+item['path'])
print(f"Verified {manifest['skill_count']} official Cloudflare skills ({len(manifest['files'])} files).")
if '--verify-only' in sys.argv:
    raise SystemExit(0)
if not shutil.which('codex'):
    raise SystemExit('Codex CLI is unavailable. Project files are prepared; MCP registration is not performed.')
result=subprocess.run(['codex','mcp','get','cloudflare','--json'],cwd=root,capture_output=True,text=True)
if result.returncode==0:
    config=json.loads(result.stdout)
    transport=config.get('transport',{})
    if transport.get('url')!='https://mcp.cloudflare.com/mcp':
        raise SystemExit('Existing cloudflare MCP uses another URL; preserved without modification.')
    if not config.get('enabled',True):
        raise SystemExit('Existing cloudflare MCP is disabled; preserved for review.')
    if transport.get('bearer_token_env_var') or transport.get('http_headers') or transport.get('env_http_headers') or transport.get('http_headers_helper'):
        raise SystemExit('Existing cloudflare MCP has custom authentication; preserved. Review before OAuth setup.')
    print('Official Cloudflare MCP URL is registered; existing configuration preserved.')
else:
    try:
        registered=subprocess.run(['codex','mcp','add','cloudflare','--url','https://mcp.cloudflare.com/mcp'],cwd=root,capture_output=True,text=True,timeout=30)
    except subprocess.TimeoutExpired:
        raise SystemExit('MCP setup is awaiting authentication or network access. Check registration privately; authorize OAuth explicitly.')
    if registered.returncode:
        raise SystemExit('MCP registration did not finish. Check network policy and Codex configuration privately.')
    print('Registered the official Cloudflare MCP URL.')
print('OAuth still requires a reachable MCP endpoint and owner authorization through codex mcp login cloudflare.')
print('No Workers, databases, website settings, delivery flags, or production data were modified.')
