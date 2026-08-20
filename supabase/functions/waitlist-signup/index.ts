import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const allowedOrigins = new Set([
  'https://thirtynights-landing-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:3001',
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const platforms = new Set(['both', 'ios', 'android']);

function responseHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

function jsonResponse(origin: string, body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: responseHeaders(origin) });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') ?? '';

  if (!allowedOrigins.has(origin)) {
    return Response.json({ error: 'origin_not_allowed' }, { status: 403 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: responseHeaders(origin) });
  }

  if (request.method !== 'POST') {
    return jsonResponse(origin, { error: 'method_not_allowed' }, 405);
  }

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonResponse(origin, { error: 'content_type_must_be_json' }, 415);
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 4096) {
    return jsonResponse(origin, { error: 'payload_too_large' }, 413);
  }

  const body = await request.json().catch(() => null) as {
    email?: unknown;
    platform?: unknown;
    company?: unknown;
  } | null;

  // A hidden honeypot lets ordinary visitors succeed while quietly discarding
  // basic form-bot submissions. It deliberately stores no tracking data.
  if (typeof body?.company === 'string' && body.company.length > 0) {
    return jsonResponse(origin, { joined: true });
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const platform = typeof body?.platform === 'string' ? body.platform.trim().toLowerCase() : 'both';

  if (email.length < 3 || email.length > 254 || !emailPattern.test(email)) {
    return jsonResponse(origin, { error: 'invalid_email' }, 400);
  }

  if (!platforms.has(platform)) {
    return jsonResponse(origin, { error: 'invalid_platform' }, 400);
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await service.rpc('join_waitlist', {
    p_email: email,
    p_platform: platform,
  });

  if (error) {
    console.error('waitlist_signup_failed', error.code ?? 'unknown');
    return jsonResponse(origin, { error: 'signup_failed' }, 500);
  }

  return jsonResponse(origin, { joined: true });
});
