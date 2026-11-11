# Official Cloudflare agent integration — 2026-11-11

**Skills and Codex configuration are installed. MCP connection and OAuth authorization are blocked by the managed environment's network policy. No Cloudflare MCP tools are currently callable.** Existing API access was tested separately and must not be confused with an OAuth/MCP connection.

## Instructions followed

The requested [official setup prompt](https://developers.cloudflare.com/agent-setup/prompt.md) could not be fetched directly: the proxy rejected the CONNECT request with HTTP 403. Its exact source was read from [Cloudflare's official documentation repository](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/agent-setup/prompt.md). The [Codex-specific guide](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/agent-setup/codex.mdx) and [official MCP repository](https://github.com/cloudflare/mcp) were also read.

Executed the Codex instructions using the installed Codex CLI 0.163.0:

```sh
npx -y skills add cloudflare/skills --skill '*' --yes --global --agent codex
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare --no-browser
```

All 22 skills installed successfully under `~/.agents/skills/`. The MCP entry is present in the current user's default `~/.codex/config.toml`, enabled with Streamable HTTP and the official URL. No bearer-token setting, authorization header, API credential or OAuth secret was added to it. The login command failed during OAuth metadata discovery; it never produced an authorization link or obtained a grant. An API token was not substituted for OAuth or sent to the MCP hostname.

The optional beta `cf` CLI was not installed. This project continues to use its existing Wrangler dependency and manifests. The skills collection includes `cf-cli` guidance, which is documentation, not installation of that CLI.

## Repository setup and provenance

The official skill installer was also run in project scope so the files can survive a repository checkout:

- `.agents/skills/`: 22 skills, 232 files, byte-for-byte verified against official source commit `cbf893b954222276bf1af57e5f23379231e0efb9`.
- `.agents/cloudflare-provenance.json`: upstream commit, installer version 1.8.1 and SHA-256 hashes.
- `.agents/CLOUDFLARE_LICENSE`: upstream license.
- `skills-lock.json`: installer-generated source lock.
- `.codex/config.toml`: secret-free project MCP registration.
- `scripts/setup-cloudflare-agent.py`: validates the vendored skills and registers/preserves the official MCP URL without deploying anything or silently changing custom authentication. `--verify-only` validates files without touching Codex configuration.
- `AGENTS.md`: directs future agents to this setup report and the existing Wrangler workflow.

The setup helper was executed successfully. Native Codex app-server `skills/list` also recognized all 22 unique skills in the project and current global installation. This was an administrative discovery call, not a model/sub-agent task.

## Persistence: verified limits

| Layer | What was actually verified | Future Cloud task status |
|---|---|---|
| Repository skills | A separate local checkout copy exposed all 22 project skills to native Codex discovery | Files persist when the task checks out the branch containing them; hosted discovery still needs a fresh-task check |
| Project MCP config | Native `config/read` found the official URL in the separate checkout | **Disabled for an untrusted project.** A process-only trust override did not bypass this gate; no permanent trust setting was added |
| Current global MCP config | `codex mcp list/get` show the URL enabled | Local machine state only; not proof that another task receives the same home directory |
| OAuth | Metadata discovery failed; no authorization was completed | No authenticated session exists to preserve; any future credential persistence must be verified through the supported host credential store |
| Managed environment | Observed current published configuration remains revision 1 with the original five custom allowed hosts | No reusable environment setup/publish change was made. Available tools cannot edit/publish that configuration or start an independent future Cloud task |
| Current hosted agent tools | No Cloudflare connector tools are exposed; native MCP handshake also failed and reported an empty tools map | Local registration does not inject tools into the running hosted chat |

**Cross-task availability is not established.** The separate-checkout test proves native local discovery of repository skills, not a new hosted Cloud task. There is no claim that a restart alone fixes managed Cloud integration. Future tasks must use the branch containing these files and a supported host MCP configuration/project-trust mechanism. If the environment uses a setup script, attach the prepared helper through the environment's supported setup/settings flow, save/publish the reusable environment, and select that published version for future tasks. Even then, confirm that the actual task runtime exposes the MCP tools.

Do not copy OAuth tokens or an entire authenticated home directory into Git or an environment image. A real fresh-task check must confirm tool discovery and read-only account access, then verify whether authentication survived or requires a new official login. The current environment API credential remains a separate configured secret, not evidence of OAuth persistence.

## Actual tools and authentication status

The official server advertises `docs`, `search`, `execute` and `whoami` in its current README. These are **documented tools, not tools successfully discovered in this environment**. Native Codex `mcpServerStatus/list` returned:

- server: `cloudflare`, origin: `https://mcp.cloudflare.com`;
- tools: empty;
- auth status: unknown;
- handshake failure while sending the MCP initialize request because the HTTP request could not reach the endpoint.

Current working access is the configured API credential and existing Wrangler installation. No OAuth permissions or MCP capability claims can be made until the official connection is authorized and its tool inventory is retrieved.

## Read-only account checks

See [safe API evidence](review/cloudflare-agent-2026-11-11/access-checks.json), [native discovery evidence](review/cloudflare-agent-2026-11-11/native-discovery.json) and [separate-checkout evidence](review/cloudflare-agent-2026-11-11/persistence-check.json).

| Check using existing API credential | Observed result |
|---|---|
| Token verification | HTTP 200; active |
| Workers | HTTP 200; all 9 existing Workers listed, including `operationnorthpole` and the production/staging booking, scheduler, notification and private site services |
| D1 | HTTP 200; all 4 booking/email production/staging databases listed |
| D1 query access | Read-only `SELECT name FROM d1_migrations ORDER BY id` succeeded on all four; booking 0001–0005 and email 0001 visible |
| Zero Trust Access applications | HTTP 200; empty list. No application is visible to this credential to validate an individual policy against; exact grant introspection is unavailable |
| Access organization and users | HTTP 403, Cloudflare code 10000: Authentication error |
| Zone and Worker custom domains | HTTP 200; `santablizard.com` active, apex/www point to `operationnorthpole` |
| DNS record listing | HTTP 403, code 10000 |
| API permission catalog | HTTP 403, code 9109. Exact granted scope inventory cannot be introspected with this credential |
| Public HTTPS | `/` and `/services` 200; `/book`, `/hq`, `/api/bookings` and `/elf-notes` 404 |

Worker write permissions were not tested. Successful listing or a D1 read query does not prove deployment, data mutation, DNS editing or Access policy editing is authorized. Earlier launch work observed Access/Turnstile write denials; no write request was repeated during this setup. Scoped read access was verified directly; OAuth scopes remain unknown.

The public Worker still uses version `29f336d2-5f3a-413b-aca6-cb5e4ede71e0`. Activation flags on all nine Workers remain off, including public intake, HQ, provider delivery, OAuth, optional notes and automatic retention. No deployment, Cloudflare configuration mutation, SQL write, customer-row read, notification or production-data change was performed during validation. The only D1 POST requests contained the explicitly read-only SELECT above.

## Remaining owner/host actions

1. Add `developers.cloudflare.com` and `mcp.cloudflare.com` to the current environment's outbound allowed hosts, preserving existing entries, and save/apply the change. Both are currently blocked by the enforced policy. No environment-edit tool is available in this session. The existing API secret must stay scoped to `api.cloudflare.com`; do not add it as an authorization header for MCP.
2. Once reachable, run the supported Codex OAuth login flow from this environment and present its official authorization link to the owner. The owner must sign in and review the requested account/permissions. Request only the read capabilities needed for these checks. If OAuth discovery redirects to another blocked host, report that exact host before requesting an additional allowlist entry. Never ask for credentials or token values in chat.
3. Retrieve the actual MCP tool list and authenticated identity, then repeat Workers, D1, Access and zone checks through MCP. Keep all requests read-only. Request a specific additional OAuth scope only if the server identifies it as missing; the existing token's permission failures do not describe a future OAuth grant.
4. Configure the supported hosted Codex MCP integration and published reusable environment as needed, then run a genuinely new Cloud task to verify skills, tool discovery and OAuth persistence. Local installation and the separate-checkout test do not complete this step.

The network-change question remains pending. No authorization was inferred from the absence of a reply, and no production activation is part of this setup.
