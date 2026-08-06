import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

import { revokeRefreshToken } from '../_shared/apple.ts';

async function objectPaths(client: ReturnType<typeof createClient>, bucket: string, userId: string) {
  const paths: string[] = [];
  const { data: roots, error: rootError } = await client.storage.from(bucket).list(userId, { limit: 1000 });
  if (rootError) throw rootError;
  for (const root of roots ?? []) {
    if (root.id) paths.push(`${userId}/${root.name}`);
    else {
      const { data: children, error } = await client.storage.from(bucket).list(`${userId}/${root.name}`, { limit: 1000 });
      if (error) throw error;
      paths.push(...(children ?? []).filter((child) => child.id).map((child) => `${userId}/${root.name}/${child.name}`));
    }
  }
  return paths;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authorization = request.headers.get('authorization');
  if (!authorization) return new Response('Unauthorized', { status: 401 });
  const body = await request.json().catch(() => null) as { confirm?: string } | null;
  if (body?.confirm !== 'DELETE') return new Response('Confirmation required', { status: 400 });

  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response('Authenticated account required', { status: 401 });

  const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = userData.user.id;
  const userHashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const userHash = [...new Uint8Array(userHashBytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const { data: deletion, error: deletionError } = await service.from('deletion_requests').insert({ user_id: userId, user_hash: userHash, status: 'processing' }).select('id').single();
  if (deletionError) return Response.json({ error: 'deletion_audit_failed' }, { status: 500 });

  try {
    // Apple first. Guideline 5.1.1(v) requires that deleting an account revokes
    // the tokens Apple issued, and once `auth.admin.deleteUser` runs the
    // identity row is gone — so a failure here has to stop the deletion while
    // it is still retryable, not leave an unrevocable orphan behind.
    const { data: appleToken, error: appleTokenError } = await service.rpc('get_apple_refresh_token', { target_user: userId });
    if (appleTokenError) throw appleTokenError;
    if (appleToken) await revokeRefreshToken(appleToken as string);

    const revenueCatKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!revenueCatKey) throw new Error('revenuecat_delete_not_configured');
    const revenueCatResponse = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${revenueCatKey}`, 'Content-Type': 'application/json' },
    });
    if (!revenueCatResponse.ok && revenueCatResponse.status !== 404) throw new Error(`revenuecat_delete_${revenueCatResponse.status}`);
    for (const bucket of ['recordings', 'report-audio']) {
      const paths = await objectPaths(service, bucket, userId);
      for (let offset = 0; offset < paths.length; offset += 100) {
        const { error } = await service.storage.from(bucket).remove(paths.slice(offset, offset + 100));
        if (error) throw error;
      }
    }
    const { error } = await service.auth.admin.deleteUser(userId, false);
    if (error) throw error;
    await service.from('deletion_requests').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', deletion.id);
    return Response.json({ deleted: true });
  } catch (error) {
    await service.from('deletion_requests').update({ status: 'failed', error_code: 'delete_failed' }).eq('id', deletion.id);
    console.error('account_deletion_failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ error: 'delete_failed' }, { status: 500 });
  }
});
