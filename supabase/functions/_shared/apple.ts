/**
 * Sign in with Apple server-to-server helpers.
 *
 * App Review guideline 5.1.1(v) is not satisfied by deleting our own copy of an
 * account: an app that offers Sign in with Apple must also call Apple's REST
 * API to revoke the tokens it was issued. Revocation needs a refresh token, and
 * a refresh token only exists if we exchanged the one-shot authorization code
 * at sign-in — hence `exchangeAuthorizationCode`, which runs then, and
 * `revokeRefreshToken`, which runs at deletion.
 *
 * Every value here is read from function secrets. If they are absent the module
 * reports itself unconfigured rather than throwing, so a project that has not
 * finished Apple setup still signs in and still deletes.
 */

const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';

/** Apple caps the client secret at six months; ten minutes is all we need. */
const CLIENT_SECRET_TTL_SEC = 600;

type AppleConfig = { teamId: string; keyId: string; clientId: string; privateKey: string };

function appleConfig(): AppleConfig | null {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  // For a native iOS sign-in this is the app's bundle identifier, NOT a
  // Services ID. Services IDs belong to the web/Android redirect flow, and
  // using one here makes Apple answer invalid_client.
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !clientId || !privateKey) return null;
  return { teamId, keyId, clientId, privateKey };
}

export function isAppleRevocationConfigured() {
  return appleConfig() !== null;
}

function base64url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Secret managers routinely flatten a pasted .p8 into one line with literal
 * backslash-n, and just as routinely keep the real newlines. Accept both.
 */
async function importSigningKey(pem: string) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function clientSecret(config: AppleConfig) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: config.keyId };
  const payload = {
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + CLIENT_SECRET_TTL_SEC,
    aud: 'https://appleid.apple.com',
    sub: config.clientId,
  };
  const encoder = new TextEncoder();
  const signingInput = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(payload)))}`;
  const key = await importSigningKey(config.privateKey);
  // WebCrypto emits the raw r||s pair ES256 wants; no DER unwrapping needed.
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

/**
 * Trade the authorization code from `AppleAuthentication.signInAsync` for a
 * refresh token. Returns null when Apple setup is incomplete, so a caller can
 * treat that as "nothing to store" instead of an error.
 */
export async function exchangeAuthorizationCode(code: string): Promise<string | null> {
  const config = appleConfig();
  if (!config) return null;
  const response = await fetch(APPLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await clientSecret(config),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`apple_code_exchange_${response.status}:${detail.slice(0, 200)}`);
  }
  const payload = await response.json() as { refresh_token?: string };
  return payload.refresh_token ?? null;
}

/**
 * Revoke a stored refresh token. Apple answers 200 with an empty body on
 * success and also for a token it no longer recognises, which is the outcome we
 * want anyway.
 */
export async function revokeRefreshToken(refreshToken: string) {
  const config = appleConfig();
  if (!config) throw new Error('apple_revocation_not_configured');
  const response = await fetch(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await clientSecret(config),
      token: refreshToken,
      token_type_hint: 'refresh_token',
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`apple_revoke_${response.status}:${detail.slice(0, 200)}`);
  }
}
