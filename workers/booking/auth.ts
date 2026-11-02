import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

export interface AccessEnv {
  HQ_ENABLED?: string;
  HQ_ORIGIN?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  /** JSON subject arrays, provisioned by an administrator, never a request field. */
  SANTA_SUBJECTS?: string;
  BACKUP_SUBJECTS?: string;
  BACKUP_ESCALATION_ENABLED?: string;
}
export type Principal = Readonly<{ sub: string; role: 'santa' | 'backup' }>;
export class AccessDenied extends Error {}
const resolvers = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function subjects(value?: string): string[] {
  const parsed: unknown = JSON.parse(value || '[]');
  if (!Array.isArray(parsed) || parsed.length > 20 || parsed.some(s => typeof s !== 'string' || !s || s.length > 200)) throw new AccessDenied();
  return parsed;
}
export async function authenticate(request: Request, env: AccessEnv, fetcher?: typeof fetch, now = Date.now()): Promise<Principal> {
  if (env.HQ_ENABLED !== 'true' || !env.ACCESS_AUDIENCE || !env.ACCESS_TEAM_DOMAIN ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) throw new AccessDenied();
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16384) throw new AccessDenied();
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  let resolver = fetcher ? undefined : resolvers.get(issuer);
  if (!resolver) {
    resolver = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
      ...(fetcher ? { [customFetch]: fetcher } : {}),
    });
    if (!fetcher) resolvers.set(issuer, resolver);
  }
  try {
    const { payload } = await jwtVerify(token, resolver, {
      issuer, audience: env.ACCESS_AUDIENCE, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'aud', 'iss'], currentDate: new Date(now),
      maxTokenAge: '24h', clockTolerance: 0,
    });
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 200) throw new AccessDenied();
    // Cloudflare Access must use an interactive identity policy, not service tokens.
    if (typeof payload.email !== 'string' || !payload.email || (payload.iat as number) > now / 1000) throw new AccessDenied();
    if (subjects(env.SANTA_SUBJECTS).includes(payload.sub)) return Object.freeze({ sub: payload.sub, role: 'santa' });
    if (env.BACKUP_ESCALATION_ENABLED === 'true' && subjects(env.BACKUP_SUBJECTS).includes(payload.sub)) return Object.freeze({ sub: payload.sub, role: 'backup' });
  } catch { throw new AccessDenied(); }
  throw new AccessDenied();
}
