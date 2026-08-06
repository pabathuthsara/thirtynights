/**
 * Exchanges the one-shot Apple authorization code for a refresh token and
 * stores it against the calling user.
 *
 * The device calls this immediately after a successful native Apple sign-in.
 * It is deliberately best-effort from the client's point of view — a failure
 * here must not block someone from signing in — but without it there is no
 * token to revoke at deletion time, which is what guideline 5.1.1(v) checks.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

import { exchangeAuthorizationCode, isAppleRevocationConfigured } from '../_shared/apple.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authorization = request.headers.get('authorization');
  if (!authorization) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => null) as { code?: string } | null;
  if (!body?.code) return Response.json({ error: 'authorization_code_required' }, { status: 400 });

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response('Authenticated account required', { status: 401 });

  // Not an error state: a project that has not finished Apple server-to-server
  // setup should still sign people in. It just cannot revoke later, which the
  // launch checklist tracks.
  if (!isAppleRevocationConfigured()) return Response.json({ stored: false, reason: 'not_configured' });

  try {
    const refreshToken = await exchangeAuthorizationCode(body.code);
    if (!refreshToken) return Response.json({ stored: false, reason: 'no_refresh_token' });

    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await service.rpc('store_apple_refresh_token', {
      target_user: userData.user.id,
      token: refreshToken,
    });
    if (error) throw error;
    return Response.json({ stored: true });
  } catch (error) {
    console.error('apple_identity_store_failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'apple_identity_failed' }, { status: 500 });
  }
});
